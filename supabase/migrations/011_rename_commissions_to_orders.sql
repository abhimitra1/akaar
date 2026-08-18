-- Pure rename: commissions -> orders, commission_reviews -> order_reviews, plus
-- is_manager() -> is_studio_manager_or_above() (batched here since it's the same kind of
-- rename, and every call site being updated already lives inside the objects this file
-- touches). Depends on 009_manager_commissions.sql and 010_role_hierarchy.sql.
--
-- Table/column renames use ALTER ... RENAME (preserves any existing rows). Every
-- function/trigger/policy that *mentions* the renamed table/column is dropped and
-- recreated under its new name with its body text updated to match — Postgres does not
-- rewrite the literal source text inside a plpgsql function body just because a table it
-- references gets renamed, so leaving those via a plain ALTER FUNCTION ... RENAME would
-- have left them silently broken (still calling out to "commissions", which would no
-- longer exist under that name) the next time they ran.

alter table public.commissions rename to orders;
alter table public.commission_reviews rename to order_reviews;
alter table public.order_reviews rename column commission_id to order_id;
alter table public.notifications rename column commission_id to order_id;

alter index if exists commissions_craft_id_idx rename to orders_craft_id_idx;
alter index if exists commissions_customer_id_idx rename to orders_customer_id_idx;
alter index if exists commissions_status_idx rename to orders_status_idx;
alter index if exists commission_reviews_commission_id_idx rename to order_reviews_order_id_idx;

alter sequence if exists public.commissions_id_seq rename to orders_id_seq;
alter sequence if exists public.commission_reviews_id_seq rename to order_reviews_id_seq;

alter trigger commissions_set_updated_at on public.orders rename to orders_set_updated_at;

-- ── is_manager() -> is_studio_manager_or_above() ─────────────────────────
-- Body unchanged from 010's redefinition (role-based, not the retired boolean column) —
-- only the name changes, since "is_manager" now misleadingly implies a boolean flag that
-- no longer exists.
create or replace function public.is_studio_manager_or_above(uid uuid)
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

grant execute on function public.is_studio_manager_or_above(uuid) to authenticated;

-- Not dropped here yet — the old commissions_select/commissions_update/
-- commission_reviews_select/commission_reviews_insert policies (further below) still
-- call is_manager(uuid) in their USING/WITH CHECK expressions, and Postgres won't drop a
-- function while any policy still depends on it. Dropped instead at the very end of this
-- file, once every one of those policies has already been replaced.

-- ── guard_order_insert (was guard_commission_insert) ─────────────────────
create or replace function public.guard_order_insert()
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

drop trigger if exists commissions_guard_insert on public.orders;
drop function if exists public.guard_commission_insert();
drop trigger if exists orders_guard_insert on public.orders;
create trigger orders_guard_insert
  before insert on public.orders
  for each row execute procedure public.guard_order_insert();

-- ── guard_order_transition (was guard_commission_transition) ─────────────
create or replace function public.guard_order_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  acting_manager boolean := public.is_studio_manager_or_above(auth.uid());
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

drop trigger if exists commissions_guard_transition on public.orders;
drop function if exists public.guard_commission_transition();
drop trigger if exists orders_guard_transition on public.orders;
create trigger orders_guard_transition
  before update on public.orders
  for each row execute procedure public.guard_order_transition();

-- ── notify_order_status_change (was notify_commission_status_change) ─────
create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if new.status = 'changes_requested' then
    insert into public.notifications (user_id, order_id, message)
    values (new.customer_id, new.id, 'A studio manager requested changes to your design — see their remarks and rework it.');
  elsif new.status = 'pending_customer_approval' then
    insert into public.notifications (user_id, order_id, message)
    values (new.customer_id, new.id, 'Your design passed feasibility review — confirm to move forward.');
  elsif new.status = 'rejected' then
    insert into public.notifications (user_id, order_id, message)
    values (new.customer_id, new.id, 'Your production request was declined.');
  end if;
  return new;
end;
$$;

drop trigger if exists commissions_notify on public.orders;
drop function if exists public.notify_commission_status_change();
drop trigger if exists orders_notify on public.orders;
create trigger orders_notify
  after update on public.orders
  for each row execute procedure public.notify_order_status_change();

-- ── policies: orders (was commissions) ─────────────────────────────────────
drop policy if exists commissions_select on public.orders;
drop policy if exists commissions_insert on public.orders;
drop policy if exists commissions_update on public.orders;
drop policy if exists commissions_admin_all on public.orders;

drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (
    customer_id = auth.uid() or public.is_studio_manager_or_above(auth.uid())
  );

drop policy if exists orders_insert on public.orders;
create policy orders_insert on public.orders
  for insert with check (
    customer_id = auth.uid() or public.is_super_admin(auth.uid())
  );

drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders
  for update
  using (customer_id = auth.uid() or public.is_studio_manager_or_above(auth.uid()))
  with check (customer_id = auth.uid() or public.is_studio_manager_or_above(auth.uid()));

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all on public.orders
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- ── policies: order_reviews (was commission_reviews) ────────────────────────
drop policy if exists commission_reviews_select on public.order_reviews;
drop policy if exists commission_reviews_insert on public.order_reviews;
drop policy if exists commission_reviews_admin_all on public.order_reviews;

drop policy if exists order_reviews_select on public.order_reviews;
create policy order_reviews_select on public.order_reviews
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.customer_id = auth.uid() or public.is_studio_manager_or_above(auth.uid()))
    )
  );

drop policy if exists order_reviews_insert on public.order_reviews;
create policy order_reviews_insert on public.order_reviews
  for insert with check (
    reviewer_id = auth.uid()
    and public.is_studio_manager_or_above(auth.uid())
    and exists (select 1 from public.orders o where o.id = order_id and o.status = 'pending_manager_review')
  );

drop policy if exists order_reviews_admin_all on public.order_reviews;
create policy order_reviews_admin_all on public.order_reviews
  for all using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));

-- Every policy that referenced is_manager(uuid) has been dropped/replaced above — safe to
-- drop it now.
drop function if exists public.is_manager(uuid);
