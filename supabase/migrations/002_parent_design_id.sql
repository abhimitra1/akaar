-- Adds parent-design lineage tracking: when a craft's photo is an AI co-creation started
-- from an existing design (picked via CoCreatePanel's "Choose from Library" search), this
-- records which design it came from — CraftPage.jsx's "Based on: X" line reads this.
-- `on delete set null`, not cascade: deleting the parent design must not take its
-- derivatives down with it.
-- Depends on: nothing (crafts already exists from schema.sql).

alter table public.crafts
  add column if not exists parent_design_id bigint references public.crafts (id) on delete set null;

create index if not exists crafts_parent_design_id_idx on public.crafts (parent_design_id);
