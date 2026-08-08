-- Adds an optional numeric height (cm) separate from the existing free-text `dimensions`
-- field. CraftPage.jsx uses this, when set, to rescale the GLB to match the craft's real
-- physical height — both for the on-page 3D preview and (since it's baked into the scene
-- before AR Quick Look's USDZ export runs) for AR placement, which is otherwise using
-- whatever arbitrary/normalized scale InstantMesh's single-image reconstruction happened
-- to produce, not a real-world size.
-- Depends on: nothing (crafts already exists from schema.sql).

alter table public.crafts
  add column if not exists height_cm double precision;
