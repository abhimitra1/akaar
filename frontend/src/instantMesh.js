// Client for the InstantMesh reconstruction API (separate GPU workstation, reachable
// only over ZeroTier). Async job model: submit -> poll -> download.
//
// Routed through `instantmesh-proxy/` (runs on the GPU box) in both dev and prod — it
// fixes InstantMesh's CORS bug (only sends CORS headers on its OPTIONS preflight, not
// on real responses), requires the caller's Supabase login, and — since InstantMesh and
// Fooocus (fooocus.js) share one GPU — serializes the two so they never run at once. So
// `VITE_GPU_PROXY_URL` always points at that proxy (its own address in dev, the
// Cloudflare Tunnel in front of it in prod), never at InstantMesh's raw port directly.
// See AGENTS.md §5a.
import { supabase } from './supabaseClient.js'

// Resolved lazily (inside requireBaseUrl, not here at module scope) so a missing env var
// throws only when an AI feature is actually used, not on import — Vite bakes VITE_* vars
// in at build time, and Vercel's env config is separate from local .env files (renaming a
// var locally doesn't touch it), so a rename/typo there is a real, recoverable-without-a-
// redeploy-crash possibility, not just a local dev mistake. Crashing at module scope took
// the ENTIRE app down (blank page on every route, not just the AI ones) the one time this
// actually happened — see AGENTS.md progress log.
const RAW_BASE_URL = import.meta.env.VITE_GPU_PROXY_URL
const BASE_URL = RAW_BASE_URL ? RAW_BASE_URL.replace(/\/+$/, '') : null

function requireBaseUrl() {
  if (!BASE_URL) {
    throw new Error('3D reconstruction is not configured on this deployment (VITE_GPU_PROXY_URL is missing).')
  }
  return BASE_URL
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function submitJob(file, { removeBackground = true, seed = 42, sampleSteps = 75 } = {}) {
  const baseUrl = requireBaseUrl()
  const form = new FormData()
  form.append('file', file)
  form.append('remove_background', String(removeBackground))
  form.append('seed', String(seed))
  form.append('sample_steps', String(sampleSteps))

  const res = await fetch(`${baseUrl}/api/generate`, { method: 'POST', headers: await authHeaders(), body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.detail || data.error || 'Failed to submit reconstruction job')
    // 422 is instantmesh-proxy's specific status for a content-moderation rejection (see
    // AGENTS.md §5d) — reconstruction.js uses this to tell "flagged, don't offer retry with
    // the same photo, clean it up" apart from ordinary failures (network/GPU/backend errors).
    err.status = res.status
    throw err
  }
  return data.job_id
}

export async function getJobStatus(jobId) {
  const baseUrl = requireBaseUrl()
  const res = await fetch(`${baseUrl}/api/jobs/${jobId}`, { headers: await authHeaders() })
  if (!res.ok) throw new Error('Failed to check reconstruction status')
  return res.json()
}

export async function downloadResult(jobId, fmt) {
  const baseUrl = requireBaseUrl()
  const res = await fetch(`${baseUrl}/api/jobs/${jobId}/download/${fmt}`, { headers: await authHeaders() })
  if (!res.ok) throw new Error(`Failed to download ${fmt} result`)
  return res.blob()
}
