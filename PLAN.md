# AKAAR — Build Plan

> Source of truth: `AGENTS.md`. Build order from AGENTS.md §10. Progress is also logged
> in the **Progress Log** section of `AGENTS.md`.

## Build order (AGENTS.md §10)

1. Boot backend, confirm health + tables + MinIO bucket.
2. App frontend: nav shell + auth context + guest gate → auth screens → Create Twin
   (4 steps) → Processing (poll) → View/Download/Publish → My Library + Account.
3. Website frontend: landing → search/explore → craft detail → public gallery → NFR states.
4. `docker compose up --build`; walk the full loop end to end; fix until green.

## Status

| # | Step | Status |
|---|------|--------|
| 1 | Project setup / scaffold (`akaar/` tree, compose, configs) | DONE |
| 1a | Backend build (models, security, storage, queue, worker, routers) | NOT STARTED |
| 1b | Boot backend + verify health/tables/MinIO | NOT STARTED |
| 2 | App frontend build (screen by screen, per supplied design) | NOT STARTED |
| 3 | Website frontend build | NOT STARTED |
| 4 | Full end-to-end loop verification | NOT STARTED |
