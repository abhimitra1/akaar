-- Collapses profiles.role from the old 6-value self-selected enum down to two
-- admin-assigned roles: 'visitor' (default for everyone) and 'artisan' (grants access to
-- original-photo uploads; visitors get AI co-creation instead — see
-- guard_craft_image_source() below). Role is no longer choosable at signup; a visitor
-- requests artisan status via AccountPage.jsx, a super admin grants it via /admin.
-- Depends on: 006_super_admin.sql (is_super_admin()).

-- ── existing rows: everyone becomes visitor except the two named exceptions ─
update public.profiles
set role = 'visitor'
where email not in ('apon555@gmail.com', 'ss5494602@gmail.com');

update public.profiles
set role = 'artisan'
where email in ('apon555@gmail.com', 'ss5494602@gmail.com');

-- ── tighten the role constraint to the new two-value set ───────────────────
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('visitor', 'artisan'));

-- ── self-service "apply for artisan" marker ─────────────────────────────
-- Set by AccountPage.jsx's "Apply to become an Artisan" button; cleared by nothing
-- automatically — a super admin reviews requested-but-still-visitor profiles in /admin
-- and flips role to 'artisan' by hand (or leaves it, denying implicitly for now — no
-- reject/notify flow yet, see AccountPage.jsx comment).
alter table public.profiles
  add column if not exists artisan_requested_at timestamptz;

-- ── signup no longer sets role from client metadata ─────────────────────
-- Every new profile starts as 'visitor' regardless of what SignUpPage/Google OAuth
-- metadata says (SignUpPage.jsx's role picker is gone, but this is the actual source of
-- truth either way — never trust the client for a privilege-bearing column).
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

-- ── block self-escalation of privilege columns ──────────────────────────
-- profiles_update_own (schema.sql) lets any user update their OWN row with no column
-- restriction — that's fine for full_name/institution/department, but without this
-- trigger a plain authenticated client could `update profiles set role='artisan'` (or
-- is_super_admin/unlimited_creations) on themselves directly, bypassing the whole point
-- of "admin-assigned only." RLS is row-level only, so column-level protection has to be
-- a trigger: silently reverts these three columns unless the acting user already is a
-- super admin (who legitimately edits them via /admin's Profiles tab).
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

-- ── enforce the role split on crafts.image_source at insert time ───────
-- Belt-and-braces alongside CreatePage.jsx only showing the applicable method per role
-- (this app has no backend — RLS/triggers are the actual authorization boundary, the
-- frontend gate is just UX). Super admins bypass this, same rationale as above.
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
