-- PATHS manager review + marketplace commission migration. Depends on 006_super_admin.sql
-- (is_super_admin(), profiles_admin_all-style pattern) and the base schema's
-- set_updated_at() — run those first on a project that hasn't already applied them.
--
-- Adds: a `manager` capability flag on profiles; a `commissions` table (a customer's
-- request to have an already-reconstructed design physically made) with a manager-gated
-- feasibility review step; an append-only `commission_reviews` audit trail of each review
-- round; and a minimal `notifications` table so a customer learns when a manager has
-- acted on their request. See AGENTS.md and frontend/public/whitepaper.html for the wider
-- six-stage journey this slots into (stage 2->3, the "craft-feasibility filter… between
-- generation and twinning") — nothing here touches crafts.is_public (portfolio
-- publishing); a commission is a separate concern layered on top of an already-stored
-- craft, not a replacement for the existing Publish toggle.

-- ── manager capability flag ──────────────────────────────────────────────
-- Mirrors is_super_admin's shape exactly, but narrower in what it grants: a manager can
-- only act on commissions (see RLS below), not edit arbitrary rows the way a super admin
-- can via /admin.
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

-- guard_profile_privileges() (base schema) already blocks self-escalation of role /
-- is_super_admin / unlimited_creations on a plain authenticated update — redefined here
-- (same function name, so `create or replace` swaps its body in place) to add is_manager
-- to that same protected list, rather than adding a second competing trigger.
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

-- ── commissions ──────────────────────────────────────────────────────────
-- One row per "make this stored design into a physical piece" request. Make-to-order,
-- matching the whitepaper's model (Table 3: "no party carries inventory risk") — a
-- commission always points at one specific already-reconstructed craft (crafts.model_key
-- must already be set), never a bare idea. customer_id is its own column rather than read
-- off crafts.owner_id (even though it's pinned equal to it below, for now) so that a later
-- change letting a customer commission someone else's public design doesn't need a
-- schema change, only a relaxed guard.
create table if not exists public.commissions (
  id bigint generated always as identity primary key,
  craft_id bigint not null references public.crafts (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  -- Maker assignment (accept/decline, craft_type matching) is a later phase — reserved
  -- now so the status machine below already has somewhere for it to attach.
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
  -- Price-split transparency + payment are explicit whitepaper commitments ("paid before
  -- making", "transparent price split") that this migration deliberately does not wire up
  -- a real charge for — no payment processor is integrated anywhere in this app, and
  -- picking one is a compliance-sensitive decision on its own (KYC for artisan payouts,
  -- refunds). Columns reserved so the schema doesn't need reshaping once that decision is
  -- made; payment_status is not read or enforced by any trigger/RLS below yet.
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

-- Insert guard: only a craft's own owner may open a commission on it, and only once that
-- craft actually has a 3D twin (model_key set) — a manager needs the reconstructed model,
-- not just a 2D concept image, to judge wall thickness/overhang/kiln envelope. Also pins
-- customer_id/status/artisan_id/ratified_at server-side so a client can't insert itself a
-- pre-approved or pre-assigned row. security definer so the craft-ownership lookup isn't
-- itself gated by crafts' own RLS — matches guard_craft_image_source()'s existing pattern
-- of never relying on RLS having already worked out for a check like this.
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

-- Update guard: the actual state machine. RLS below only decides which rows a caller can
-- see/touch at all — which *transitions* are legal is enforced here, the same split as
-- guard_profile_privileges (RLS = row access, trigger = column/transition legality).
--   * A manager (or super admin) may decide on anything currently awaiting them —
--     pending_manager_review -> changes_requested / pending_customer_approval / rejected
--     — and may additionally re-point craft_id at a freshly reworked design while doing
--     so (the "Rework it here" action, see ManagerReviewPage.jsx).
--   * The customer may act only on their own two "my move" states: react to
--     changes_requested by resubmitting a reworked craft_id (status back to
--     pending_manager_review), or resolve pending_customer_approval into ratified
--     (stamping ratified_at — the whitepaper's stage-3 commit seam) or cancelled. They
--     may also withdraw a still-queued request outright (pending_manager_review ->
--     cancelled).
-- Anything not explicitly allowed raises rather than silently no-opping, so a UI bug
-- fails loudly instead of corrupting the audit trail.
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
    return new; -- unchecked, same escape hatch as every other admin-scoped table
  end if;

  -- Columns nothing below may touch, regardless of which transition fires — reset up
  -- front so each branch only has to reason about status/craft_id.
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
    -- craft_id is left as whatever the caller sent — a plain decision leaves it
    -- untouched, "Rework it here" (see the next branch) re-points it first.

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
    -- craft_id likewise left as sent — this is the customer's own reworked design.

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

-- ── commission_reviews (append-only audit trail) ────────────────────────────
-- One row per manager decision round — a design may bounce back and forth more than
-- once, so this is insert-only history, never updated/deleted by the app itself.
create table if not exists public.commission_reviews (
  id bigint generated always as identity primary key,
  commission_id bigint not null references public.commissions (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  decision text not null check (decision in ('changes_requested', 'approved', 'rejected')),
  remarks text,
  -- { [criterion_key]: { status: 'ok'|'not_feasible'|'n/a', note: text } } — see
  -- frontend/src/data/feasibilityChecklist.js for the criterion list this keys against.
  -- Not itself constrained to that list by a check constraint: the list is expected to
  -- evolve, and a stale/renamed key here is just an inert extra property, not a data
  -- integrity problem.
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

-- Only a manager may write a review round, and only while that commission is actually
-- awaiting one — mirrors guard_commission_transition()'s own pending_manager_review gate
-- on the parent row, so a review row can never be inserted for a commission the
-- accompanying status update wouldn't also be allowed to make.
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

-- ── notifications (minimal, in-app only) ─────────────────────────────────
-- No email/push exists anywhere in this app — this is deliberately the smallest thing
-- that lets a customer learn a manager acted on their request without polling
-- /commissions themselves. Written only by notify_commission_status_change() below
-- (security definer, bypasses RLS); there is no insert policy for a plain client.
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

-- Tells the customer when a manager has acted on their commission — the only direction
-- notified today. The manager queue (ManagerPage.jsx) is itself always freshly queried
-- against live status, so managers don't need a separate personal notification row for a
-- shared queue nobody has individually claimed.
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
