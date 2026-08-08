"""
Local, no-cost content moderation service for AKAAR's instantmesh-proxy.

Replaces the OpenAI-based checks (Moderation API + gpt-4o-mini classifier) with two models
that run entirely on this box, free forever, no per-request API cost:

  1. CLIP (openai/clip-vit-base-patch32, open-source weights) zero-shot image classification
     — answers BOTH questions the OpenAI version needed two separate calls for: is this a
     craft/art object, AND is it explicit/inappropriate? One classification over a label set
     covering both. This is the same underlying technique Stable Diffusion's own safety
     checker uses.
  2. Detoxify (unitary/toxic-bert, open-source weights) for the text-prompt side (Co-Create's
     redesign prompt) — toxicity/obscenity/threat/insult/identity-hate scoring.

Runs on CPU by default (see requirements.txt: torch installed from the CPU-only index) —
single-image zero-shot classification doesn't need GPU speed, and staying off the GPU means
this never contends with InstantMesh/Fooocus for the one GPU on this box, so it needs no
queue coordination the way those two do.

Called by instantmesh-proxy/server.js via MODERATION_SERVICE_URL, same pattern as
INSTANTMESH_TARGET/FOOOCUS_TARGET — a local target this proxy forwards pre-screening
requests to before ever reaching InstantMesh or Fooocus.
"""
import base64
import io
import os

import torch
from fastapi import FastAPI
from PIL import Image
from pydantic import BaseModel
from transformers import CLIPModel, CLIPProcessor

app = FastAPI(title="AKAAR moderation service")

# ── Models (loaded once at startup, not per-request) ────────────────────────
print("Loading CLIP (openai/clip-vit-base-patch32)...")
clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
clip_model.eval()

print("Loading Detoxify (original)...")
from detoxify import Detoxify  # noqa: E402 — imported after the print so load order in logs makes sense

detoxify_model = Detoxify("original")

print("Models loaded.")

# ── Image classification: craft/art vs. everything we reject ───────────────
CRAFT_ART_LABEL = (
    "a professional photo of a handmade craft or art object, such as pottery, ceramics, "
    "a woven textile, woodwork, bamboo craft, metalwork, or a sculpture"
)
REJECT_LABELS = [
    "a photo of a person",
    "sexually explicit or nude content",
    "violent or graphic content",
    "a random photo unrelated to crafts or art",
]
ALL_LABELS = [CRAFT_ART_LABEL] + REJECT_LABELS

DETOXIFY_THRESHOLD = float(os.environ.get("DETOXIFY_THRESHOLD", "0.5"))


def classify_image(image: Image.Image):
    inputs = clip_processor(text=ALL_LABELS, images=image, return_tensors="pt", padding=True)
    with torch.no_grad():
        outputs = clip_model(**inputs)
        probs = outputs.logits_per_image.softmax(dim=1)[0].tolist()

    scores = {label: round(prob, 4) for label, prob in zip(ALL_LABELS, probs)}
    top_label = max(scores, key=scores.get)
    is_craft_art = top_label == CRAFT_ART_LABEL
    return {"is_craft_art": is_craft_art, "top_label": top_label, "scores": scores}


def classify_text(text: str):
    results = detoxify_model.predict(text)
    flagged_categories = {k: round(float(v), 4) for k, v in results.items() if v >= DETOXIFY_THRESHOLD}
    return {"flagged": len(flagged_categories) > 0, "scores": {k: round(float(v), 4) for k, v in results.items()}, "flagged_categories": flagged_categories}


def decode_data_url(data_url: str) -> Image.Image:
    # Accepts either a full "data:image/...;base64,...." URL or raw base64.
    b64 = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
    return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")


class ModerateRequest(BaseModel):
    text: str | None = None
    image_data_url: str | None = None


@app.get("/health")
def health():
    return {"status": "online"}


@app.post("/moderate")
def moderate(req: ModerateRequest):
    rejected = False
    reason = None
    details = {}

    if req.text and req.text.strip():
        text_result = classify_text(req.text)
        details["text"] = text_result
        if text_result["flagged"]:
            rejected = True
            reason = f"text flagged: {', '.join(text_result['flagged_categories'].keys())}"

    if not rejected and req.image_data_url:
        try:
            image = decode_data_url(req.image_data_url)
        except Exception as e:
            return {"rejected": True, "reason": f"could not decode image: {e}", "details": details}

        image_result = classify_image(image)
        details["image"] = image_result
        if not image_result["is_craft_art"]:
            rejected = True
            reason = f"image classified as: {image_result['top_label']}"

    return {"rejected": rejected, "reason": reason, "details": details}
