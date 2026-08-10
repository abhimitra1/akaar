-- Adds delete permission for My Library's delete button (LibraryPage.jsx). Without this,
-- both `crafts` and `storage.objects` silently reject delete attempts under RLS — neither
-- had a delete policy at all before now (only select/insert/update existed).
-- Depends on: nothing (crafts + storage.objects already exist from schema.sql).

drop policy if exists crafts_delete on public.crafts;
create policy crafts_delete on public.crafts
  for delete using (owner_id = auth.uid());

drop policy if exists PATHS_delete_own on storage.objects;
create policy PATHS_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'PATHS' and (storage.foldername(name))[1] = auth.uid()::text);
