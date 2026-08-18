-- PATHS studio role hierarchy migration. Depends on 006_super_admin.sql,
-- 007_role_restructure.sql (profiles.role, guard_profile_privileges()) and
-- 009_manager_commissions.sql (is_manager(), profiles.is_manager). Replaces the single
-- narrow is_manager boolean added in 009 with a proper five-tier role hierarchy —
-- customer/artisan/designer/studio_manager/studio_admin — plus role-assignment authority
-- so Studio Admins/Managers can promote people themselves instead of everything routing
-- through a super admin by hand. is_super_admin stays a separate flag: it's raw database
-- access, categorically different from these five studio-workflow tiers, and already
-- wired as an unconditional bypass into every other table's RLS.
--
-- Explicit transaction + table lock: this is a live project (real signups can happen at
-- any moment), and the backfill-then-tighten-constraint shape below has a real race
-- window otherwise — a signup landing between the backfill and the final `add constraint`
-- inserts a fresh 'visitor' row (handle_new_user() isn't redefined until partway through
-- this same script) that slips past the backfill and trips the constraint at the very
-- last statement. LOCK ... IN ACCESS EXCLUSIVE MODE blocks any concurrent read/write to
-- profiles for the duration — no different from the lock `add constraint` would need to
-- take internally anyway, just held for the whole migration instead of acquired right at
-- the end where a straggler could already be waiting.
begin;

lock table public.profiles in access exclusive mode;

-- profiles_guard_privileges (007_role_restructure.sql) is still the OLD version at this
-- point in the script — it reverts any change to `role` unless the caller is already a
-- super admin. Running this migration as plain SQL in the editor has no authenticated
-- session, so auth.uid() is NULL and is_super_admin(NULL) is false — every backfill
-- UPDATE below would otherwise be silently no-opped by that trigger before it ever
-- reaches the tightened constraint (this is what actually caused the constraint failure
-- on prior attempts, not bad data or a race — the backfill was never taking effect at
-- all). Disabled for exactly the backfill window, re-enabled once the new role value has
-- landed and the function itself has been redefined below.
alter table public.profiles disable trigger profiles_guard_privileges;

-- ── role enum expansion + data backfill ──────────────────────────────────
-- Drop the constraint outright rather than widening to a specific fixed set first — this
-- project's role column has gone through more than one shape over time (the pre-007
-- history included values beyond just visitor/artisan), so a live table can hold a role
-- value this migration doesn't know about in advance. Backfilling with the constraint
-- off, then sweeping up anything still unrecognized in one final catch-all below, is
-- robust to that regardless of what the leftover value actually is.
alter table public.profiles drop constraint if exists profiles_role_check;

-- 'visitor' -> 'customer': same default tier, renamed for the studio/customer framing.
update public.profiles set role = 'customer' where role = 'visitor';

-- Backfill 009's is_manager flag into the new role column before it's dropped below.
-- Collapses onto studio_manager regardless of the row's prior role — the old model let
-- is_manager coexist with any role (e.g. an artisan who also reviews), which a single
-- role column can't represent; studio_manager already implies everything
-- artisan/designer/customer could do via the cumulative-capability model this migration
-- introduces, so this is the closest lossless mapping. In practice a no-op today —
-- is_manager was only added in 009 and nothing on the live project has been granted it.
update public.profiles set role = 'studio_manager' where is_manager = true;

-- Catch-all: any row still not one of the five target values (an older/unexpected
-- historical role this migration didn't anticipate) becomes 'customer' — the safe, most
-- restrictive default — rather than being left to fail the tightened constraint below.
update public.profiles set role = 'customer'
  where role not in ('customer', 'artisan', 'designer', 'studio_manager', 'studio_admin');

-- Every new signup still gets inserted with the literal role 'visitor' by
-- handle_new_user() (base schema) until redefined here — left as-is, the tightened
-- constraint further below would reject every new signup outright (profiles_role_check no
-- longer allows 'visitor' at all once that runs).
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
    'customer',
    new.raw_user_meta_data ->> 'institution',
    new.raw_user_meta_data ->> 'department'
  );
  return new;
end;
$$;

-- guard_craft_image_source() (schema.sql) still hard-codes the retired 'visitor' value in
-- its AI-co-creation check — left as-is, every 'customer'-role row (today's renamed
-- default tier) would fail `owner_role not in ('visitor', 'artisan')` and get silently
-- blocked from co-creating, a regression nobody asked for. The five-role hierarchy has no
-- reason to keep the same narrow allow-list here: co-creation is a universal capability
-- (a designer's whole job is co-creating; studio staff should be able to as well) — only
-- the *original*-photo-upload path stays artisan-exclusive, unchanged below.
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

  return new;
end;
$$;

-- Redefine is_manager()'s body (role-based, not the retiring boolean column) before that
-- column is dropped below, so the function is never left referencing a column that no
-- longer exists even transiently. Still named is_manager() here — 011 renames it to
-- is_studio_manager_or_above() in the same pass that renames the tables that use it.
create or replace function public.is_manager(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role in ('studio_manager', 'studio_admin') from public.profiles p where p.id = uid),
    false
  ) or public.is_super_admin(uid);
$$;

-- Now that every row has been backfilled to one of the five target values (including the
-- catch-all above), it's safe to tighten the constraint down to exactly that set and drop
-- the retired is_manager column.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('customer', 'artisan', 'designer', 'studio_manager', 'studio_admin'));
alter table public.profiles alter column role set default 'customer';

alter table public.profiles drop column if exists is_manager;

-- Safe to re-enable now — every row already holds its final backfilled role value, and
-- guard_profile_privileges() is about to be redefined below anyway (any further update
-- issued from here on, including by real traffic once this transaction commits, should
-- go through the trigger normally).
alter table public.profiles enable trigger profiles_guard_privileges;

-- ── role-assignment authority ────────────────────────────────────────────
-- Pure allow-list, not a numeric-rank comparison — a rank comparison would incorrectly
-- let a studio_manager (ranked above customer) also "manage" customers, which isn't what
-- was specified (studio_manager manages only artisan/designer, not customer). Shared by
-- guard_profile_privileges() below and by acting_manages_role() further down, which reuses
-- it as an "is this role in my manageable set" check by passing the same value twice.
create or replace function public.can_assign_role(actor_role text, prev_role text, next_role text)
returns boolean
language sql
immutable
as $$
  select case actor_role
    when 'studio_admin' then
      prev_role in ('customer', 'studio_manager', 'artisan', 'designer')
      and next_role in ('customer', 'studio_manager', 'artisan', 'designer')
    when 'studio_manager' then
      prev_role in ('customer', 'artisan', 'designer')
      and next_role in ('customer', 'artisan', 'designer')
    else false
  end;
$$;

grant execute on function public.can_assign_role(text, text, text) to authenticated;

-- Redefines guard_profile_privileges() (007_role_restructure.sql) — is_super_admin and
-- unlimited_creations stay super-admin-only exactly as before; `role` changes are now
-- additionally permitted for a caller whose own role can_assign_role() the requested
-- transition. Self-escalation stays blocked for free: nobody's manageable set (above)
-- includes their own tier or higher, so e.g. a studio_manager updating their own row
-- (old.role = 'studio_manager') never matches either can_assign_role branch.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  acting_role text;
begin
  if public.is_super_admin(auth.uid()) then
    return new;
  end if;

  new.is_super_admin := old.is_super_admin;
  new.unlimited_creations := old.unlimited_creations;

  if new.role is distinct from old.role then
    select role into acting_role from public.profiles where id = auth.uid();
    if not public.can_assign_role(acting_role, old.role, new.role) then
      new.role := old.role;
    end if;
  end if;

  return new;
end;
$$;

-- ── team visibility + management ─────────────────────────────────────────
-- security definer, same reasoning as is_super_admin()/is_manager(): lets an RLS policy
-- on profiles check the caller's own role without recursing into profiles' own RLS.
-- Reuses can_assign_role() by passing target_role as both prev/next — that reduces to a
-- plain "is target_role in my manageable set" test without a second lookup table.
create or replace function public.acting_manages_role(target_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.can_assign_role(p.role, target_role, target_role) from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

grant execute on function public.acting_manages_role(text) to authenticated;

-- Additive alongside profiles_select_own/profiles_update_own (base schema) and
-- profiles_admin_all (006) — a studio_admin/studio_manager can see and edit the profile
-- rows of people in their manageable set, on top of their own row. Row-level only, same
-- as every other policy in this app: this doesn't restrict *which columns* they may
-- change (e.g. full_name is reachable too, not just role) — guard_profile_privileges()
-- above is what actually gates the privilege-bearing columns.
drop policy if exists profiles_select_team on public.profiles;
create policy profiles_select_team on public.profiles
  for select using (public.acting_manages_role(role));

drop policy if exists profiles_update_team on public.profiles;
create policy profiles_update_team on public.profiles
  for update using (public.acting_manages_role(role)) with check (public.acting_manages_role(role));

commit;
