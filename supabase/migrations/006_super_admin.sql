-- Super-admin role + an admin-managed craft attribute (original vs AI-generated source
-- photo). Backs frontend/src/pages/AdminPage.jsx (full CRUD across every table + Storage
-- media browser) and the "AI Generated" badge shown on craft cards.
-- Depends on: schema.sql's profiles/crafts/jobs/likes/storage.objects already existing.

-- ── super-admin flag ─────────────────────────────────────────────────────
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
-- not just the caller's own folder (see PATHS_*_own policies in schema.sql).
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
