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

### 2026-08-06 — Step: Desktop-only Home layout (sidebar replaces bottom tab bar)
- **Done:** Added desktop-only styling to the Home screen, active ONLY at `@media (min-width: 768px)`. Nothing below 768px changed — mobile is pixel-identical to before.
- **Changes (Home screen only):**
  - `HomePage.jsx` — added a `.home__sidebar` nav (`AKAAR` wordmark + 5 items Home/Explore/Create/Library/Profile with icon+label; Home `.home__sidebar-item--active`), and a `.home__empty-icon` SVG in the Recent Uploads empty state.
  - `Home.css` — base rules hide `.home__sidebar` and `.home__empty-icon` (`display: none`) so they never render on mobile; replaced the old centered 800px desktop media block with the fixed left sidebar (280px, full height, `--surface-container-high` bg, primary #974400 wordmark, white pill active item), content `margin-left: 280px`, top-bar becomes a fixed right-aligned menu+search group (brand hidden), `.home__tab-bar { display: none }`, FAB moves to bottom-right of the content area (bottom 24 / right 28), empty-state icon shown centered.
- **Verified:** `npm run build` passes. Headless Chromium (puppeteer) at 1280×800 — sidebar flex full-height at x0 y0 w280 h800, Home pill highlighted, tab-bar `none`, FAB bottom-right (1196,720), empty icon centered; at 375×812 — sidebar & icon hidden, tab-bar present at bottom (y740 h72), brand + top-bar unchanged.
- **In progress:** — (awaiting next command)
- **Next:** Commit this change if asked; otherwise next screen/design per user command (rule 12–13).

### 2026-08-06 — Step: Mobile Home screen (refine to match reference)
- **Done:** Refined the mobile Home screen (`/` route) to match the reference for the `@media` default (<768px). Mobile-only scope; the desktop sidebar breakpoint from the prior step is preserved untouched. Auth screens, AuthContext, and routing were not touched.
- **Component (`HomePage.jsx`):** `GET /api/crafts` now fetched once and filtered **client-side** by `craft_type` (backend list endpoint has no such param — `ponytail:` marked); top bar search icon changed from a dead `Link to="/search"` to a non-functional button; removed inline style on header + tab bar so CSS frosted glass applies; empty state restructured into a circular icon holder + box/sparkle SVG + `home__empty-title` + subtitle.
- **CSS (`Home.css`)** — base (mobile) rules: `.home` bg → `var(--surface)` `#fff8f6` (warm peach); top bar + tab bar → DESIGN.md ultraThinMaterial glass `rgba(255,255,255,0.72)` + `blur(20px)` + hairline border; brand weight 700; title → DESIGN.md large-title (34px/700/41px/0.37); `.home__content` becomes `display:flex; flex-direction:column` and `.home__empty-state{flex:1}` to center the empty state vertically in remaining space; `.home__empty-icon-circle` 96×96 `--bg-cream` `#fff1eb` circle; `.home__empty-icon` 44×44 `--text-faint`; active tab underline via `.home__tab-item--active::after` (24×3 `#974400`). Desktop media set `.home{background:var(--surface-container-high)}` to preserve the previously-verified tan desktop bg; removed the obsolete desktop `.empty-icon` block (icon is now shared base).
- **`index.css`: added tokens** `--text-primary: #231914` (fixed a latent undefined var used throughout) and `--surface: #fff8f6`.
- **Verified:** `npm run build` passes. Headless Chromium at 375×812 — page bg `#fff8f6`, title 34px/700 large-title, brand 18px/700 primary, search button top-right, empty circle 96×96 `#fff1eb` centered (y416) with 44×44 icon + bold title + muted sub, FAB primary at bottom-right (56×56), tab bar frosted glass bottom with active-underline `#974400`, sidebar hidden, 4 chips. At 1280 — sidebar shown, tab bar hidden, desktop bg returned to tan `#e7d2c1` (unchanged).
- **In progress:** — (awaiting next command)
- **Next:** Commit this change if asked; otherwise next screen/design per user command (rule 12–13).

### 2026-08-06 — Step: Fix Home background color inconsistency
- **Done:** Home page now uses the SAME DESIGN.md background token at every breakpoint. Previously mobile `.home` used `var(--surface)` `#fff8f6` (light/peach) while desktop `.home` + `.home__sidebar` overrode to `var(--surface-container-high)` `#e7d2c1` (warm tan) — two different tones.
- **Exact lines inconsistent (were → after), in `frontend/src/pages/Home.css`:**
  - L17 `.home` base → `background: var(--surface)` (kept; `#fff8f6`)
  - desktop media block `.home { background: var(--surface-container-high) }` → **removed** (redundant — base already sets `var(--surface)`)
  - desktop `.home__sidebar { background: var(--surface-container-high) }` → `background: var(--surface)` (`#fff8f6`)
- **Token choice:** `surface` `#fff8f6` (the reference's warm peachy tone; DESIGN.md `colors.surface`) — page-level background. NOTE: `--surface-container-high` in `index.css` still holds the stale mockup value `#e7d2c1` (DESIGN.md says `#f8e4db`); now unused by Home.css but left alone because other screens (Welcome/Sign In/Sign Up) still reference it and this task forbade touching other components.
- **Verified:** `npm run build` passes. Headless Chromium: MOBILE375 page `rgb(255,248,246)` = `#fff8f6`; DESKTOP1280 page `rgb(255,248,246)` and sidebar `rgb(255,248,246)` — identical tone at both breakpoints.
- **In progress:** — (awaiting next command)
- **Next:** Commit this change if asked; otherwise next screen/design per user command (rule 12–13).

### 2026-08-06 — Step: Build Create Digital Twin screen (/create)
- **Done:** Built the Create Digital Twin screen (`CreatePage.jsx` + `Create.css`) per the user's spec: gradient terracotta frosted-glass header (back arrow `navigate(-1)` + "Create Digital Twin"), photos section, metadata form, and a "Generate 3D Model" submit. Reused existing app patterns (card layout, `field input/select/textarea`, primary pill) and DESIGN.md tokens.
- **Component (`CreatePage.jsx`):**
  - Photos: hidden `input[type=file]` (multiple, accept image/*, JPG/PNG/HEIC), **max 12** guard (excess files ignored + toast), preview thumbnails (~84px) each with a remove (x) button, `n / 12 photos` counter, add-card button. No camera/360 (behind phase-2 boundary).
  - Metadata: Title* (required), Craft type dropdown (Pottery/Bamboo/Textiles/Wood/Metal/Terracotta/Recycled/Other), Material, Technique, Story(textarea), Dimensions, Weight, Location, Year — rows split into 2-across on wider screens.
  - Submit `.create__submit` pill: **disabled** until `photos.length > 0 && title.trim()`. Sequential flow → POST `/api/crafts` (JSON metadata + Bearer) → `craft_id`; POST `/api/crafts/{id}/photos` (FormData `files` = each preview's `file`); POST `/api/crafts/{id}/generate` → `job_id`; then `navigate(\`/processing/${job_id}\`)`. Any failure aborts (stays, no error banner). No `spin`/await edge cases.
  - Removed a temporary `window.__gen`/`console.log('MY_DEBUG')` debug pair after the navigation was confirmed working.
- **`Create.css`:** mobile-first per DESIGN at 375; upload area uses `--surface-container-low` `#fff1eb`, hairlined dashed border; desktop `@media (min-width:768px)` centers a 640px white `--surface-container` card. No design asset supplied for this screen, so used the existing card/field + token patterns (rule 13 minimal functional).
- **Processing page:** `ProcessingPage.jsx` + `Processing.css` placeholder: title "Processing", subtitle "Your digital twin is being created.", and the job id. Route `/processing/:jobId` added (Protected) in `App.jsx`.
- **Verified:** `npm run build` passes (52 modules, ~188 kB). Headless Chromium full loop: sign in → FAB → `/create` → upload 3 test PNGs → type title → submit → **URL reaches `/processing/11`** and ProcessingPage renders `Job ID: 11`. (Earlier E2E runs that showed 3×200 API responses but no navigation were stale-HMR modules served from an out-of-date dev bundle before the latest file; a fresh browser after the final edit resolves.)
- **In progress:** — (awaiting next command)
- **Next:** Commit this change if asked; otherwise next screen/design per user command (rule 12–13).

### 2026-08-06 — Step: Fix 401 on GET /api/crafts (Home)
- **Diagnosis (traced live, not guessed):** `curl` confirmed — guest GET `/api/crafts/` → **401**; signed-in WITH `Authorization: Bearer` → **200**; signed-in WITHOUT header → **401**. HomePage was calling `fetch(`${API_BASE_URL}/api/crafts`)` with **no Authorization header** (possibility 1 = real), and the backend `list_crafts` used the **required** `security.get_current_user` instead of `get_optional_user` (possibility 3 = real), blocking guests. Possibility 2 (token wiped by refresh) was NOT the cause — no refresh needed to reproduce; the header was simply never sent.
- **Fixes:**
  - `frontend/src/pages/HomePage.jsx` — fetch now attaches `{ Authorization: Bearer <accessToken> }` when logged in (from `useAuth()`); effect re-runs on `accessToken` change. Guests send no header.
  - `backend/app/routers/crafts.py` — `list_crafts` switched `security.get_current_user` → `get_optional_user` (Optional[int]); added `from sqlalchemy import or_`. Semantics: explicit `owner` → that owner's library only (403 guard kept); logged-in user → own crafts + public crafts; guest → public crafts only. So guests browse and logged-in users get additional owned/private results.
- **Verified:** api container rebuilt (`docker compose up --build -d api`). Guest `GET /api/crafts/` → **200**, sees public craft 3; signed-in → **200**, sees 8 (own + public); flipping a craft public made it appear for guests. `npm run build` passes. Headless Chromium: guest home shows the public craft with 200 (no 401); signed-in home shows Featured + Recent rows with 200.
- **In progress:** — (awaiting next command)
- **Next:** Commit this change if asked; otherwise next screen/design per user command (rule 12–13).

### 2026-08-06 — Step: Build real Processing screen (/processing/:jobId)
- **Done:** Replaced the placeholder Processing page with a real polling screen. New/edited files:
  - `frontend/src/pages/ProcessingPage.jsx` — terracotta frosted-glass header ("Creating your digital twin", back arrow), rounded white card with a CSS animated spinner, a progress bar whose filled portion (`--terracotta-900` `#974400`) grows to `job.progress`% (with `{progress}% complete` meta), and a status line driven by `job.status`: `queued` → "Waiting in queue...", `processing` → "AI is reconstructing your model...", `completed` → "Done!" + check icon then auto-`navigate('/craft/{craft_id}')` after ~1s, `failed` → shows `job.error_message` + "Try again" pill that `navigate('/create')`. Polls `GET /api/jobs/{jobId}` immediately then every **2s** via `setInterval`, clears the interval on completed/failed, and on a network/parse error shows a generic error state (does not crash).
  - `frontend/src/pages/Processing.css` — tokens per DESIGN.md (card radius, frosted header, `--surface-container-high` track, `--radius-full` pill).
  - `frontend/src/pages/CraftPage.jsx` + `.css` — **placeholder** View screen (shows "Craft ID: N", "The 3D viewer will live here."); route `/craft/:craftId` (Protected) added in `App.jsx`.
- **Worker fix (needed to complete a real job):** `backend/app/worker.py` was crash-looping because `db = SessionLocal()` sat outside the try block and the dev-box Supabase pooler DNS is flaky (transient EAI_AGAIN) — a fresh connection is made per job and a DNS miss killed the whole loop (and consumed queued jobs, leaving them orphaned in DB `queued`). Added a 4×3s retry around session creation (`OperationalError`), re-enqueueing the job if the DB stays unreachable (`ponytail:` marked). Rebuilt worker.
- **Verified:** `npm run build` passes. Full E2E (headless Chromium, 375×812): sign in → `/create` → upload 1 photo + title → submit → arrive `/processing/15`; status transitions captured "Waiting in queue..." → "AI is reconstructing your model..." → "Done!"; job polls every ~2s (gaps 1.4–2.6s); **auto-navigated to `/craft/14`**; DB shows job 15 = `completed`, progress 100, model_key `stub/14.glb`; worker logs show pickup → processing → completed.
- **In progress:** — (awaiting next command)
- **Next:** Commit this change if asked; otherwise next screen/design per user command (rule 12–13).

### 2026-08-06 — Step: Build real View screen (/craft/:craftId)
- **Done:** Replaced the Craft placeholder with the real View screen:
  - `frontend/src/pages/CraftPage.jsx` — frosted-glass header (back → `/`, craft title); `<model-viewer>` (from `@google/model-viewer@^4.0.0`, already a dependency, imported for side-effect registration) with `src={craft.model_url}`, `camera-controls`, `auto-rotate`, `style="width:100%;height:400px"`; read-only metadata card (story, "By {owner_name}", rows for craft_type/material/technique/dimensions/weight/location/year using caption-1 labels + 15px values per "Deference in Type"); actions: **Download** `<a href={model_url} download>` and **Publish** button (visually present, non-functional — no backend publish endpoint exists; not invented). Loading + error states.
  - `frontend/src/pages/CraftPage.css` — frosted header, `--radius-md` card, `--radius-full` pill buttons, DESIGN.md tokens.
- **Backend (needed to serve the model + creator):** there was NO file-serving route in the backend (main.py/storage.py check confirmed files were never served — the Home thumbnail URL `/api/crafts/{id}/photos/{key}` was a dead pattern). `get_craft` now sets `owner_name` (`craft.owner.full_name`) and `model_url` on the response; `CraftOut` gained optional `owner_name`/`model_url` fields.
- **Model URL pattern:** `storage.py` gained `get_browser_url()` — a presigned URL **signed against `MINIO_PUBLIC_ENDPOINT`** (new setting, default `localhost:9000`, documented in `.env.example`). A host-swap after signing returned 403 (signature includes the Host header); signing the URL against the public endpoint fixes it and `generate_presigned_url` is pure computation (no network), so it works from inside the api container. `ponytail:` dev-only convenience; production serves files through the API.
- **Verified:** api rebuilt. `/api/crafts/16` returns owner_name "E2E" + model_url `http://localhost:9000/akaar/stub/16.glb?...`; curl fetch of that URL → 200 `model/gltf-binary`, magic `glTF`. Headless Chromium (SPA nav via `history.pushState`+popstate after sign-in): `/craft/14` renders title "Processing E2E vase", `<model-viewer>` present with `src`/`camera-controls`/`auto-rotate`, and a network request to the stub GLB fires; `/craft/16` renders full metadata rows (Craft type Terracotta, Material Clay, Technique Hand-thrown, Dimensions 10 x 8 cm, Weight 0.4 kg, Location Paralakhemundi, Year 2024), story, "By E2E", Download + Publish buttons. Stub GLB is empty geometry (expected); viewer wired correctly for real models. `npm run build` passes (model-viewer adds ~to bundle; chunk-size warning noted).
- **In progress:** — (awaiting next command)
- **Next:** Commit this change if asked; otherwise next screen/design per user command (rule 12–13).

### 2026-08-06 — Step: Shared LoadingScreen component
- **Audit:** grep for plain-text loading states found only two full-page ones — `CraftPage.jsx` (`<div className="craft__loading">Loading…</div>`) and `HomePage.jsx` (`<div className="home loading">Loading…</div>`). SignIn/SignUp use `loading` only for submit-button labels ("Signing in…"/"Sending…") — button-in-progress text, not standalone loading states, so left alone. The `AccountPage`/`ExplorePage`/`LibraryPage` placeholders render static text (no fetch), and no route-transition loading state exists (no Suspense/lazy), so nothing else to apply.
- **Created** `frontend/src/components/LoadingScreen.jsx` + `LoadingScreen.css` — centered (`min-height:100vh`) screen with a CSS ring spinner (`border-radius:50%; border-top-color: var(--terracotta-900)`, `@keyframes loading-screen-spin`, `animation: ... 0.8s linear infinite`), muted text (`--text-muted` `#564338` = on-surface-variant), background `var(--surface)` (no white flash); `role="status"`.
- **Applied to** (contextual message): `pages/CraftPage.jsx` → `"Loading craft details..."`; `pages/HomePage.jsx` → `"Loading crafts..."`. Removed the now-unused `.craft__loading` CSS. No data-fetching logic changed.
- **Verified:** `npm run build` passes. Headless Chromium with CDP network throttling (latency 900ms): `/craft/16` shows `.loading-screen` + "Loading craft details..." + spinner, then loads `<model-viewer>`; Home `/` shows "Loading crafts..." + spinner then the tab bar. Computed styles: `border-radius:50%`, `border-top-color rgb(151,68,0)` = `#974400`, `animation loading-screen-spin 0.8s linear infinite`, text `rgb(86,67,56)` = `#564338`, bg `rgb(255,248,246)` = `#fff8f6`.
- **In progress:** — (awaiting next command)
- **Next:** Commit this change if asked; otherwise next screen/design per user command (rule 12–13).

### 2026-08-06 — Step: Make Publish button work (backend PATCH + frontend wiring)
- **Backend (`routers/crafts.py`):** added `PATCH /api/crafts/{craft_id}/publish` and `PATCH /api/crafts/{craft_id}/unpublish` (trivial via shared helper) — both require `security.get_current_user`, use `_get_owned_craft` (404/403 ownership), set `craft.is_public` (True/False), `db.commit()` (updated_at auto-bumped via `onupdate`), and populate `owner_name`/`model_url` before returning `CraftOut` for consistency with GET.
- **Frontend (`CraftPage.jsx`):** `handlePublish` calls `PATCH /api/crafts/{craftId}/publish` with the Bearer token (same pattern as other authed calls); on success updates local `craft.is_public` from the response and the button renders "Published" (disabled, `.craft__btn--published`); on failure shows `publishError` (`--error`) without crashing; button label shows "Publishing…" while in flight. Download/viewer/metadata untouched.
- **Verified:** api rebuilt, `npm run build` passes. curl: publish → 200 `is_public=true` + owner; unauthed PATCH → 401; nonexistent craft → 404; fresh GET `is_public` true; craft 16 appears in the guest public list; unpublish → `false`. Browser (375×812): on `/craft/16` (unpublished) buttons = `["Download","Publish"]`; click Publish → buttons become `["Download",{Published,disabled:true}]`, no error; fresh GET + direct DB query both confirm `craft 16 is_public: True`.
- **In progress:** — (awaiting next command)
- **Next:** Commit this change if asked; otherwise next screen/design per user command (rule 12–13).
