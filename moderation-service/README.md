# moderation-service

Local, no-cost content moderation for `instantmesh-proxy/` — no external API, no per-request
cost, no API key. See `main.py`'s module docstring for what it checks and why.

Uses two open-source models, downloaded once (cached under `~/.cache/huggingface` and
`~/.cache/torch`, outside this repo — nothing to gitignore there):
- **CLIP** (`openai/clip-vit-base-patch32`) — zero-shot image classification, ~600MB.
- **Detoxify** (`original`) — text toxicity classification, ~420MB.

Runs on CPU by default (`requirements.txt` installs torch from the CPU-only index) — single-
image classification doesn't need GPU speed, and staying off the GPU means this never
contends with InstantMesh/Fooocus for the one GPU on this box.

## Setup (one-time)

```powershell
cd moderation-service
python -m venv venv
./venv/Scripts/python.exe -m pip install --upgrade pip
./venv/Scripts/python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu
./venv/Scripts/python.exe -m pip install -r requirements.txt
```

(Torch installed separately first, from the CPU-only index — installing `requirements.txt`
directly would let pip pull in whatever default wheel `detoxify`'s torch dependency resolves
to, which on Windows can be a much larger CUDA-enabled build.)

## Running

```powershell
cd moderation-service
./venv/Scripts/python.exe -m uvicorn main:app --host 127.0.0.1 --port 8790
```

First startup loads both models (downloads them if not already cached — a few minutes;
instant on subsequent runs). `instantmesh-proxy/server.js` (`MODERATION_SERVICE_URL`, default
`http://127.0.0.1:8790`) needs this running before it will accept any submission — every
`/api/generate` and `/fooocus/v2/generation/image-prompt` call fails closed (rejects) if this
service is unreachable.

**Not yet set up to auto-restart** (on crash, or on this box rebooting) — unlike InstantMesh,
which has a Windows Scheduled Task for that. If this needs the same treatment, ask for it.

## API

`GET /health` → `{"status": "online"}`

`POST /moderate` — body `{"text"?: string, "image_data_url"?: string}` (either or both; a
`image_data_url` can be a full `data:image/...;base64,...` URL or raw base64). Returns:

```json
{"rejected": false, "reason": null, "details": {...}}
```

`details` carries the raw classifier scores (CLIP label probabilities, Detoxify category
scores) — useful for tuning thresholds, not currently surfaced to end users.
