"""Job routes: status polling for the Processing screen."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status as http_status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from .. import security
from ..db import get_db
from ..models import Job, JobStatus

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    job_id: int
    craft_id: int
    status: JobStatus
    progress: int
    error: Optional[str] = None


@router.get("/{job_id}", response_model=JobOut)
def get_job(
    job_id: int,
    user_id: int = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Job not found")
    if job.craft.owner_id != user_id:
        raise HTTPException(http_status.HTTP_403_FORBIDDEN, "Not your job")
    return JobOut(
        job_id=job.id,
        craft_id=job.craft_id,
        status=job.status,
        progress=job.progress,
        error=job.error_message,
    )