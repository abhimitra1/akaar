-- Per-user likes on crafts (one row per (user, craft)). Powers CraftPage.jsx's like
-- button + count (2026-08-10). This table already existed live before this file was
-- written (created ad hoc, not through schema.sql/migrations) — verified via a direct
-- query against the running project (200 OK, empty result) rather than assumed. Written
-- here so a fresh Supabase project gets it too; safe/idempotent to re-run either way.
-- Depends on: nothing (crafts already exists from schema.sql).

create table if not exists public.likes (
  id bigint generated always as identity primary key,
  craft_id bigint not null references public.crafts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (craft_id, user_id)
);

create index if not exists likes_craft_id_idx on public.likes (craft_id);

alter table public.likes enable row level security;

drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes
  for insert with check (auth.uid() = user_id);

drop policy if exists likes_delete on public.likes;
create policy likes_delete on public.likes
  for delete using (auth.uid() = user_id);

drop policy if exists likes_select on public.likes;
create policy likes_select on public.likes
  for select using (
    exists (select 1 from public.crafts c where c.id = craft_id)
  );
