-- Backfills crafts.image_source for rows created before that column existed (006 added it
-- with `default 'original'`, which every pre-existing row silently got regardless of how
-- it was actually made — including real AI co-creations, so the AI badge on craft cards
-- never showed for any of them).
--
-- Only a subset is recoverable with certainty: a non-null parent_design_id only ever gets
-- set by CreatePage.jsx's co-creation path (picking an existing design as the AI
-- generation's starting point — see CoCreatePanel), never by a plain photo upload. So
-- "has a parent" is a reliable, if partial, signal for "this was AI-generated".
--
-- What this can't recover: crafts co-created from scratch (no library pick as a starting
-- point) before this column existed — nothing in the data distinguishes those from a plain
-- upload. Those need a manual fix: /admin -> Crafts -> Edit -> Image source, for whichever
-- specific rows you know were AI-made (e.g. by title/memory) that this UPDATE doesn't
-- already catch.
-- Depends on: 006_super_admin.sql (image_source column).

update public.crafts
set image_source = 'ai_generated'
where parent_design_id is not null
  and image_source = 'original';
