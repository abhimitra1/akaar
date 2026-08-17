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

-- Enforces the role split at insert time — original-photo uploads are artisan-only (they're
-- documenting a real object), AI co-creation is open to both visitors and artisans (super
-- admins bypass this too). Belt-and-braces alongside CreatePage.jsx only showing the
-- applicable methods per role: this app has no backend, so RLS/triggers are the actual
-- authorization boundary, the frontend gate is just UX.
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

  if new.image_source = 'ai_generated' and owner_role not in ('visitor', 'artisan') then
    raise exception 'Only visitors or artisans can use AI co-creation.';
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

-- ── manager review + marketplace commissions (see migrations/009_manager_commissions.sql
-- for the standalone version of this block, and its own header comment for the full
-- rationale) ─────────────────────────────────────────────────────────────

-- manager capability flag: mirrors is_super_admin's shape, narrower in what it grants.
alter table public.profiles
  add column if not exists is_manager boolean not null default false;

create or replace function public.is_manager(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_manager from public.profiles p where p.id = uid), false);
$$;

grant execute on function public.is_manager(uuid) to authenticated;

-- Redefines guard_profile_privileges() (defined further up this file) to also protect
-- is_manager from self-escalation, same as role/is_super_admin/unlimited_creations.
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
    new.is_manager := old.is_manager;
  end if;
  return new;
end;
$$;

-- commissions: one row per "make this stored design into a physical piece" request.
-- Make-to-order — always points at an already-reconstructed craft (model_key must be set).
create table if not exists public.commissions (
  id bigint generated always as identity primary key,
  craft_id bigint not null references public.crafts (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  artisan_id uuid references public.profiles (id) on delete set null,
  status text not null default 'pending_manager_review'
    check (status in (
      'pending_manager_review',
      'changes_requested',
      'pending_customer_approval',
      'ratified',
      'in_production',
      'completed',
      'rejected',
      'cancelled'
    )),
  -- Payment columns reserved, not enforced anywhere yet — see migration 009's header
  -- comment: no payment processor is integrated in this app, picking one is a separate,
  -- compliance-sensitive decision.
  price numeric,
  currency text not null default 'INR',
  payment_status text not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ratified_at timestamptz
);

create index if not exists commissions_craft_id_idx on public.commissions (craft_id);
create index if not exists commissions_customer_id_idx on public.commissions (customer_id);
create index if not exists commissions_status_idx on public.commissions (status);

alter table public.commissions enable row level security;

drop trigger if exists commissions_set_updated_at on public.commissions;
create trigger commissions_set_updated_at
  before update on public.commissions
  for each row execute procedure public.set_updated_at();

create or replace function public.guard_commission_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  craft_owner uuid;
  craft_model_key text;
begin
  select owner_id, model_key into craft_owner, craft_model_key
  from public.crafts where id = new.craft_id;

  if craft_owner is null then
    raise exception 'Craft not found.';
  end if;
  if craft_owner is distinct from auth.uid() and not public.is_super_admin(auth.uid()) then
    raise exception 'You can only submit your own designs for production.';
  end if;
  if craft_model_key is null then
    raise exception 'This design needs a finished 3D model before it can be submitted for production.';
  end if;

  new.customer_id := craft_owner;
  new.status := 'pending_manager_review';
  new.artisan_id := null;
  new.ratified_at := null;
  return new;
end;
$$;

drop trigger if exists commissions_guard_insert on public.commissions;
create trigger commissions_guard_insert
  before insert on public.commissions
  for each row execute procedure public.guard_commission_insert();

-- The commission state machine — see migration 009's header comment for the full
-- transition table this enforces (manager decides from pending_manager_review; customer
-- resolves changes_requested/pending_customer_approval; either may cancel a still-queued
-- request). Anything not explicitly allowed raises rather than silently no-opping.
create or replace function public.guard_commission_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  acting_manager boolean := public.is_manager(auth.uid()) or public.is_super_admin(auth.uid());
  acting_customer boolean := old.customer_id = auth.uid();
  allowed boolean := false;
begin
  if public.is_super_admin(auth.uid()) then
    return new;
  end if;

  new.customer_id := old.customer_id;
  new.price := old.price;
  new.currency := old.currency;
  new.payment_status := old.payment_status;
  new.created_at := old.created_at;

  if acting_manager and old.status = 'pending_manager_review'
     and new.status in ('changes_requested', 'pending_customer_approval', 'rejected') then
    allowed := true;
    new.artisan_id := old.artisan_id;
    new.ratified_at := old.ratified_at;

  elsif acting_manager and old.status = 'pending_manager_review' and new.status = 'pending_manager_review' then
    -- "Rework it here": the manager regenerated the design themselves without making a
    -- decision yet — status is unchanged, only craft_id moves (to the fresh design).
    allowed := true;
    new.artisan_id := old.artisan_id;
    new.ratified_at := old.ratified_at;

  elsif acting_customer and old.status = 'changes_requested' and new.status = 'pending_manager_review' then
    allowed := true;
    new.artisan_id := old.artisan_id;
    new.ratified_at := old.ratified_at;

  elsif acting_customer and old.status = 'pending_customer_approval' and new.status in ('ratified', 'cancelled') then
    allowed := true;
    new.craft_id := old.craft_id;
    new.artisan_id := old.artisan_id;
    new.ratified_at := case when new.status = 'ratified' then now() else old.ratified_at end;

  elsif acting_customer and old.status = 'pending_manager_review' and new.status = 'cancelled' then
    allowed := true;
    new.craft_id := old.craft_id;
    new.artisan_id := old.artisan_id;
    new.ratified_at := old.ratified_at;
  end if;

  if not allowed then
    raise exception 'That status change is not allowed from %.', old.status;
  end if;

  return new;
end;
$$;

drop trigger if exists commissions_guard_transition on public.commissions;
create trigger commissions_guard_transition
  before update on public.commissions
  for each row execute procedure public.guard_commission_transition();

drop policy if exists commissions_select on public.commissions;
create policy commissions_select on public.commissions
  for select using (
    customer_id = auth.uid() or public.is_manager(auth.uid()) or public.is_super_admin(auth.uid())
  );

drop policy if exists commissions_insert on public.commissions;
create policy commissions_insert on public.commissions
  for insert with check (
    customer_id = auth.uid() or public.is_super_admin(auth.uid())
  );

drop policy if exists commissions_update on public.commissions;
create policy commissions_update on public.commissions
  for update
  using (customer_id = auth.uid() or public.is_manager(auth.uid()) or public.is_super_admin(auth.uid()))
  with check (customer_id = auth.uid() or public.is_manager(auth.uid()) or public.is_super_admin(auth.uid()));

drop policy if exists commissions_admin_all on public.commissions;
create policy commissions_admin_all on public.commissions
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- commission_reviews: append-only audit trail, one row per manager decision round.
create table if not exists public.commission_reviews (
  id bigint generated always as identity primary key,
  commission_id bigint not null references public.commissions (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  decision text not null check (decision in ('changes_requested', 'approved', 'rejected')),
  remarks text,
  -- { [criterion_key]: { status: 'ok'|'not_feasible'|'n/a', note: text } } — see
  -- frontend/src/data/feasibilityChecklist.js.
  constraint_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists commission_reviews_commission_id_idx on public.commission_reviews (commission_id);

alter table public.commission_reviews enable row level security;

drop policy if exists commission_reviews_select on public.commission_reviews;
create policy commission_reviews_select on public.commission_reviews
  for select using (
    exists (
      select 1 from public.commissions c
      where c.id = commission_id
        and (c.customer_id = auth.uid() or public.is_manager(auth.uid()) or public.is_super_admin(auth.uid()))
    )
  );

drop policy if exists commission_reviews_insert on public.commission_reviews;
create policy commission_reviews_insert on public.commission_reviews
  for insert with check (
    reviewer_id = auth.uid()
    and (public.is_manager(auth.uid()) or public.is_super_admin(auth.uid()))
    and exists (select 1 from public.commissions c where c.id = commission_id and c.status = 'pending_manager_review')
  );

drop policy if exists commission_reviews_admin_all on public.commission_reviews;
create policy commission_reviews_admin_all on public.commission_reviews
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- notifications: minimal in-app only (no email/push in this app). Written exclusively by
-- notify_commission_status_change() below (security definer) — no client insert policy.
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  commission_id bigint references public.commissions (id) on delete cascade,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications (user_id, read);

alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_admin_all on public.notifications;
create policy notifications_admin_all on public.notifications
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

create or replace function public.notify_commission_status_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if new.status = 'changes_requested' then
    insert into public.notifications (user_id, commission_id, message)
    values (new.customer_id, new.id, 'A manager requested changes to your design — see their remarks and rework it.');
  elsif new.status = 'pending_customer_approval' then
    insert into public.notifications (user_id, commission_id, message)
    values (new.customer_id, new.id, 'Your design passed feasibility review — confirm to move forward.');
  elsif new.status = 'rejected' then
    insert into public.notifications (user_id, commission_id, message)
    values (new.customer_id, new.id, 'Your production request was declined.');
  end if;
  return new;
end;
$$;

drop trigger if exists commissions_notify on public.commissions;
create trigger commissions_notify
  after update on public.commissions
  for each row execute procedure public.notify_commission_status_change();
