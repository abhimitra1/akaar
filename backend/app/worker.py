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

from .config import settings
from .db import SessionLocal
from .models import Craft, Job, JobStatus
from .queue import dequeue_job
from .storage import upload_file


def _placeholder_glb() -> bytes:
    """Minimal valid empty GLB (12-byte header + empty JSON chunk) for stub mode."""
    json_chunk = b"{}"
    json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)  # pad to 4-byte boundary
    total = 12 + 8 + len(json_chunk)
    header = b"glTF" + struct.pack("<II", 2, total)  # magic, version=2, length
    chunk_header = struct.pack("<II", len(json_chunk), 0x4E4F534A)  # len, "JSON" chunk type
    return header + chunk_header + json_chunk


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

        db = SessionLocal()
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
                # TODO: real InstantMesh integration (requires the GPU workstation; out of
                # scope for this dev environment). Not implemented — see AGENTS.md §5.
                raise NotImplementedError("INSTANTMESH_MODE != stub not implemented")

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