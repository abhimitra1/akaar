-- Adds Designer-role order assignment: a studio manager can route a "needs rework" order
-- to a specific internal designer instead of doing the rework personally or bouncing it
-- back to the customer. Depends on 011_rename_commissions_to_orders.sql.

alter table public.orders
  add column if not exists assigned_designer_id uuid references public.profiles (id) on delete set null;

-- Extends guard_order_transition() (011) with one more branch: the assigned designer may
-- resubmit their rework, same shape as the customer's own changes_requested ->
-- pending_manager_review branch, just gated on being the assignee instead of the
-- customer. Clears assigned_designer_id on any resubmission (customer's or designer's) —
-- a fresh manager look starts unassigned again; the manager re-assigns on their next
-- decision if the same designer should see any further rounds.
create or replace function public.guard_order_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  acting_manager boolean := public.is_studio_manager_or_above(auth.uid());
  acting_customer boolean := old.customer_id = auth.uid();
  acting_designer boolean := old.assigned_designer_id is not null and old.assigned_designer_id = auth.uid();
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
    new.ratified_at := old.ratified_at;
    -- assigned_designer_id is left as whatever the caller sent — a plain decision leaves
    -- it null/unchanged, "Assign to a Designer" sets it in this same update.

  elsif acting_manager and old.status = 'pending_manager_review' and new.status = 'pending_manager_review' then
    allowed := true;
    new.artisan_id := old.artisan_id;
    new.ratified_at := old.ratified_at;
    new.assigned_designer_id := old.assigned_designer_id;

  elsif (acting_customer or acting_designer) and old.status = 'changes_requested' and new.status = 'pending_manager_review' then
    allowed := true;
    new.artisan_id := old.artisan_id;
    new.ratified_at := old.ratified_at;
    new.assigned_designer_id := null;

  elsif acting_customer and old.status = 'pending_customer_approval' and new.status in ('ratified', 'cancelled') then
    allowed := true;
    new.craft_id := old.craft_id;
    new.artisan_id := old.artisan_id;
    new.assigned_designer_id := old.assigned_designer_id;
    new.ratified_at := case when new.status = 'ratified' then now() else old.ratified_at end;

  elsif acting_customer and old.status = 'pending_manager_review' and new.status = 'cancelled' then
    allowed := true;
    new.craft_id := old.craft_id;
    new.artisan_id := old.artisan_id;
    new.assigned_designer_id := old.assigned_designer_id;
    new.ratified_at := old.ratified_at;
  end if;

  if not allowed then
    raise exception 'That status change is not allowed from %.', old.status;
  end if;

  return new;
end;
$$;

-- orders_select/orders_update (011) already cover the customer and any studio-manager-tier
-- caller — extend both so an assigned designer can also reach their own assigned rows.
-- guard_order_transition above still decides whether their specific transition is legal.
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (
    customer_id = auth.uid()
    or assigned_designer_id = auth.uid()
    or public.is_studio_manager_or_above(auth.uid())
  );

drop policy if exists orders_update on public.orders;
create policy orders_update on public.orders
  for update
  using (
    customer_id = auth.uid()
    or assigned_designer_id = auth.uid()
    or public.is_studio_manager_or_above(auth.uid())
  )
  with check (
    customer_id = auth.uid()
    or assigned_designer_id = auth.uid()
    or public.is_studio_manager_or_above(auth.uid())
  );

-- Notifies the assigned designer too, not just the customer — whoever needs to act next.
create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = old.status and new.assigned_designer_id is not distinct from old.assigned_designer_id then
    return new;
  end if;
  if new.status = 'changes_requested' and new.assigned_designer_id is not null then
    insert into public.notifications (user_id, order_id, message)
    values (new.assigned_designer_id, new.id, 'A studio manager assigned you a design to rework.');
  elsif new.status = 'changes_requested' then
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
