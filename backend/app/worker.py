"""Reconstruction worker (stub mode by default; INSTANTMESH_MODE=stub).

Pulls jobs off Redis, simulates the full pipeline, uploads a placeholder GLB to MinIO,
and marks the Job completed. On error the Job is failed but the loop keeps going.

No retries, no percentage updates beyond 0/100, no WebSocket (phase-2 per concept note review).
"""
from __future__ import annotations

import struct
import time
import traceback
from datetime import datetime

from sqlalchemy.exc import OperationalError

from .config import settings
from .db import SessionLocal
from .models import Craft, Job, JobStatus
from .queue import dequeue_job, enqueue_job
from .storage import get_presigned_url, upload_file


def _placeholder_glb() -> bytes:
    """Minimal valid empty GLB (12-byte header + empty JSON chunk) for stub mode."""
    json_chunk = b"{}"
    json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)  # pad to 4-byte boundary
    total = 12 + 8 + len(json_chunk)
    header = b"glTF" + struct.pack("<II", 2, total)  # magic, version=2, length
    chunk_header = struct.pack("<II", len(json_chunk), 0x4E4F534A)  # len, "JSON" chunk type
    return header + chunk_header + json_chunk


def _call_instantmesh(craft: Craft) -> str:
    """POST a craft's photos to the InstantMesh GPU API and store the returned model.

    The API contract is not documented yet: we send the photos as multipart/form-data
    and assume the response body IS the generated model file bytes (written generically).
    # TODO: adjust based on the actual API response format once known — may return JSON
    with a download URL / job id, or a non-GLB format (OBJ) instead of raw bytes.
    """
    import requests  # lazy: only imported when real mode is actually used

    if not craft.photos:
        raise RuntimeError("craft has no photos to send to InstantMesh")

    files = []
    for i, photo_key in enumerate(craft.photos):
        # Pull each photo out of MinIO (presigned GET) and forward it to the GPU box.
        with requests.get(get_presigned_url(photo_key), timeout=30) as photo_resp:
            photo_resp.raise_for_status()
            filename = photo_key.rsplit("/", 1)[-1]
            files.append((f"photo_{i}", (filename, photo_resp.content, "image/jpeg")))

    try:
        resp = requests.post(settings.instantmesh_api_url, files=files, timeout=600)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(f"InstantMesh API call failed: {exc}") from exc

    model_bytes = resp.content
    if not model_bytes:
        raise RuntimeError("InstantMesh returned an empty model response")

    model_key = f"real/{craft.id}.glb"
    upload_file(model_bytes, model_key, "model/gltf-binary")
    return model_key


def run() -> None:
    mode = settings.instantmesh_mode
    print(f"AKAAR worker started (INSTANTMESH_MODE={mode})")

    while True:
        job_data = dequeue_job(timeout_seconds=5)
        if job_data is None:
            continue

        job_id = job_data.get("job_id")
        craft_id = job_data.get("craft_id")
        print(f"Picked up job {job_id} (craft {craft_id})")

        # ponytail: the dev-box Supabase pooler DNS is flaky (transient EAI_AGAIN), so
        # creating a session can fail. Retry briefly instead of crash-looping; if it
        # still fails, re-enqueue the job so it isn't lost.
        db = None
        for attempt in range(4):
            try:
                db = SessionLocal()
                break
            except OperationalError as exc:
                print(f"  DB connect failed (attempt {attempt + 1}/4): {exc}")
                time.sleep(3)
        if db is None:
            print(f"  DB unavailable for job {job_id} — re-enqueueing and retrying later")
            enqueue_job(str(job_id), str(craft_id))
            continue

        job = None
        try:
            job = db.get(Job, job_id) if job_id is not None else None
            craft = db.get(Craft, craft_id) if craft_id is not None else None
            if job is None or craft is None:
                print(f"  Job {job_id} or craft {craft_id} not found — skipping")
                continue

            job.status = JobStatus.processing
            job.progress = 0
            db.commit()
            print(f"  Job {job_id} → processing")

            if mode == "stub":
                print(f"  [stub] Simulating reconstruction for job {job_id}...")
                time.sleep(4)
                model_key = f"stub/{craft_id}.glb"
                upload_file(_placeholder_glb(), model_key, "model/gltf-binary")
                craft.model_key = model_key
                print(f"  [stub] Uploaded placeholder {model_key}")
            else:
                if mode == "real":
                    if not settings.instantmesh_api_url:
                        # Enabled prematurely: no API endpoint configured yet, so fall back to
                        # stub behavior rather than failing every job.
                        print("  [real] WARNING: INSTANTMESH_API_URL not set — falling back to stub behavior")
                        time.sleep(4)
                        model_key = f"stub/{craft_id}.glb"
                        upload_file(_placeholder_glb(), model_key, "model/gltf-binary")
                        craft.model_key = model_key
                        print(f"  [stub] Uploaded placeholder {model_key}")
                    else:
                        # Real InstantMesh: POST photos, store returned model. Any failure
                        # (timeout/bad response/upload) raises and is caught below, which
                        # marks the job failed without crashing the worker loop.
                        print(f"  [real] Calling InstantMesh API {settings.instantmesh_api_url} for job {job_id}...")
                        craft.model_key = _call_instantmesh(craft)
                        print(f"  [real] Uploaded model {craft.model_key}")
                else:
                    print(f"  WARNING: unknown INSTANTMESH_MODE={mode!r} — falling back to stub behavior")
                    time.sleep(4)
                    model_key = f"stub/{craft_id}.glb"
                    upload_file(_placeholder_glb(), model_key, "model/gltf-binary")
                    craft.model_key = model_key
                    print(f"  [stub] Uploaded placeholder {model_key}")

            job.status = JobStatus.completed
            job.progress = 100
            job.completed_at = datetime.utcnow()
            db.commit()
            print(f"Job {job_id} completed")
        except Exception:
            db.rollback()
            if job is not None:
                job.status = JobStatus.failed
                job.error_message = traceback.format_exc()
                db.commit()
            print(f"Job {job_id} FAILED:")
            print(traceback.format_exc())
        finally:
            db.close()