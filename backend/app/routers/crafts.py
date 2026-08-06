"""Craft routes: create, photo upload, generate (enqueue job), get (public/private), list."""
import os
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import security
from ..db import get_db
from ..models import Craft, Job, JobStatus
from ..queue import enqueue_job
from ..queue import enqueue_job
from ..storage import delete_file, get_browser_url, upload_file
from .auth import get_optional_user

router = APIRouter(prefix="/api/crafts", tags=["crafts"])

# Upload-existing-model endpoint limits.
ALLOWED_MODEL_EXTENSIONS = {".glb", ".obj", ".usdz"}
MAX_MODEL_SIZE = 100 * 1024 * 1024  # 100 MB
MODEL_CONTENT_TYPES = {
    ".glb": "model/gltf-binary",
    ".obj": "text/plain",
    ".usdz": "model/vnd.usdz+zip",
}


class CraftCreate(BaseModel):
    title: str
    craft_type: Optional[str] = None
    material: Optional[str] = None
    technique: Optional[str] = None
    story: Optional[str] = None
    dimensions: Optional[str] = None
    weight: Optional[float] = None
    location: Optional[str] = None
    year: Optional[int] = None


class CraftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    title: str
    craft_type: Optional[str] = None
    material: Optional[str] = None
    technique: Optional[str] = None
    story: Optional[str] = None
    dimensions: Optional[str] = None
    weight: Optional[float] = None
    location: Optional[str] = None
    year: Optional[int] = None
    license: Optional[str] = None
    is_public: bool
    photos: list
    model_key: Optional[str] = None
    owner_name: Optional[str] = None
    model_url: Optional[str] = None
    thumbnail_url: Optional[str] = None  # first photo, browser-reachable (My Library)
    status: Optional[str] = None  # latest job status: queued/processing/completed/failed
    job_id: Optional[int] = None  # latest job id (routes the Processing screen)
    created_at: datetime
    updated_at: datetime


def _get_owned_craft(craft_id: int, user_id: int, db: Session) -> Craft:
    craft = db.get(Craft, craft_id)
    if craft is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Craft not found")
    if craft.owner_id != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your craft")
    return craft


def _attach_library_fields(craft: Craft) -> Craft:
    """My Library fields: first-photo thumbnail + latest job status/job_id.

    ponytail: reads the full jobs relationship (N+1 acceptable at MVP scale);
    latest job = highest id (serial). setattr on the ORM instance works because,
    like owner_name/model_url, these are plain attributes pydantic reads via
    from_attributes.
    """
    if craft.photos:
        craft.thumbnail_url = get_browser_url(craft.photos[0])
    if craft.jobs:
        latest = max(craft.jobs, key=lambda j: j.id)
        craft.status = latest.status.value
        craft.job_id = latest.id
    return craft


@router.post("/", response_model=CraftOut, status_code=status.HTTP_201_CREATED)
def create_craft(
    body: CraftCreate,
    user_id: int = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    craft = Craft(owner_id=user_id, **body.model_dump())
    db.add(craft)
    db.commit()
    db.refresh(craft)
    return craft


@router.post("/{craft_id}/photos", response_model=dict)
async def upload_photos(
    craft_id: int,
    files: List[UploadFile] = File(...),
    user_id: int = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    craft = _get_owned_craft(craft_id, user_id, db)
    photos = list(craft.photos) if craft.photos else []
    for i, f in enumerate(files):
        data = await f.read()
        name = os.path.basename(f.filename or f"photo_{i}")
        key = f"crafts/{craft_id}/{i}_{name}"
        upload_file(data, key, f.content_type or "application/octet-stream")
        photos.append(key)
    craft.photos = photos
    db.commit()
    return {"photo_urls": photos}


@router.post("/{craft_id}/generate", response_model=dict)
def generate(
    craft_id: int,
    user_id: int = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    craft = _get_owned_craft(craft_id, user_id, db)
    job = Job(craft_id=craft.id, status=JobStatus.queued)
    db.add(job)
    db.commit()
    enqueue_job(str(job.id), str(craft.id))
    return {"job_id": job.id, "status": job.status.value}


@router.post("/{craft_id}/model", response_model=CraftOut)
async def upload_model(
    craft_id: int,
    file: UploadFile = File(...),
    user_id: int = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a pre-made model file (.glb/.obj/.usdz) directly — no AI job involved.

    Stores the file in MinIO, sets craft.model_key, and creates an immediately-completed
    Job so the craft's status is consistent with the AI-generated path (Library shows
    "Completed"). No queue/worker involvement.
    """
    craft = _get_owned_craft(craft_id, user_id, db)  # 404 if missing, 403 if not owner

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_MODEL_EXTENSIONS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unsupported model type '.{ext or 'none'}' — allowed: .glb, .obj, .usdz",
        )

    data = await file.read()
    if len(data) > MAX_MODEL_SIZE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Model file too large (max 100 MB)")

    name = os.path.basename(file.filename or f"model{ext}")
    key = f"models/{craft_id}/{name}"
    upload_file(data, key, MODEL_CONTENT_TYPES[ext])
    craft.model_key = key

    job = Job(
        craft_id=craft.id,
        status=JobStatus.completed,
        progress=100,
        completed_at=datetime.utcnow(),
    )
    db.add(job)
    db.commit()  # commit bumps craft.updated_at via onupdate

    # Keep the response consistent with GET /{craft_id}.
    craft.owner_name = craft.owner.full_name if craft.owner else None
    craft.model_url = get_browser_url(craft.model_key) if craft.model_key else None
    return craft


def _set_public(craft_id: int, user_id: int, db: Session, is_public: bool) -> Craft:
    craft = _get_owned_craft(craft_id, user_id, db)
    craft.is_public = is_public
    db.commit()  # updated_at auto-bumped via onupdate
    # Keep the response consistent with GET /{craft_id}.
    craft.owner_name = craft.owner.full_name if craft.owner else None
    craft.model_url = get_browser_url(craft.model_key) if craft.model_key else None
    return craft


@router.patch("/{craft_id}/publish", response_model=CraftOut)
def publish_craft(
    craft_id: int,
    user_id: int = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    return _set_public(craft_id, user_id, db, is_public=True)


@router.patch("/{craft_id}/unpublish", response_model=CraftOut)
def unpublish_craft(
    craft_id: int,
    user_id: int = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    return _set_public(craft_id, user_id, db, is_public=False)


@router.delete("/{craft_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_craft(
    craft_id: int,
    user_id: int = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    craft = _get_owned_craft(craft_id, user_id, db)  # 404 if missing, 403 if not owner
    # Best-effort removal of stored photos/model; the DB record is deleted regardless.
    for key in list(craft.photos or []) + ([craft.model_key] if craft.model_key else []):
        try:
            delete_file(key)
        except Exception:
            pass  # TODO: orphaned MinIO object if a delete fails — log later
    # No FK cascade on jobs.craft_id — delete dependent jobs first.
    db.query(Job).filter(Job.craft_id == craft_id).delete(synchronize_session=False)
    db.delete(craft)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{craft_id}", response_model=CraftOut)
def get_craft(
    craft_id: int,
    user_id: Optional[int] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    craft = db.get(Craft, craft_id)
    if craft is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Craft not found")
    # Public => guest-ok; private => owner only.
    if not craft.is_public and craft.owner_id != user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue")
    craft.owner_name = craft.owner.full_name if craft.owner else None
    craft.model_url = get_browser_url(craft.model_key) if craft.model_key else None
    return craft


@router.get("/", response_model=List[CraftOut])
def list_crafts(
    owner: Optional[int] = None,
    is_public: Optional[bool] = None,
    skip: int = 0,
    limit: int = 50,
    user_id: Optional[int] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    # Home/feed: guests see public crafts; logged-in users also get their own
    # (incl. private) results. Explicit owner => the owner's own library only.
    query = db.query(Craft)
    if owner is not None:
        if owner != user_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Can only list your own library")
        query = query.filter(Craft.owner_id == owner)
    elif user_id is not None:
        query = query.filter(or_(Craft.owner_id == user_id, Craft.is_public == True))
    else:
        query = query.filter(Craft.is_public == True)
    if is_public is not None:
        query = query.filter(Craft.is_public == is_public)
    crafts = query.order_by(Craft.created_at.desc()).offset(skip).limit(limit).all()
    for craft in crafts:
        _attach_library_fields(craft)
    return crafts