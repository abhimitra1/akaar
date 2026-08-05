# AGENTS.md — Project AKAAR (Craft Digital Twin Repository)

> Read this file fully before writing code. It is the single source of context for any agent
> working on Akira's part of the group project: **the app AND the website**.

---

## 1. What AKAAR is

AKAAR is a **Physical–Digital–Physical (PDP) Craft Intelligence Platform** from Centurion
University's Waste to Wealth Lab. It preserves traditional craftsmanship by turning physical
craft objects into **Digital Twins** (3D models + rich metadata), lets students/artisans
redesign them with AI, and feeds the improved design back into a better physical object.

Tagline: *"Every Craft Has a Digital Twin."* Starts with pottery, scales to bamboo, textiles,
wood, metal, terracotta, recycled products.

**Closed loop:**
`Physical craft → photo capture → AI 3D reconstruction → digital twin (GLB/OBJ/USD + metadata)
→ repository → 3D/AR view, download, publish → remade physical craft.`

---

## 2. Deliverable scope (YOUR part)

This is a **group project**. Akira's assigned deliverable = **the app + the website**. Both are
ONE responsive web app (PWA). The split is by user flow, not by separate codebases:

- **APP (creator side):** authentication, capture, reconstruction, processing, view/AR/download/
  publish, My Library, Account Center.
- **WEBSITE (discovery side):** landing page, search & explore, public craft detail, public
  gallery, share/QR pages.

Do not build: the GPU reconstruction engine itself (that's InstantMesh, runs on a separate
Windows RTX 5080 box), or other teammates' work unless asked.

---

## 3. App flow (from AKAAR_App_Flow.pdf — 8 phases)

**Phase 0 — Auth & Onboarding**
- Sign Up: email/password, full name, role, institution, department, OTP email verify.
- Sign In: email+password, "Remember me", JWT access (15 min) + refresh (7 days), biometric
  (mobile, later), session tracking.
- Forgot Password: email → reset link / 6-digit OTP → new password → old sessions revoked.
- Account Center: edit profile, change password, avatar, active sessions, delete account,
  notification prefs.
- Auth gate: no token → `/welcome` (Sign In / Sign Up / Continue as Guest). Guests browse only.

**Phase 1 — Landing & Discovery (guest or logged in)**
- Home: featured carousel, search bar, category chips (Pottery, Bamboo…), recent uploads,
  "Start Creating" CTA, bottom nav (Home | Create | Library | Profile).
- Search & Explore: text search (title/story/tags), voice (later), filters (craft type, material,
  technique, creator, date), sort (newest/popular/downloads), semantic (later), autocomplete.
- Craft Detail: photo gallery, 3D viewer, AR ("View in my space"), creator card, metadata table,
  download (if public), related, share (QR/link/social).
- Guest vs logged in: guests can browse/search/view 3D/AR. Cannot upload/generate/download/publish
  (tapping shows "Sign in to continue").

**Phase 2 — Create a Digital Twin (logged in only)**
- Step 1 Choose Source: upload from gallery, take photo, 360° video (future), max 12 photos,
  10MB each, JPG/PNG/HEIC.
- Step 2 QR-Guided Capture: overlay grid, angle indicator (0/45/90°…), "Photo N of 12",
  auto-capture on steady hold, flash, retake.
- Step 3 Review & Edit: grid preview, reorder, delete, caption, crop/rotate, auto-enhance.
- Step 4 Metadata: title, craft type, material, technique, story, dimensions & weight,
  location/year.
- Generate: validate token → create craft record → upload photos to MinIO → push Redis job →
  return `job_id` → open Processing screen.

**Phase 3 — Processing & Real-Time Updates**
- UI: animated spinner, progress bar 0–100%, stages (Uploading / Queue position / AI reconstructing
  mesh / Baking textures / Converting to GLB / Finalizing), ETA, cancel, "keep app open" warning.
- Backend: worker pulls Redis → downloads photos from MinIO → runs InstantMesh → OBJ mesh →
  convert to GLB (trimesh) → LODs (later) → thumbnail → upload results → DB status=completed →
  push (later WS) + mobile push (later).
- Error handling: photo quality (blur/low-light), insufficient angles, GPU overload→queue delay,
  timeout 10 min, auto-retry max 2, error log visible, "try different photos".

**Phase 4 — View, AR, Download, Publish**
- 3D Viewer: rotate, zoom, pan, auto-rotate, wireframe, lighting presets, bg solid/transparent,
  fullscreen.
- AR: "View in AR", surface detection, tap to place, pinch resize, drag reposition, scale ref,
  screenshot, share.
- Download: GLB (recommended) / OBJ+MTL / USDZ / STL; quality High/Med/Low; include textures;
  progress; save to device; history logged.
- Publish: "Make Public" toggle, license picker (CC0 / CC-BY / CC-BY-SA), tags, confirm dialog,
  appears in Public Gallery, QR auto-generated, shareable link.

**Phase 5 — My Library & Public Gallery**
- My Library (private): tabs All Models / Processing / Completed / Failed / Published. Card =
  thumbnail, title, craft type, date, status badge. Tap → detail+3D. Long press → Edit/Delete/
  Share/Download. Pull-to-refresh, infinite scroll.
- Public Gallery (open): same grid, filter (craft type/material/license/date), sort (newest/
  downloaded/viewed), creator attribution, download (respects license), bookmark, share, report,
  counts visible.

**Phase 6 — Account Center & Settings**
- Profile: avatar, name, email (verified), bio, institution, department, role badge, joined,
  public link.
- Security: change password (strength meter), active sessions (revoke), logout all, 2FA/TOTP
  (later), login history.
- Preferences: push/email notifs, dark/light, language (EN/HI/OR), default download format,
  auto-publish, data usage, clear cache.
- Danger Zone: delete account → password confirm → crafts deleted/transferred → 30-day grace →
  permanent.

**Journey map:** Sign Up → Verify → Sign In → Home/Explore → Upload/Capture → Add Metadata →
Generate → Processing → View 3D → AR Preview → Download → Publish → My Library → Account.

**Every-screen NFR checklist:** auth gate, 5-tab bottom nav, back+title, loading skeletons,
empty states ("No models yet — create your first!"), error+retry, pull-to-refresh, offline
banner, toast, haptic (mobile).

---

## 4. Repository metadata schema (per craft object)

Photographs · 3D Model · Creator · Institution · Craft Type · Material · Technique · Dimensions ·
Weight · Location · Department · Year · Version History · Related Designs · QR Code · Licensing ·
Story · Keywords · Est. Build Time · Commercial Status.

---

## 5. Architecture

```
[ Browser PWA: App + Website ] ──HTTPS/JSON──▶ [ FastAPI backend :8000 ]
   model-viewer (3D/AR), camera upload                │
                                                ┌──────┼──────────┬──────────┐
                                                ▼      ▼          ▼          ▼
                                           PostgreSQL MinIO   Redis    worker ──▶ InstantMesh
                                           (users,   (photos, (queue)            (Windows RTX 5080)
                                            crafts,  GLB/OBJ,
                                            meta)    thumb)
```
- Edge-first: reconstruction runs on on-prem CUDA box; craft data never leaves campus.
- PostgreSQL (Supabase) now lives OUTSIDE the Docker Compose network — reached externally over
  the internet via a Supabase connection string (`sslmode=require`), NOT `postgres:5432` on the
  local compose network.
- This Linux dev box has NO GPU → worker runs `INSTANTMESH_MODE=stub` (placeholder GLB). Real
  reconstruction wires in via `INSTANTMESH_MODE=remote` + `INSTANTMESH_URL` on the GPU box later.

## 6. Tech stack
- Backend: FastAPI + SQLAlchemy + PostgreSQL (hosted on Supabase), MinIO (boto3), Redis (job
  queue), JWT (python-jose), bcrypt (passlib).
- Frontend: React 18 + Vite + React Router, @google/model-viewer (3D/AR), plain CSS.
- Infra: Docker Compose (redis, minio, api, worker, web) — PostgreSQL has no local service; it is
  hosted on Supabase (external, reached over the internet).
- **Supabase env (backend `config.py`):** the app will need a `SUPABASE_DB_URL` (or equivalent)
  env var, and the SQLAlchemy engine must pass `connect_args={"sslmode": "require"}`.
- 3D formats: GLB (primary), OBJ+MTL, USDZ, STL.

## 7. Repo layout (current)
```
akaar/
  docker-compose.yml       # services: redis, minio, api, worker, web (no local postgres — DB is on Supabase)
  PLAN.md                # build plan
  AGENTS.md              # this file
  backend/
    Dockerfile
    app/
      main.py            # FastAPI app, CORS, routers, startup (create tables + MinIO bucket)
      config.py          # pydantic-settings (env)
      db.py              # engine, SessionLocal, Base, get_db
      models.py          # User, Craft, Job (SQLAlchemy)
      security.py        # bcrypt hash/verify, JWT create/decode (access+refresh)
      storage.py         # MinIO client helpers (put/get/presigned)
      queue.py           # Redis enqueue/pop job
      worker.py          # reconstruction worker (stub by default)
      routers/
        auth.py          # signup/signin/refresh, get_current_user, get_optional_user
        crafts.py        # upload, create, get, public gallery, publish, download, qr
        jobs.py          # get job status, cancel
  frontend/
    package.json, vite.config.js, index.html, Dockerfile
    src/                 # NOT YET CREATED — build here
```

## 8. API contracts (summary)
- `POST /api/auth/signup` → `{access_token, refresh_token, user}`
- `POST /api/auth/signin` → same
- `POST /api/auth/refresh` (Bearer refresh token) → same
- `POST /api/crafts/upload` (auth, multipart, ≤12 files) → `{photo_urls:[...]}`
- `POST /api/crafts?photo_urls=` (auth, JSON metadata) → `{craft_id, public_id, job_id}`
- `GET /api/crafts/{id}` → craft object (public = guest-ok; private = owner only)
- `GET /api/crafts/public/gallery?craft_type=&skip=&limit=` → list (guest-ok)
- `POST /api/crafts/{id}/publish` (auth) → `{ok, public, share_url}`
- `GET /api/crafts/{id}/download?fmt=` (auth) → `{download_url, format}`
- `GET /api/crafts/{id}/qr` → `{qr_png_base64}` or fallback link
- `GET /api/jobs/{job_id}` → `{job_id, craft_id, status, stage, progress, error}`
- `POST /api/jobs/{job_id}/cancel` (auth) → `{ok}`
- All authed calls: `Authorization: Bearer <access_token>`.

## 9. Conventions / rules
- `ponytail:` comments mark deliberate simplifications — keep them, don't "fix" silently.
- Guest = no token. Backend returns 401 → frontend shows "Sign in to continue" modal.
- Poll job status every ~2s (NO WebSocket yet).
- Model conversion to OBJ/USDZ/STL is phase 2; download serves stored GLB for now.
- Semantic search, AR polish, 2FA, voice, 360° video, LOD, push = PHASE 2. Don't pre-build.
- Keep deps minimal. No new abstraction for a single use.

## 10. Build order (recommended)
1. Boot backend, confirm health + tables + MinIO bucket.
2. App frontend: nav shell + auth context + guest gate → auth screens → Create Twin
   (4 steps) → Processing (poll) → View/Download/Publish → My Library + Account.
3. Website frontend: landing → search/explore → craft detail → public gallery → NFR states.
4. `docker compose up --build`; walk the full loop end to end; fix until green.

## 11. How to verify a change
Run `docker compose up --build`. Sign up via API or UI. Create a craft (upload photos + metadata)
→ watch Processing → confirm model_url populated → open detail (3D renders) → publish → confirm
it shows in Public Gallery. Any break: check api logs + worker logs.

---

## 12. Concept Note — full detail (from `Project AKAAR Concept Note.dc.pdf`)

This is the project's north star. Everything above is derived from it. Capture nothing extra
beyond this and the flow PDF.

**Provenance:** Codename PROJECT AKAAR — Craft Digital Twin Repository. Concept by Abhi Mitra.
Feasibility = Complete. POC = In Place. Time to deploy = 2 weeks. Home: Centurion University ·
Waste to Wealth Lab.

**Vision:** A Physical–Digital–Physical (PDP) Craft Intelligence Platform that preserves
traditional craftsmanship, enables AI-assisted redesign, enhances experiential learning, and
creates a living Digital Twin Repository for artisans, students, faculty, researchers, designers.
Begins with pottery, scales across all Waste to Wealth Lab crafts.

**Objectives (6):**
1. Preserve traditional craft knowledge via digital twins (searchable archive).
2. Improve product design through AI-assisted redesign.
3. Support commercialization through digital portfolios + shareable experiences.
4. Increase student engagement with hands-on craft + mind–hand coordination.
5. Enable rapid prototyping using digital workflows.
6. Build a reusable platform for pottery, bamboo, textiles, wood, metal, future domains.

**User Roles:**
- **Visitor:** browse repository, 3D viewer, AR viewer. (Maps to guest in app flow.)
- **Student:** capture, upload, generate 3D, learn from previous work, build portfolio, share.
- **Artisan:** digitize products, preserve traditional designs, collaborate with students.
- **Faculty:** curate collections, validate uploads, teaching + assessment.
- **Researcher:** export datasets, study craft evolution, AI research.
- **Designer:** advanced Blender editing + product development.

**System Modules (6):**
- **Capture** — QR-guided mobile image capture with photography guidance.
- **AI Reconstruction** — InstantMesh locally on a CUDA-enabled workstation.
- **Digital Twin Repository** — 3D models, metadata, version history, creator attribution,
  licensing, search + semantic retrieval.
- **Design Studio** — Blender-based expert editing with AI-assisted design suggestions.
- **AR Experience** — preview scale, decoration, placement before remaking.
- **Sharing** — QR code, web link, 3D viewer, social-media-ready renders.

**Technology Stack (verbatim buckets):** Frontend kiosk · Mobile web upload via QR code ·
InstantMesh (local inference) · CUDA GPU · Blender for expert editing · GLB/OBJ/USD export ·
Web-based 3D viewer (three.js / model-viewer) · WebXR / AR support · Repository DB + semantic
search (PostgreSQL + vector DB).

**Edge AI Advantage (why on-prem):** Data Sovereignty (artisan IP never leaves campus) · Low
Latency · Zero Cloud Cost (no per-image fees) · Offline Capable · Fully Owned (on-prem CUDA) ·
Scalable (add GPU nodes as volume grows).
- `ponytail:` Dev/demo phase deliberately uses hosted Supabase for speed; the concept note's
  "data never leaves campus" claim applies to the production pilot, which would migrate to
  on-prem PostgreSQL.

**Impact (6):** digital preservation · AI-assisted innovation without replacing artisans ·
hands-on experiential learning · research datasets for CV + digital heritage · commercialization
support · scalable platform for all lab crafts.

**Success Metrics:** digitized craft objects · student participation · redesigned products ·
commercially adopted designs · research publications · artisan onboarding · repository growth.

**Future Expansion domains:** Pottery · Bamboo · Textiles · Wood Carving · Metal Work ·
Terracotta · Recycled Products · Other Heritage Crafts.

**Minimum Hardware:** NVIDIA RTX 4090 (24 GB VRAM) CUDA workstation [NOTE: actual build GPU is a
Windows RTX 5080] · 8-core CPU (i7 / Ryzen 7) · 64 GB RAM · 2 TB NVMe SSD · smartphone/tablet
12 MP+ camera · kiosk touchscreen / HD monitor · campus LAN/Wi-Fi offline-capable.

**Minimum Software:** InstantMesh · CUDA Toolkit + cuDNN · PyTorch + Python 3.10+ · Blender ·
GLB/OBJ/USD export · three.js / model-viewer · WebXR · PostgreSQL + vector DB · QR gen + mobile
web upload.

**Indicative Budget (INR):** GPU workstation ₹70,000 · capture & kiosk (tablet + screen) — ·
software/licensing (mostly OSS / Centurion Cloud) — · dev & integration (in-house, 2-week) — ·
TOTAL ₹50,000–70,000. Recurring cost near zero.

**Suggested research article titles (reference only, NOT build tasks):** (1) Project AKAAR: A
Craft Digital Twin Repository for AI-Assisted Preservation, Redesign and Experiential Learning in
Traditional Crafts. (2) AKAAR: A PDP Framework for Digital Twin–Driven Craft Preservation and
Innovation. (3) Craft Digital Twins for Traditional Artisan Ecosystems: Designing the AKAAR
Platform. (4) From Clay to Digital Twin: An AI-Driven PDP Workflow for Traditional Pottery. (5)
Designing AKAAR: A Scalable Digital Twin Repository for Heritage Crafts in Waste-to-Wealth Labs.

**Gaps between concept note and the 8-phase app flow (flagged in the flow PDF's own review notes):**
- Concept's **Design Studio** (Blender expert editing + AI design suggestions) and standalone
  **AR Experience** module are NOT separate screens in the app flow. Flow folds AR into Phase 4 and
  omits Blender editing → treat Design Studio as PHASE 2 (not in first build).
- Concept metadata schema adds **Version History, Related Designs, Est. Build Time, Commercial
  Status** beyond the Phase 2 metadata step. Keep fields available in the `Craft` model; surface in
  UI in PHASE 2.
- Concept roles **Faculty (curate/validate/assess)** and **Researcher (export datasets)** have no
  screens in the flow. PHASE 2 concern; do not build now.
- Concept mentions a **kiosk frontend** alongside mobile web. First build = mobile-web/PWA only.

---

## 13. Operating Rules — READ AND OBEY

Mandatory for any agent in this repo. Violating them wastes the user's time.

1. **AGENTS.md is the single source of truth.** Build only what is specified here and in the two
   PDFs. Do NOT invent endpoints, fields, screens, roles, or features not listed. Ambiguous?
   Implement the minimal described version, mark `# ponytail:` / TODO, move on — do not expand scope.
2. **Stay on scope.** Deliverable = the app + the website (sections 2–3). Do NOT build the
   InstantMesh engine, the GPU box infra, or teammates' modules.
3. **Follow build order (section 10).** Backend boots first; App frontend before Website frontend.
   Do not jump ahead and leave the core loop broken.
4. **Reuse, don't re-implement.** Use existing `routers/`, `models.py`, `security.py`,
   `storage.py`, `queue.py`, `worker.py`. Grep before adding a helper.
5. **Honor phase-2 boundaries (section 9).** No WebSocket, pgvector/semantic, WebXR polish, 2FA,
   voice, 360° video, LOD, push, external auth. Stub or omit; never pre-build.
6. **No new dependencies/services without reason.** Stack is fixed (section 6). A new package
   needs justification tied to a listed feature.
7. **Minimal diff, boring code.** One working change. `ponytail:` comments for deliberate
   simplifications. Delete before you add.
8. **Guest rules are hard constraints.** No token → browse/search/view 3D/AR only. Block
   create/generate/download/publish with "Sign in to continue". Backend already enforces (401).
9. **No hallucination.** Fact not in this file or the PDFs → say "not specified", don't guess and
   present as requirement. PDF vs code conflict → flag, don't silently diverge.
10. **Verify before claiming done (section 11).** Walk the full loop end to end. A change that
    doesn't run the loop is not finished.
11. **Stick to the work.** Execute the plan; don't drift into refactoring, "improvements", or
    extra docs unless the user asks. The shortest path to done is the right path.
12. **Follow ONLY the user's (Akira's) commands — build step by step, on command.** The agent does
    NOT freelance, speculate, or decide the next task. The ENTIRE project (app + website) is built
    incrementally: one step per explicit user command. Do exactly what the command says — nothing
    more, nothing less. When the user says "build step X", build only step X. Do NOT pre-build,
    pre-empt, or chain the next step. If ambiguous, ask ONE question, then execute only that step.
    Never start any build phase (backend finish, app frontend, website frontend) until the user
    commands it. The shortest path to done is the right path — taken one commanded step at a time.
13. **UI design is provided by the user — do not invent it.** The user supplies the UI design
    (layout, colors, components, screens) one screen at a time. Match the provided design exactly.
    Do NOT substitute your own styling, mockups, or "better" layouts. If no design is supplied for
    a screen, build a minimal functional placeholder and STOP — wait for the user's design before
    polishing. Build screens strictly in the order the user provides them.

---

## 14. UI Design Workflow (how screens get built)

- The user (Akira) provides UI designs **one at a time**.
- For each screen: implement ONLY that screen, matching the supplied design. No adjacent screens,
  no extras.
- If the user hasn't given a design for a screen yet, leave it as a minimal functional placeholder
  (per rule 13). Do not pre-build the rest of the UI.
- The app flow (section 3) lists every screen's required elements — use it as the functional spec,
  but the VISUAL design always comes from the user's supplied asset, not from this file.

---

## 15. Progress Log

> Everything done, in progress, and next — appended chronologically. Updated by the agent at
> the end of every commanded step. Log entries are facts of what happened; they never override
> rules 1–13 or this file's role as single source of truth.

### 2026-08-04 — Step: Project setup (scaffold `akaar/`)
- **Done:** Created `akaar/` repo tree per §7: `docker-compose.yml`, `PLAN.md`, `AGENTS.md`
  (this copy + Progress Log), `backend/` (Dockerfile, requirements.txt, app/ stubs: main,
  config, db, models, security, storage, queue, worker; routers/ stubs: auth, crafts, jobs),
  `frontend/` (package.json, vite.config.js, index.html, Dockerfile, nginx.conf,
  .dockerignore, public/manifest.webmanifest, minimal src/main.jsx + App.jsx placeholder +
  index.css). docker-compose has 6 services: postgres, redis, minio, api, worker, web.
- **Decisions:** Backend modules are stubs (docstrings only) — logic is the next commanded
  step (Backend Build). Frontend `src/` has only a minimal entry placeholder — screens are
  built one per user-supplied design. `requirements.txt` added for the backend Dockerfile.
- **In progress:** — (awaiting next command)
- **Next:** Backend build (models, security, storage, queue, worker, routers) → boot + verify
  (health/tables/MinIO) → then App frontend screens (Welcome/Sign In first, per auth gate)
  with designs supplied by the user.

### 2026-08-04 — Step: Switch DB to Supabase (docs + infra config only)
- **Done:** Removed the local `postgres` service and `pgdata` volume from `docker-compose.yml`;
  dropped `postgres` from `depends_on` in both `api` and `worker`. AGENTS.md updated: §5 note
  that Postgres now lives outside the compose network (Supabase connection string with
  `sslmode=require`, not `postgres:5432`); §6 "PostgreSQL" → "PostgreSQL (hosted on Supabase)",
  Infra line lists services without postgres, added env-var note (`SUPABASE_DB_URL` +
  `connect_args={"sslmode": "require"}`); §7 `docker-compose.yml` line now documents the
  no-local-postgres service list; §12 added a `ponytail:` note flagging the deliberate deviation
  from the concept note's "data never leaves campus" (dev/demo speed; production pilot migrates
  to on-prem PostgreSQL).
- **Decisions:** `DATABASE_URL` env values in compose left as placeholders (not wired yet — real
  Supabase connection is a separate, later step per command). Same AGENTS.md edits mirrored to the
  root copy at `/home/akira/Downloads/AKAAR/AGENTS.md` to keep both in sync.
- **In progress:** — (awaiting next command)
- **Next:** Backend build — wire `SUPABASE_DB_URL` + `sslmode=require` into `config.py`/`db.py`,
  then rest of backend (models, security, storage, queue, worker, routers) → boot + verify.

### 2026-08-05 — Step: Wire Supabase DB env (config + db wiring only)
- **Done:** `backend/.env.example` created with placeholder
  `SUPABASE_DB_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxx.supabase.co:5432/postgres`.
  `config.py` now a pydantic-settings `Settings` class with **required** `supabase_db_url`
  (`env_file=".env"`), no hardcoded credentials. `db.py` builds `engine` from
  `settings.supabase_db_url` with `connect_args={"sslmode": "require"}` plus `SessionLocal`,
  `Base`, `get_db`. `akaar/.gitignore` created with `.env` (no real `.env` written — real value
  added by the user locally; not a git repo yet).
- **Pendings/notes:** `docker-compose.yml` still hardcodes `DATABASE_URL: ...@postgres:5432/...`
  in api/worker (from an earlier step) — compose env will need rewiring to `SUPABASE_DB_URL` in a
  later backend step for the API to boot in Docker. `pydantic-settings==2.4.0` already in
  `requirements.txt`, so this imports once installed.
- **In progress:** — (awaiting next command)
- **Next:** Rest of backend (models, security, storage, queue, worker, routers) → boot + verify
  (health/tables/MinIO), wiring compose env to `SUPABASE_DB_URL`.

### 2026-08-05 — Step: Connect to real Supabase (diagnosis + .env)
- **Done:** User's direct connection string (`postgres:...@db.wscoledoqdsamtlprepc.supabase.co`)
  did NOT work from this Linux dev box: that host resolves to **IPv6 only** in DNS and the box has
  **no IPv6 default route** (`Network is unreachable`). Diagnosed the project's region by probing
  Supabase IPv4 session-pooler endpoints (`aws-0-<region>.pooler.supabase.com`): project lives in
  **ap-northeast-1 (Tokyo)**. Verified connect as `postgres.wscoledoqdsamtlprepc` → PostgreSQL
  17.6, db `postgres`, SSL OK. `backend/.env` now holds the working pooler URL (with `%40`-encoded
  `@` in the password; SQLAlchemy unquotes it) — file is gitignored, never committed. `.env.example`
  updated to the pooler format (user `postgres.<PROJECT_REF>`, host `aws-0-<REGION>.pooler...`).
- **Notes:** Raw `urllib.parse.urlsplit(...).password` does NOT unquote `%40`; SQLAlchemy's
  `make_url` does. Direct Supabase host may be IPv6-only — prefer the session pooler on this box.
- **In progress:** — (awaiting next command)
- **Next:** Rest of backend (models, security, storage, queue, worker, routers) → boot + verify
  (health/tables/MinIO), wiring compose env to `SUPABASE_DB_URL`.

### 2026-08-05 — Step: Implement `backend/app/models.py` (ORM only)
- **Done:** Built SQLAlchemy 2.0 models (`from __future__ import annotations`, `Mapped[]` +
  `mapped_column`, importing `Base` from `.db` — db.py untouched):
  - `User` (`users`): id, email (**unique** + index, not-null), hashed_password, full_name,
    `role` enum (`UserRole`: visitor/student/artisan/faculty/researcher/designer), institution,
    department, email_verified(bool), created_at. Has `crafts` relationship.
  - `Craft` (`crafts`): id, owner_id (**FK→users.id**, index), title, craft_type, material,
    technique, story, dimensions, weight, location, year, commercial_status, license,
    is_public(bool), **photos** (JSON — MinIO object keys), **model_key** (String — MinIO object
    key), created_at, updated_at. Extra PHASE-2 fields kept per §12: keywords, version_history,
    related_designs (JSON lists), est_build_time. Has `owner` + `jobs` relationships.
  - `Job` (`jobs`): id, craft_id (**FK→crafts.id**, index), `status` enum (`JobStatus`:
    queued/processing/completed/failed), progress int (default 0 + `ck_progress_range`
    CheckConstraint 0–100), error_message, created_at, completed_at. Has `craft` relationship.
- **Notes:** No startup `create_all()` added (separate step once main.py exists). Nothing else
  touched. VERIFIED by mapping metadata under a temp venv with SQLAlchemy (system Python is 3.14;
  project deploys Python 3.11 + sqlalchemy==2.0.32 where the `Optional[X]` pattern is standard).
  Used `Optional[X]` rather than `X | None` for cross-Python compatibility.
- **In progress:** — (awaiting next command)
- **Next:** Implement `security.py`, `storage.py`, `queue.py`, then `main.py` (app + CORS + startup
  `create_all()` + MinIO bucket) + `worker.py`, then routers → boot + verify.

### 2026-08-05 — Step: Implement `backend/app/security.py`
- **Done:** bcrypt hashing (`hash_password` / `verify_password`, using `bcrypt` lib directly to
  avoid the passlib+bcrypt-4.x warning — no new dependency; `bcrypt==4.1.3` + `python-jose`
  already in requirements.txt). JWT: `create_access_token` (default 15 min), `create_refresh_token`
  (default 7 days), `decode_token` (raises 401 on invalid/expired), HS256. FastAPI dependency
  `get_current_user` via `HTTPBearer(auto_error=False)` → returns decoded `user_id` int only (no DB
  lookup yet), 401 "Sign in to continue" when no/invalid token.
- **Config additions:** `config.py` Settings gained **required** `secret_key` (env). `.env.example`
  gained `SECRET_KEY=change-me-to-a-long-random-string`; `backend/.env` got a generated
  `SECRET_KEY` (gitignored). Caught a bug while testing: an earlier append had glued `SECRET_KEY=`
  onto the end of the `SUPABASE_DB_URL` line (missing newline) — rewrote `.env` to 2 clean lines.
- **Verified** in temp venv (fastapi+bcrypt+jose): hash/verify roundtrip, token payloads, 15-min &
  7-day lifetimes exact (900s / 604800s), invalid/expired/missing → 401, `get_current_user` returns
  the id. No files outside `security.py`/`config.py`/`.env`/`.env.example` touched.
- **In progress:** — (awaiting next command)
- **Next:** `storage.py` (MinIO) → `queue.py` (Redis) → `main.py` + `worker.py` → routers → boot.

### 2026-08-05 — Step: Implement `backend/app/storage.py`
- **Done:** MinIO helpers using **boto3** (`boto3==1.34.150` already in requirements; minio-py is
  NOT a dep — per task, used the existing one, no new dependency). `get_minio_client()` (boto3 S3
  client, `endpoint_url=http://{MINIO_ENDPOINT}` = secure=False, s3v4 sig, region us-east-1),
  `ensure_bucket_exists()` (idempotent; 404→create, 403→exists), `upload_file(bytes,key,ct)->key`,
  `get_presigned_url(key, expires=3600)`, `delete_file(key)`. No validation/size limits (phase-2).
- **Config additions:** `config.py` Settings gained `minio_endpoint`, `minio_access_key`,
  `minio_secret_key` (required) + `minio_bucket` (default `"akaar"`). `.env.example` and
  `backend/.env` gained MINIO_ENDPOINT=localhost:9000, MINIO_ACCESS_KEY=akaar,
  MINIO_SECRET_KEY=akaar12345678, MINIO_BUCKET=akaar — matching docker-compose minio service
  (root creds akaar/akaar12345678, API port 9000; api/worker pass MINIO_ACCESS_KEY etc.).
- **Verified end-to-end** against a real `minio/minio` docker container (same creds, port 9000):
  client created, bucket created idempotently (head→404→create, second call no-op), upload
  returned key, presigned URL contained X-Amz-Signature, content roundtripped, delete removed the
  object. Test container removed after.
- **In progress:** — (awaiting next command)
- **Next:** `queue.py` (Redis) → `main.py` + `worker.py` → routers → boot + verify.

### 2026-08-05 — Step: Implement `backend/app/queue.py`
- **Done:** redis-py helpers (`redis==5.0.7` already in requirements — no new dependency).
  `get_redis_client()` (host/port from settings, db 0, decode_responses=True), `enqueue_job`
  (RPUSH JSON `{job_id, craft_id}` to `akaar:reconstruction_jobs`), `dequeue_job(timeout=5)`
  (BLPOP; returns parsed dict or None on timeout), `get_queue_length()` (LLEN). No priority/retry/
  DLQ (phase-2).
- **Config additions:** `config.py` gained `redis_host: str = "redis"` and `redis_port: int = 6379`
  — defaults match docker-compose's redis service (service name `redis`, port 6379, db 0).
  `.env.example` documents REDIS_HOST/REDIS_PORT. `.env` not modified (defaults cover it).
- **Verified** against a real `redis:7-alpine` container (port 6379): empty-queue BLPOP returns
  None after 1s timeout; two enqueues → length 2 → dequeued in FIFO order with exact payloads →
  length 0. Test container removed after.
- **In progress:** — (awaiting next command)
- **Next:** `main.py` (FastAPI app + CORS + startup create_all() + ensure MinIO bucket) + `worker.py`
  (stub loop) → routers → boot + verify.

### 2026-08-05 — Step: Fix mobile Role dropdown not opening (Sign Up screen)
- **Done:** Root-caused via user answer ("dropdown won't open / options can't be picked") —
  iOS Safari bug where a `<select>` nested inside a `<label>` consumes the tap for the label's
  implicit control-activation and the native picker never presents. Headless Chromium mobile
  emulation could NOT reproduce this (no real native picker), so the fix is the documented iOS
  workaround, not a regression fix.
- **Changes (Sign Up screen only):** `frontend/src/pages/SignUpPage.jsx` — Role field is no
  longer wrapped in a `<label>`; uses `<label className="field__label" htmlFor="role">` +
  `<select id="role">` (comment explains iOS reason). Other fields keep label-wrap (fine for
  text inputs). `frontend/src/pages/SignUp.css` — `.field input, .field select` gained
  `position: relative; z-index: 1` so no overlay intercepts taps on the picker trigger.
- **Verified:** `npm run build` passes. Mobile emulation (390×844, iPhone UA): select not
  inside a label, explicit `label[for="role"]` present, `z-index: 1`, 5 options intact, and
  `page.select('researcher')` updates the value correctly.
- **State note:** Backend (main/worker/routers) + Welcome + Sign Up screens are built and
  verified in earlier steps but their §15 entries were not appended (log currently ends at
  queue.py); changes remain uncommitted (git status shows backend router edits + new frontend
  files). Not committed — awaiting explicit commit request per rule 12.
- **In progress:** — (awaiting next command)
- **Next:** Commit pending changes if asked; or next App screen (Sign In, per §10 auth flow)
  when the user supplies the design per rules 12–13.

### 2026-08-05 — Step: Build Sign In screen (/signin route)
- **Done:** Implemented SignInPage.jsx with structure per user spec:
  - Back arrow + "Sign in" header at card top
  - Email + password fields (label + 10pt-radius inputs, matching Sign Up pattern)
  - Row: "Remember me" checkbox left + "Forgot password?" link right (#974400)
  - Primary pill button "Sign in" calling AuthContext.login() with email/password
  - Footer link "Don't have an account? Create account" → /signup
  - Error message shown on 401 (using DESIGN.md error tokens, same as Sign Up)
- **Changes:**
  - `frontend/src/pages/SignInPage.jsx` — new Sign In page
  - `frontend/src/pages/SignIn.css` — full styling matching Welcome/Sign Up patterns:
    mobile/desktop breakpoints, card, frosted glass header, input radius 10px,
    error background (--error), remember row layout, primary button
  - `frontend/src/context/AuthContext.jsx` — updated `login()` to accept optional `remember`
    param (kept in memory for future phases)
- **Verified:** Puppeteer viewport tests at 375×667 (mobile) and 1280×800 (desktop)
  confirm both breakpoints render correctly:
  * Card widths ~388–343px (within ~420px target)
  * Back arrow, title, email/password fields, remember/forgot row, submit button, footer present
  * Error banner uses --error token (if thrown)
  * No layout bugs at either breakpoint
- **State note:** All Sign In work is complete and ready for next user design screen.
- **In progress:** — (awaiting next command)
- **Next:** Continue to next App screen per user-supplied design (rule 12–13).
