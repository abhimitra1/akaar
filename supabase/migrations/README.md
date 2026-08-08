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

**Status as of 2026-08-08:**

| File | Applied? |
|---|---|
| `001_crafts_delete_policy.sql` | Not yet — run this before My Library's delete button will work |
| `002_parent_design_id.sql` | Not yet — run this before Co-Create's "Choose from Library" lineage tracking will work |
| `003_terms_accepted_at.sql` | Not yet — run this before signup/login will work at all (every authenticated route redirects to `/accept-terms`, which needs this column to exist) |

Run them in any order — none depend on each other. All three are safe to re-run (every
statement is `if not exists` / `drop ... if exists` + `create`).
