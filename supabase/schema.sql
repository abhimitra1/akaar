-- PATHS backendless migration: profiles/crafts/jobs tables + RLS + storage bucket.
-- Replaces the FastAPI backend (SQLAlchemy models + JWT auth + MinIO + Redis) with
-- direct Supabase Auth / Postgres RLS / Storage access from the frontend.

-- Old FastAPI-era tables used integer PKs with custom JWT auth (owner_id: int).
-- Incompatible with Supabase Auth's uuid-based auth.uid() — dev/test data only, dropped.
drop table if exists public.jobs cascade;
drop table if exists public.crafts cascade;
drop table if exists public.users cascade;

-- ── profiles (extends auth.users with app-specific fields) ──────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  -- Two admin-assigned roles only (see migrations/007_role_restructure.sql): 'visitor'
  -- is the default everyone starts and mostly stays at; 'artisan' is granted by a super
  -- admin (via /admin) or requested by the user via `artisan_requested_at` below. Never
  -- self-selected at signup — see guard_profile_privileges() further down, which blocks
  -- a plain authenticated client from changing this column on their own row.
  role text not null default 'visitor'
    check (role in ('visitor', 'artisan')),
  institution text,
  department text,
  email_verified boolean not null default true,
  -- Exempts this user from check_daily_job_limit()'s 5/day cap (testers, staff).
  -- Not exposed anywhere in app UI — set manually via SQL editor.
  unlimited_creations boolean not null default false,
  -- NULL = not yet accepted. Set once by frontend/src/pages/AcceptTermsPage.jsx; every other
  -- route is gated behind this via ProfileGate.jsx until it's set. NULL on every existing
  -- row after this migration runs, by design — retroactively requires acceptance from
  -- everyone, same as a real ToS update would.
  terms_accepted_at timestamptz,
  -- Set by AccountPage.jsx's "Apply to become an Artisan" button (visitors only). A super
  -- admin reviews requested-but-still-visitor profiles in /admin and promotes by hand —
  -- no auto-approval or notification flow yet.
  artisan_requested_at timestamptz,
  created_at timestamptz not null default now()
);

-- create table if not exists (above) won't add these columns to an already-existing
-- profiles table — needed the first time this migration runs after each column was added.
alter table public.profiles
  add column if not exists unlimited_creations boolean not null default false;
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz;
alter table public.profiles
  add column if not exists artisan_requested_at timestamptz;

-- Tightens an already-existing profiles.role constraint down to the two current values —
-- create table if not exists (above) won't touch a pre-existing table's constraint.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('visitor', 'artisan'));

-- Collapses every pre-existing role value to the new two-value set: everyone becomes
-- 'visitor' except two named accounts, which become 'artisan'. A no-op on a fresh project
-- (no rows yet); required once on the already-running one.
update public.profiles
set role = 'visitor'
where email not in ('apon555@gmail.com', 'ss5494602@gmail.com');
update public.profiles
set role = 'artisan'
where email in ('apon555@gmail.com', 'ss5494602@gmail.com');

alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Public view: only what a public craft card needs to show ("By {name}").
-- Keeps email/institution/department private.
create or replace view public.public_profiles as
  select id, full_name from public.profiles;

grant select on public.public_profiles to anon, authenticated;

-- Auto-create a profile row from auth.users signup metadata (security definer
-- bypasses RLS; runs once per new auth user). role is always 'visitor' regardless of
-- what signup metadata says — role is admin-assigned only (see guard_profile_privileges
-- below), never trust the client for a privilege-bearing column even at insert time.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, institution, department)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'visitor',
    new.raw_user_meta_data ->> 'institution',
    new.raw_user_meta_data ->> 'department'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- profiles_update_own above lets any user update their OWN row with no column
-- restriction — fine for full_name/institution/department, but without this trigger a
-- plain authenticated client could `update profiles set role='artisan'` (or
-- is_super_admin/unlimited_creations) on themselves directly. RLS is row-level only, so
-- column-level protection has to be a trigger: silently reverts these three columns
-- unless the acting user already is a super admin (who legitimately edits them via
-- /admin's Profiles tab).
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_super_admin(auth.uid()) then
    new.role := old.role;
    new.is_super_admin := old.is_super_admin;
    new.unlimited_creations := old.unlimited_creations;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute procedure public.guard_profile_privileges();

-- ── crafts ────────────────────────────────────────────────────────────────
create table if not exists public.crafts (
  id bigint generated always as identity primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  -- Nullable: Create flow now sets this at the metadata step, after generation,
  -- not at craft-row creation time (see frontend/src/pages/MetadataPage.jsx).
  title text,
  craft_type text,
  material text,
  technique text,
  story text,
  dimensions text,
  weight double precision,
  -- Optional, separate from the free-text `dimensions` above — when set, CraftPage.jsx
  -- rescales the GLB to this real height (on-page preview and AR both), since InstantMesh's
  -- single-image reconstruction has no way to know actual physical size on its own.
  height_cm double precision,
  location text,
  year integer,
  commercial_status text,
  license text,
  is_public boolean not null default false,
  photos jsonb not null default '[]'::jsonb,
  model_key text,
  keywords jsonb not null default '[]'::jsonb,
  version_history jsonb not null default '[]'::jsonb,
  related_designs jsonb not null default '[]'::jsonb,
  -- Set when this craft's photo is an AI co-creation started from an existing design (picked
  -- via CoCreatePanel's library search, frontend/src/pages/CreatePage.jsx). NULL for a plain
  -- upload. `on delete set null`, not cascade: deleting the parent design must not take its
  -- derivatives down with it — see AGENTS.md §5b.
  parent_design_id bigint references public.crafts (id) on delete set null,
  est_build_time text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- create table if not exists (above) won't add this column to an already-existing crafts
-- table — needed the first time this migration runs after the column was added.
alter table public.crafts
  add column if not exists parent_design_id bigint references public.crafts (id) on delete set null;
alter table public.crafts
  add column if not exists height_cm double precision;

create index if not exists crafts_owner_id_idx on public.crafts (owner_id);
create index if not exists crafts_parent_design_id_idx on public.crafts (parent_design_id);

alter table public.crafts enable row level security;

drop policy if exists crafts_select on public.crafts;
create policy crafts_select on public.crafts
  for select using (is_public = true or owner_id = auth.uid());

drop policy if exists crafts_insert on public.crafts;
create policy crafts_insert on public.crafts
  for insert with check (owner_id = auth.uid());

drop policy if exists crafts_update on public.crafts;
create policy crafts_update on public.crafts
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Owner-only delete, for My Library's delete option (LibraryPage.jsx). `jobs` rows for the
-- craft cascade via jobs.craft_id's `on delete cascade` FK — no separate jobs policy needed.
-- Storage objects (photos/model.glb) do NOT cascade (separate system); LibraryPage removes
-- those itself before deleting the row, via PATHS_delete_own below.
drop policy if exists crafts_delete on public.crafts;
create policy crafts_delete on public.crafts
  for delete using (owner_id = auth.uid());

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crafts_set_updated_at on public.crafts;
create trigger crafts_set_updated_at
  before update on public.crafts
  for each row execute procedure public.set_updated_at();

-- ── jobs ──────────────────────────────────────────────────────────────────
create table if not exists public.jobs (
  id bigint generated always as identity primary key,
  craft_id bigint not null references public.crafts (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists jobs_craft_id_idx on public.jobs (craft_id);

alter table public.jobs enable row level security;

drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs
  for select using (
    exists (select 1 from public.crafts c where c.id = craft_id and c.owner_id = auth.uid())
  );

drop policy if exists jobs_insert on public.jobs;
create policy jobs_insert on public.jobs
  for insert with check (
    exists (select 1 from public.crafts c where c.id = craft_id and c.owner_id = auth.uid())
  );

drop policy if exists jobs_update on public.jobs;
create policy jobs_update on public.jobs
  for update using (
    exists (select 1 from public.crafts c where c.id = craft_id and c.owner_id = auth.uid())
  );

-- Daily creation credit: 5 reconstruction jobs per user per UTC calendar day. Enforced
-- here (not just in frontend/instantmesh-proxy) so it holds regardless of entry point —
-- each job consumes real GPU time on submission, whether or not it later succeeds.
create or replace function public.check_daily_job_limit()
returns trigger
language plpgsql
as $$
declare
  daily_limit constant integer := 5;
  today_count integer;
begin
  if exists (select 1 from public.profiles p where p.id = auth.uid() and p.unlimited_creations) then
    return new;
  end if;

  select count(*) into today_count
  from public.jobs j
  join public.crafts c on c.id = j.craft_id
  where c.owner_id = auth.uid()
    and j.created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');

  if today_count >= daily_limit then
    raise exception 'Daily creation limit reached (% per day) — try again tomorrow.', daily_limit;
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_daily_limit on public.jobs;
create trigger jobs_daily_limit
  before insert on public.jobs
  for each row execute procedure public.check_daily_job_limit();

-- ── storage bucket ("PATHS"): public read, owner-scoped writes ─────────────
insert into storage.buckets (id, name, public)
values ('PATHS', 'PATHS', true)
on conflict (id) do update set public = true;

drop policy if exists PATHS_insert_own on storage.objects;
create policy PATHS_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'PATHS' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists PATHS_update_own on storage.objects;
create policy PATHS_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'PATHS' and (storage.foldername(name))[1] = auth.uid()::text);

-- Upsert (used by reconstruction.js re-uploading model.glb) needs SELECT too — the
-- storage API checks for a conflicting existing row before deciding insert vs. update,
-- and that check is itself RLS-gated. Without this, upsert:true 400s even though a
-- plain non-upsert insert succeeds.
drop policy if exists PATHS_select_own on storage.objects;
create policy PATHS_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'PATHS' and (storage.foldername(name))[1] = auth.uid()::text);

-- Owner-only delete, for My Library's delete option (LibraryPage.jsx removes a craft's
-- photos + model.glb before deleting the crafts row itself).
drop policy if exists PATHS_delete_own on storage.objects;
create policy PATHS_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'PATHS' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── likes ─────────────────────────────────────────────────────────────────
-- Per-user likes on crafts (one row per (user, craft)). Counts start at zero
-- for every craft until a real user likes it — no demo/placeholder data.
-- This table already existed live (created ad hoc, not through this file) before this
-- entry was added — CraftPage.jsx's like button (2026-08-10) is the first thing to
-- actually use it; brought into schema.sql/migrations so a fresh project gets it too.
create table if not exists public.likes (
  id bigint generated always as identity primary key,
  craft_id bigint not null references public.crafts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (craft_id, user_id)
);

create index if not exists likes_craft_id_idx on public.likes (craft_id);

alter table public.likes enable row level security;

-- Inserting a like requires an authenticated user and records their own uid.
drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes
  for insert with check (auth.uid() = user_id);

-- Deleting (unliking) a like: only the row's own user can remove it.
drop policy if exists likes_delete on public.likes;
create policy likes_delete on public.likes
  for delete using (auth.uid() = user_id);

-- Counting likes: every viewer (guests + logged-in) may read like rows so the
-- count is visible on public/own crafts. The parent-craft visibility is already
-- controlled by the crafts RLS policy.
drop policy if exists likes_select on public.likes;
create policy likes_select on public.likes
  for select using (
    exists (select 1 from public.crafts c where c.id = craft_id)
  );

-- ── super-admin flag + full-table admin access ──────────────────────────────
-- Backs frontend/src/pages/AdminPage.jsx (full CRUD across every table + a Storage media
-- browser). See migrations/006_super_admin.sql for the standalone version of this block.
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

-- Security-definer wrapper so RLS policies on OTHER tables can check "is this caller a
-- super admin" via a plain function call instead of a subquery against profiles — avoids
-- any RLS-recursion subtlety when a policy on profiles itself needs the same check, and
-- keeps every admin policy below identical/copy-pasteable.
create or replace function public.is_super_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_super_admin from public.profiles p where p.id = uid), false);
$$;

grant execute on function public.is_super_admin(uuid) to authenticated;

-- Admin policies are additive alongside the existing owner-scoped ones (Postgres RLS
-- ORs same-command policies together) — a super admin gets full read/write on every row
-- of every table below; everyone else's access is unchanged.

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

drop policy if exists crafts_admin_all on public.crafts;
create policy crafts_admin_all on public.crafts
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

drop policy if exists jobs_admin_all on public.jobs;
create policy jobs_admin_all on public.jobs
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

drop policy if exists likes_admin_all on public.likes;
create policy likes_admin_all on public.likes
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- Storage objects: lets the admin Media tab list/preview/delete any file in the bucket,
-- not just the caller's own folder (see PATHS_*_own policies above).
drop policy if exists storage_admin_all on storage.objects;
create policy storage_admin_all on storage.objects
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- ── craft image provenance (original photo vs AI-generated) ────────────────
-- Set at creation time by frontend/src/pages/CreatePage.jsx: 'original' for a direct
-- photo upload, 'ai_generated' whenever the photo came out of CoCreatePanel (Fooocus),
-- with or without a parent_design_id. Drives the AI badge on craft cards.
alter table public.crafts
  add column if not exists image_source text not null default 'original'
    check (image_source in ('original', 'ai_generated'));

-- Backfills rows created before the column above existed — every one of them silently got
-- 'original' regardless of how it was actually made, so the AI badge on craft cards never
-- showed for any pre-existing AI co-creation. Only a subset is recoverable with certainty:
-- a non-null parent_design_id only ever gets set by the co-creation path (picking an
-- existing design as the AI generation's starting point), never by a plain photo upload —
-- so "has a parent" reliably means "this was AI-generated". Crafts co-created from scratch
-- (no library pick) before this column existed aren't recoverable from the data at all —
-- fix those manually via /admin -> Crafts -> Edit -> Image source, per row.
update public.crafts
set image_source = 'ai_generated'
where parent_design_id is not null
  and image_source = 'original';

-- Enforces the role split at insert time — visitors get AI co-creation, artisans get
-- original uploads, never both (super admins bypass this). Belt-and-braces alongside
-- CreatePage.jsx only showing the applicable method per role: this app has no backend,
-- so RLS/triggers are the actual authorization boundary, the frontend gate is just UX.
create or replace function public.guard_craft_image_source()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  owner_role text;
begin
  if public.is_super_admin(auth.uid()) then
    return new;
  end if;

  select role into owner_role from public.profiles where id = new.owner_id;

  if new.image_source = 'original' and owner_role is distinct from 'artisan' then
    raise exception 'Only artisans can upload an original photo.';
  end if;

  if new.image_source = 'ai_generated' and owner_role is distinct from 'visitor' then
    raise exception 'Only visitors can use AI co-creation.';
  end if;

  return new;
end;
$$;

drop trigger if exists crafts_guard_image_source on public.crafts;
create trigger crafts_guard_image_source
  before insert on public.crafts
  for each row execute procedure public.guard_craft_image_source();

-- ── job type (Image Gen vs 3D Gen) ──────────────────────────────────────
-- Every jobs row today is a 3D reconstruction (InstantMesh) job — Fooocus image
-- generation (CoCreatePanel) happens client-side before any jobs row exists and isn't
-- tracked here. Defaulting existing/new rows to '3d_gen' reflects that; 'image_gen'
-- is reserved for if/when that step also gets a tracked row. Admin-visible only for now
-- (frontend/src/data/adminTables.js) — nothing currently sets 'image_gen'.
alter table public.jobs
  add column if not exists job_type text not null default '3d_gen'
    check (job_type in ('image_gen', '3d_gen'));

-- ── grant super admin to apon555@gmail.com ──────────────────────────────
-- No-op (0 rows) if this email hasn't signed up yet — re-run after they do.
update public.profiles
set is_super_admin = true
where id = (select u.id from auth.users u where u.email = 'apon555@gmail.com');
