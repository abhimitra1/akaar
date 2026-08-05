"""Redis job queue helpers for the reconstruction pipeline (redis-py).

Queue name: "akaar:reconstruction_jobs". Simple FIFO (RPUSH/BLPOP) — no priority,
retry, or dead-letter (phase-2 per concept note review).
"""
import json
from typing import Optional

import redis

from .config import settings

QUEUE_NAME = "akaar:reconstruction_jobs"


def get_redis_client() -> redis.Redis:
    return redis.Redis(
        host=settings.redis_host,
        port=settings.redis_port,
        db=0,
        decode_responses=True,
    )


def enqueue_job(job_id: str, craft_id: str) -> None:
    payload = json.dumps({"job_id": job_id, "craft_id": craft_id})
    get_redis_client().rpush(QUEUE_NAME, payload)


def dequeue_job(timeout_seconds: int = 5) -> Optional[dict]:
    result = get_redis_client().blpop(QUEUE_NAME, timeout=timeout_seconds)
    if result is None:
        return None
    _queue, payload = result
    return json.loads(payload)


def get_queue_length() -> int:
    return get_redis_client().llen(QUEUE_NAME)