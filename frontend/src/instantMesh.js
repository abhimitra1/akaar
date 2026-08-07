// Client for the InstantMesh reconstruction API (separate GPU workstation). Async job
// model: submit -> poll -> download. See the API's own README for the full contract.
//
// The server only sends CORS headers on its OPTIONS preflight, not on actual GET/POST
// responses (server-side bug, out of this repo's scope) — the browser blocks reading
// those directly. In dev, route through the Vite proxy (vite.config.js) instead, which
// makes the real request from Node (no CORS). Production builds have no such proxy —
// see AGENTS.md §5a "Caveat" for what a real fix looks like (fix the server, or add a
// proxy layer, e.g. a Supabase Edge Function).
const BASE_URL = import.meta.env.DEV ? '/instantmesh-api' : import.meta.env.VITE_INSTANTMESH_URL

export async function submitJob(file, { removeBackground = true, seed = 42, sampleSteps = 75 } = {}) {
  const form = new FormData()
  form.append('file', file)
  form.append('remove_background', String(removeBackground))
  form.append('seed', String(seed))
  form.append('sample_steps', String(sampleSteps))

  const res = await fetch(`${BASE_URL}/api/generate`, { method: 'POST', body: form })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || data.error || 'Failed to submit reconstruction job')
  return data.job_id
}

export async function getJobStatus(jobId) {
  const res = await fetch(`${BASE_URL}/api/jobs/${jobId}`)
  if (!res.ok) throw new Error('Failed to check reconstruction status')
  return res.json()
}

export async function downloadResult(jobId, fmt) {
  const res = await fetch(`${BASE_URL}/api/jobs/${jobId}/download/${fmt}`)
  if (!res.ok) throw new Error(`Failed to download ${fmt} result`)
  return res.blob()
}
