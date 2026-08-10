import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// Renamed to 'PATHS' in a docs/branding pass, but the real Supabase Storage bucket was
// never actually migrated to match (Supabase buckets can't be renamed in place — it'd need
// a new bucket + copying every object + rewriting every stored crafts.photos URL). Reverted
// to the bucket that actually holds every existing file — verified live via a direct
// storage request: 'PATHS' -> 400 "Bucket not found", 'akaar' -> 200 with real glTF bytes.
export const STORAGE_BUCKET = 'akaar'
