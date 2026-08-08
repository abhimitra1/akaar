// Client for the Fooocus-API image generation API (co-creation feature: AI-redesign an
// existing item photo before committing to full 3D reconstruction). Separate GPU service
// alongside InstantMesh, same async job model: submit -> poll -> result.
//
// Routed through `instantmesh-proxy/` (runs on the GPU box, same proxy instantMesh.js
// uses) in both dev and prod. Fooocus-API sends correct CORS headers itself (unlike
// InstantMesh) and needs no auth of its own, but it's routed through the shared proxy
// anyway for two reasons: (1) production exposure needs the same Supabase-login gate
// InstantMesh already gets, and (2) InstantMesh and Fooocus share one GPU, so the proxy
// serializes submissions to either so they never run at once. So `VITE_GPU_PROXY_URL`
// always points at that proxy, never at Fooocus-API's raw port directly. See AGENTS.md §5b.
import { supabase } from './supabaseClient.js'

// Resolved lazily (inside requireBaseUrl, not here at module scope) so a missing env var
// throws only when co-creation is actually used, not on import — see instantMesh.js's
// identical comment for why: a module-scope crash here previously took the entire app down
// (blank page on every route) when this var went missing from a deployment's env config.
const RAW_BASE_URL = import.meta.env.VITE_GPU_PROXY_URL
const BASE_URL = RAW_BASE_URL ? RAW_BASE_URL.replace(/\/+$/, '') : null

function requireBaseUrl() {
  if (!BASE_URL) {
    throw new Error('Co-creation is not configured on this deployment (VITE_GPU_PROXY_URL is missing).')
  }
  return BASE_URL
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1]) // strip "data:...;base64," prefix
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}

// Submits an existing item photo + a redesign prompt to Fooocus's "Image Prompt" mode
// (loose style/subject guidance from the input image, not a strict edge/mask constraint).
// require_base64 avoids depending on Fooocus-API's own file server staying reachable from
// wherever the browser is — we just get image bytes back directly.
export async function submitImagePrompt(imageFile, prompt, { cnStop = 0.6, cnWeight = 0.6, imageNumber = 2 } = {}) {
  const baseUrl = requireBaseUrl()
  const cn_img = await fileToBase64(imageFile)
  const res = await fetch(`${baseUrl}/fooocus/v2/generation/image-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({
      prompt,
      async_process: true,
      require_base64: true,
      image_number: imageNumber,
      image_prompts: [{ cn_img, cn_stop: cnStop, cn_weight: cnWeight, cn_type: 'ImagePrompt' }],
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.detail || data.error || 'Failed to submit co-creation job')
    // 422 is instantmesh-proxy's specific status for a content-moderation rejection (see
    // AGENTS.md §5d) — CoCreatePanel uses this to show a link to the AI Usage Policy.
    err.status = res.status
    throw err
  }
  return data.job_id
}

// { job_stage: 'WAITING' | 'RUNNING' | 'SUCCESS' | 'ERROR', job_progress: 0-100,
//   job_result: [{ base64, seed, finish_reason }] | null } — one entry per `image_number`
//   requested at submit (CoCreatePanel asks for 2, so the user gets a choice of variations).
//
// Despite the field name, Fooocus-API's `base64` already comes back as a full data URI
// (`data:image/png;base64,...`), not raw base64 — confirmed by inspecting a live response;
// the API docs are misleading here. Stripped to raw base64 so every caller can rely on one
// consistent shape (matches what fileToBase64 above produces for the *input* side too).
export async function getJobStatus(jobId) {
  const baseUrl = requireBaseUrl()
  const res = await fetch(`${baseUrl}/fooocus/v1/generation/query-job?job_id=${jobId}`, {
    headers: await authHeaders(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || data.detail || 'Failed to check co-creation status')
    // 422 = instantmesh-proxy rejected every generated result on output-side content
    // moderation (see AGENTS.md §5d) — same status the submit-time rejection uses, so
    // CoCreatePanel's existing policy-link handling (err.status === 422) covers this path too.
    err.status = res.status
    throw err
  }
  if (data.job_result) {
    data.job_result = data.job_result.map((r) =>
      r.base64 ? { ...r, base64: r.base64.replace(/^data:image\/\w+;base64,/, '') } : r
    )
  }
  return data
}

// Converts a job's base64 PNG result into a File, so it can drop straight into the same
// photo-upload path CreatePage already uses for a normally-picked photo.
export function base64ToFile(base64, filename = 'co-created.png') {
  const bytes = atob(base64)
  const buffer = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i)
  return new File([buffer], filename, { type: 'image/png' })
}
