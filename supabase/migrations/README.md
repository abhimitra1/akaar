# Migrations

`schema.sql` (one level up) is the full source of truth — what a brand-new Supabase
project should run once, top to bottom, to get the whole schema. It's idempotent
(`create table if not exists`, `drop policy if exists` + `create policy`, etc.), so
re-running the whole thing against an already-set-up project is *safe*, but it's not
*convenient* — you'd have to re-read the entire file to figure out what's actually new.

This folder holds the individual, incremental pieces instead. Each file here is a small,
self-contained migration you can paste into the Supabase SQL editor on its own, without
needing to touch `schema.sql` at all. Every change that also landed in `schema.sql` is
duplicated here — `schema.sql` stays the full picture, these are the "just run this one
thing" version.

**Naming:** `NNN_description.sql`, numbered in the order they were written (not
necessarily the order you need to run them — each file's own comment says what it
depends on, if anything).

**Status as of 2026-08-12:**

| File | Applied? |
|---|---|
| `001_crafts_delete_policy.sql` | Not yet — run this before My Library's delete button will work |
| `002_parent_design_id.sql` | Not yet — run this before Co-Create's "Choose from Library" lineage tracking will work |
| `003_terms_accepted_at.sql` | Not yet — run this before signup/login will work at all (every authenticated route redirects to `/accept-terms`, which needs this column to exist) |
| `004_height_cm.sql` | Not yet — run this before MetadataPage's "Height (cm)" field / CraftPage's real-scale AR will work |
| `005_likes.sql` | **Already live** — the `public.likes` table already existed on the running project (verified via a direct query, not assumed) before this file was written; it's here so a fresh project gets it too. |
| `006_super_admin.sql` | Not yet — run this before `/admin` will work at all (adds `is_super_admin`/`image_source`/`job_type`, the admin RLS policies, and grants apon555@gmail.com admin). If that email hasn't signed up yet, re-run just the final `update` statement afterward — the rest is safe to leave as-is. |
| `007_role_restructure.sql` | Not yet — run this (after `006`) before signup/role behavior matches the app: collapses `role` to `visitor`/`artisan` only, resets every existing profile to `visitor` except apon555@gmail.com and ss5494602@gmail.com (`artisan`), adds `artisan_requested_at`, and adds the triggers that block self-escalation of role/is_super_admin/unlimited_creations and enforce the visitor=co-create / artisan=upload split on `crafts.image_source`. |
| `008_backfill_ai_generated.sql` | Not yet — run this (after `006`) to fix the AI badge not showing on craft cards for pre-existing AI co-creations: every row from before `image_source` existed got backfilled to `'original'` regardless of how it was actually made. This re-tags the recoverable subset (anything with a `parent_design_id`); the rest need a manual fix per row via `/admin`. |
| `009_manager_commissions.sql` | Not yet — run this (after `006`) before the manager review queue (`/manager`) or the customer's commission flow (`/commissions`, CraftPage's "Submit for Production") will work at all. Adds `profiles.is_manager`, the `commissions`/`commission_reviews`/`notifications` tables, their RLS policies, and the state-machine trigger that enforces which status transitions each side may make. Grant a profile `is_manager` by hand via `/admin` → Profiles → Edit (same pattern as promoting an artisan) — there's no self-service request flow for this role. |

Run in numeric order where a "Depends on" note in a file's own header says so (006 before
007, 008, and 009; otherwise independent). All are safe to re-run (every statement is
`if not exists` / `drop ... if exists` + `create`).
