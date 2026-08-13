import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// True whenever these are missing at build time — e.g. set in the local .env (gitignored,
// never deploys) but never synced to Vercel's own separately-configured environment
// variables. See commit 08d7121 for the exact same failure shape with VITE_GPU_PROXY_URL:
// createClient(undefined, undefined) throws synchronously at module scope, and since this
// module is imported transitively from main.jsx before React ever renders, that crashes
// every route as a blank page with no visible cause — not just auth. App.jsx checks this
// flag and renders a clear message instead, rather than letting the app crash blank.
export const supabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(
  supabaseConfigured ? url : 'https://placeholder.invalid',
  supabaseConfigured ? anonKey : 'placeholder-anon-key',
)

// Renamed to 'PATHS' in a docs/branding pass, but the real Supabase Storage bucket was
// never actually migrated to match (Supabase buckets can't be renamed in place — it'd need
// a new bucket + copying every object + rewriting every stored crafts.photos URL). Reverted
// to the bucket that actually holds every existing file — verified live via a direct
// storage request: 'PATHS' -> 400 "Bucket not found", 'akaar' -> 200 with real glTF bytes.
export const STORAGE_BUCKET = 'akaar'
