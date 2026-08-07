-- AKAAR backendless migration: profiles/crafts/jobs tables + RLS + storage bucket.
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
  role text not null default 'visitor'
    check (role in ('visitor', 'student', 'artisan', 'faculty', 'researcher', 'designer')),
  institution text,
  department text,
  email_verified boolean not null default true,
  -- Exempts this user from check_daily_job_limit()'s 5/day cap (testers, staff).
  -- Not exposed anywhere in app UI — set manually via SQL editor.
  unlimited_creations boolean not null default false,
  created_at timestamptz not null default now()
);

-- create table if not exists (above) won't add this column to an already-existing
-- profiles table — needed the first time this migration runs after the column was added.
alter table public.profiles
  add column if not exists unlimited_creations boolean not null default false;

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
-- bypasses RLS; runs once per new auth user).
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
    coalesce(new.raw_user_meta_data ->> 'role', 'visitor'),
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
  est_build_time text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crafts_owner_id_idx on public.crafts (owner_id);

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

-- ── storage bucket ("akaar"): public read, owner-scoped writes ─────────────
insert into storage.buckets (id, name, public)
values ('akaar', 'akaar', true)
on conflict (id) do update set public = true;

drop policy if exists akaar_insert_own on storage.objects;
create policy akaar_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'akaar' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists akaar_update_own on storage.objects;
create policy akaar_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'akaar' and (storage.foldername(name))[1] = auth.uid()::text);

-- Upsert (used by reconstruction.js re-uploading model.glb) needs SELECT too — the
-- storage API checks for a conflicting existing row before deciding insert vs. update,
-- and that check is itself RLS-gated. Without this, upsert:true 400s even though a
-- plain non-upsert insert succeeds.
drop policy if exists akaar_select_own on storage.objects;
create policy akaar_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'akaar' and (storage.foldername(name))[1] = auth.uid()::text);
