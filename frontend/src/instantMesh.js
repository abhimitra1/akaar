// Client for the InstantMesh reconstruction API (separate GPU workstation, reachable
// only over ZeroTier). Async job model: submit -> poll -> download.
//
// The InstantMesh server itself only sends CORS headers on its OPTIONS preflight, not
// on actual GET/POST responses (server-side bug, out of this repo's scope), and it has
// no auth of its own. In dev, route through the Vite proxy (vite.config.js), which
// makes the real request from Node (no CORS, no auth needed on a trusted dev box). In
// production, route through `instantmesh-proxy/` (runs on the GPU box, public via a
// Cloudflare Tunnel) instead — it fixes CORS and requires the caller's Supabase login,
// so `VITE_INSTANTMESH_URL` in production points at the tunnel URL, not InstantMesh's
// raw port. See AGENTS.md §5a.
import { supabase } from './supabaseClient.js'

const BASE_URL = import.meta.env.DEV ? '/instantmesh-api' : import.meta.env.VITE_INSTANTMESH_URL

async function authHeaders() {
  if (import.meta.env.DEV) return {}
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function submitJob(file, { removeBackground = true, seed = 42, sampleSteps = 75 } = {}) {
  const form = new FormData()
  form.append('file', file)
  form.append('remove_background', String(removeBackground))
  form.append('seed', String(seed))
  form.append('sample_steps', String(sampleSteps))

  const res = await fetch(`${BASE_URL}/api/generate`, { method: 'POST', headers: await authHeaders(), body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.error || 'Failed to submit reconstruction job')
  return data.job_id
}

export async function getJobStatus(jobId) {
  const res = await fetch(`${BASE_URL}/api/jobs/${jobId}`, { headers: await authHeaders() })
  if (!res.ok) throw new Error('Failed to check reconstruction status')
  return res.json()
}

export async function downloadResult(jobId, fmt) {
  const res = await fetch(`${BASE_URL}/api/jobs/${jobId}/download/${fmt}`, { headers: await authHeaders() })
  if (!res.ok) throw new Error(`Failed to download ${fmt} result`)
  return res.blob()
}
