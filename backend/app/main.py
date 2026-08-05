"""AKAAR FastAPI app entrypoint.

Startup (lifespan): create all tables on the Supabase engine, ensure the MinIO bucket exists.
Registers auth/crafts/jobs routers.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (register tables on Base.metadata)
from .config import settings
from .db import Base, engine
from .routers import auth, crafts, jobs


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    from .storage import ensure_bucket_exists

    ensure_bucket_exists()
    yield


app = FastAPI(title="AKAAR API", lifespan=lifespan)

_default_origins = ["http://localhost:5173", "http://localhost:3000"]
_extra_origins = [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins + _extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(auth.router)
app.include_router(crafts.router)
app.include_router(jobs.router)
