// Public-facing proxy for the GPU workstation's model APIs — InstantMesh (3D reconstruction)
// and Fooocus-API (co-creation image redesign). Both models live on the same GPU, so this
// proxy is also where the two are kept from ever running at once (see the queue below), and
// where every submission is content-moderated before it ever reaches either model.
//
// Runs on the GPU workstation, next to both services (targets: INSTANTMESH_TARGET /
// FOOOCUS_TARGET, defaulting to their well-known localhost ports). Sits behind a Cloudflare
// Tunnel (or ngrok) so it's the only thing exposed to the internet — neither model server
// itself is ever exposed directly.
//
// Responsibilities:
//   1. CORS — InstantMesh only sends CORS headers on its OPTIONS preflight, not on real
//      responses (server bug); Fooocus-API sends correct headers itself but is routed
//      through here too so it gets auth + the shared GPU queue + moderation. This proxy sets
//      CORS headers on every response for both, so neither depends on the backend getting it
//      right.
//   2. Auth — requires a valid Supabase access token (the same one issued when a user
//      signs into the app) so anonymous internet traffic can't submit jobs to either model.
//      Supabase signs tokens with an asymmetric key (ES256), not a shared secret, so
//      verification uses Supabase's public JWKS endpoint (keyed by the token's `kid`)
//      rather than a secret this proxy would have to hold and protect.
//   3. Rate limiting — caps combined job submissions (both models draw from the same
//      per-user hourly budget, since each one consumes real GPU time either way).
//   4. Content moderation — every submission is checked BEFORE it's queued or forwarded, by
//      a local model service (../moderation-service, CLIP + Detoxify — no external API, no
//      per-request cost) covering both concerns at once: is the image actually a craft/art
//      object at all, and is the image/text explicit, violent, or otherwise inappropriate.
//      Enforcement lives here (not the frontend) because it must not be something a user can
//      bypass by editing client-side JS — see AGENTS.md's AI Usage Policy section for what's
//      disallowed and why this check exists at all.
//   5. GPU queue — InstantMesh and Fooocus-API are separate processes with no idea the
//      other exists, but they share one GPU. Running both at once risks a CUDA OOM. This
//      proxy holds a single lock across both services: a new submission (to either model)
//      waits here until whichever job is currently running finishes, then proceeds. Only
//      content that passed moderation ever gets this far — no point queueing for GPU time
//      on a request that's about to be rejected anyway.
require('dotenv').config()
const express = require('express')
const jwt = require('jsonwebtoken')
const jwksClient = require('jwks-rsa')
const multer = require('multer')
const { createProxyMiddleware } = require('http-proxy-middleware')

const PORT = process.env.PORT || 8787
const INSTANTMESH_TARGET = process.env.INSTANTMESH_TARGET || 'http://127.0.0.1:43839'
const FOOOCUS_TARGET = process.env.FOOOCUS_TARGET || 'http://127.0.0.1:8888'
const MODERATION_SERVICE_URL = process.env.MODERATION_SERVICE_URL || 'http://127.0.0.1:8790'
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean)
const SUPABASE_URL = process.env.SUPABASE_URL
const RATE_LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR) || 20
// Safety valve: if a job never reaches a terminal status (crashed backend, client vanished
// mid-job, etc.) the queue would otherwise wait forever and wedge every future submission.
const GPU_JOB_MAX_WAIT_MS = Number(process.env.GPU_JOB_MAX_WAIT_MS) || 10 * 60 * 1000
const GPU_JOB_POLL_INTERVAL_MS = 3000
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

if (!SUPABASE_URL) {
  console.error('SUPABASE_URL is required (same value as the frontend\'s VITE_SUPABASE_URL).')
  process.exit(1)
}
if (ALLOWED_ORIGINS.length === 0) {
  console.error('ALLOWED_ORIGINS is required (comma-separated list of frontend origins).')
  process.exit(1)
}

const jwks = jwksClient({ jwksUri: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cache: true })
function getSigningKey(header, callback) {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err)
    callback(null, key.getPublicKey())
  })
}

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } })

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.use((req, res, next) => {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Missing Authorization bearer token' })

  jwt.verify(token, getSigningKey, { algorithms: ['ES256', 'RS256'] }, (err, decoded) => {
    if (err) {
      console.error('JWT verify failed:', err.name, '-', err.message)
      return res.status(401).json({ error: 'Invalid or expired session' })
    }
    req.userId = decoded.sub
    next()
  })
})

// ── Per-user submission cap ─────────────────────────────────────────────────
// Shared across both models (InstantMesh's /api/generate and Fooocus's image-prompt
// submit both count against the same hourly budget) — resets on an hourly sliding
// window, in-memory only (fine for a single-process proxy; resets on restart).
const submissionLog = new Map() // userId -> timestamps[]

function rateLimitSubmission(req, res, next) {
  const now = Date.now()
  const windowStart = now - 60 * 60 * 1000
  const timestamps = (submissionLog.get(req.userId) || []).filter((t) => t > windowStart)

  if (timestamps.length >= RATE_LIMIT_PER_HOUR) {
    return res.status(429).json({ error: `Rate limit exceeded: max ${RATE_LIMIT_PER_HOUR} jobs/hour` })
  }

  timestamps.push(now)
  submissionLog.set(req.userId, timestamps)
  next()
}

// ── Content moderation ───────────────────────────────────────────────────────
// Screens a submission's text and/or source image against ../moderation-service — a local
// FastAPI service on this same box (CLIP zero-shot classification covers both "is this
// actually a craft/art object" and "is it explicit/violent", in one pass; Detoxify covers
// the prompt text). No external API, no per-request cost, no API key to manage — see
// moderation-service/main.py for why and how. Fails CLOSED: if the call itself errors
// (service down, network issue), the submission is rejected rather than let through
// unchecked — a broken safety check must not silently become no safety check.
async function screenSubmission({ text, imageDataUrl }) {
  if (!text?.trim() && !imageDataUrl) return { rejected: false }

  const res = await fetch(`${MODERATION_SERVICE_URL}/moderate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, image_data_url: imageDataUrl }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Moderation service returned ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  if (data.rejected) {
    console.warn('[moderation] rejected:', data.reason)
    return { rejected: true, message: rejectionMessage() }
  }
  return { rejected: false }
}

// On rejection: a generic policy-violation message only (server-side logs above carry the
// actual reason/categories) so misfires/patterns are diagnosable without exposing the
// classifiers' internals to whoever's probing them. Deliberately doesn't embed a raw "/policy"
// path — the frontend renders an actual clickable link instead, keyed off this response's
// 422 status (see instantMesh.js/fooocus.js's `err.status`), so this stays plain, portable text.
function rejectionMessage() {
  return 'This submission doesn\'t meet AKAAR\'s content guidelines. Our AI tools are reserved ' +
    'for genuine craft and art reconstruction or redesign — sexual, violent, or otherwise ' +
    'inappropriate content isn\'t supported.'
}

// ── GPU queue ────────────────────────────────────────────────────────────────
// One lock shared by both models. acquireGpuLock() resolves once it's this caller's
// turn; the caller MUST eventually call the release function it's given (always in a
// finally), whether the submit itself failed, timed out, or the job it started
// finished normally.
let gpuBusy = false
const waitQueue = []

function release() {
  const next = waitQueue.shift()
  if (next) next() // lock stays held, handed straight to the next waiter
  else gpuBusy = false
}

function acquireGpuLock() {
  return new Promise((resolve) => {
    const grant = () => resolve(release)
    if (!gpuBusy) {
      gpuBusy = true
      grant()
    } else {
      waitQueue.push(grant)
    }
  })
}

// Polls the real backend directly (not through this proxy) until the job reaches a
// terminal status, then releases the lock — decoupled from whether the client that
// submitted the job is still around polling it themselves.
async function watchJobThenRelease({ statusUrl, isTerminal, release, label }) {
  const deadline = Date.now() + GPU_JOB_MAX_WAIT_MS
  try {
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, GPU_JOB_POLL_INTERVAL_MS))
      try {
        const res = await fetch(statusUrl)
        if (res.ok) {
          const body = await res.json()
          if (isTerminal(body)) return
        }
      } catch (err) {
        console.error(`[gpu-queue] ${label} status check failed:`, err.message)
      }
    }
    console.error(`[gpu-queue] ${label} did not reach a terminal status within ${GPU_JOB_MAX_WAIT_MS}ms — releasing anyway`)
  } finally {
    release()
  }
}

function extractJobId(bodyText, statusCode) {
  if (statusCode >= 400) return null
  try {
    return JSON.parse(bodyText).job_id || null
  } catch {
    return null
  }
}

// ── InstantMesh ──────────────────────────────────────────────────────────────
// POST /api/generate: parsed (not streamed — moderation needs the actual image bytes
// before deciding whether to forward anything), moderated, queued, then manually
// re-posted to InstantMesh as a fresh multipart request (the original request stream is
// already consumed by multer by this point, so http-proxy-middleware can't be reused for
// this specific route the way it is for everything else below).
app.post('/api/generate', rateLimitSubmission, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing file' })

  try {
    const imageDataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    const screen = await screenSubmission({ imageDataUrl })
    if (screen.rejected) return res.status(422).json({ error: screen.message })
  } catch (err) {
    console.error('[moderation] check failed:', err.message)
    return res.status(503).json({ error: 'Content moderation is temporarily unavailable — try again shortly.' })
  }

  const releaseLock = await acquireGpuLock()
  try {
    const form = new FormData()
    form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'photo')
    for (const [key, value] of Object.entries(req.body || {})) form.append(key, value)

    const upstreamRes = await fetch(`${INSTANTMESH_TARGET}/api/generate`, { method: 'POST', body: form })
    const bodyText = await upstreamRes.text()
    const jobId = extractJobId(bodyText, upstreamRes.status)

    if (jobId) {
      watchJobThenRelease({
        statusUrl: `${INSTANTMESH_TARGET}/api/jobs/${jobId}`,
        isTerminal: (body) => body.status === 'done' || body.status === 'error',
        release: releaseLock,
        label: `InstantMesh job ${jobId}`,
      })
    } else {
      releaseLock()
    }

    res.status(upstreamRes.status).set('Content-Type', upstreamRes.headers.get('content-type') || 'application/json').send(bodyText)
  } catch (err) {
    releaseLock()
    console.error('Failed to forward to InstantMesh:', err.message)
    res.status(502).json({ error: 'Failed to reach InstantMesh' })
  }
})

// http-proxy-middleware restores req.url from req.originalUrl internally before
// proxying, so the full '/api/...' path already reaches InstantMesh as-is — no
// pathRewrite needed despite this being mounted under app.use('/api', ...). Everything
// other than the submit route above (job status polling, GLB download) passes straight
// through, unbuffered — no moderation needed for reading back results of an
// already-approved submission.
app.use('/api', createProxyMiddleware({
  target: INSTANTMESH_TARGET,
  changeOrigin: true,
  onProxyReq: (proxyReq) => console.log('Forwarding to InstantMesh:', proxyReq.path),
}))

// ── Fooocus-API ──────────────────────────────────────────────────────────────
// Same treatment as InstantMesh's /api/generate above: parsed (JSON here, not
// multipart), moderated — both the prompt text AND the source image (`cn_img`) — queued,
// then manually re-posted to Fooocus-API as fresh JSON.
app.post(
  '/fooocus/v2/generation/image-prompt',
  rateLimitSubmission,
  express.json({ limit: '25mb' }),
  async (req, res) => {
    const prompt = req.body?.prompt || ''
    const cnImg = req.body?.image_prompts?.[0]?.cn_img
    const imageDataUrl = cnImg ? `data:image/png;base64,${cnImg}` : null

    try {
      const screen = await screenSubmission({ text: prompt, imageDataUrl })
      if (screen.rejected) return res.status(422).json({ error: screen.message })
    } catch (err) {
      console.error('[moderation] check failed:', err.message)
      return res.status(503).json({ error: 'Content moderation is temporarily unavailable — try again shortly.' })
    }

    const releaseLock = await acquireGpuLock()
    try {
      const upstreamRes = await fetch(`${FOOOCUS_TARGET}/v2/generation/image-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      })
      const bodyText = await upstreamRes.text()
      const jobId = extractJobId(bodyText, upstreamRes.status)

      if (jobId) {
        watchJobThenRelease({
          statusUrl: `${FOOOCUS_TARGET}/v1/generation/query-job?job_id=${jobId}`,
          isTerminal: (body) => body.job_stage === 'SUCCESS' || body.job_stage === 'ERROR',
          release: releaseLock,
          label: `Fooocus job ${jobId}`,
        })
      } else {
        releaseLock()
      }

      res.status(upstreamRes.status).set('Content-Type', upstreamRes.headers.get('content-type') || 'application/json').send(bodyText)
    } catch (err) {
      releaseLock()
      console.error('Failed to forward to Fooocus-API:', err.message)
      res.status(502).json({ error: 'Failed to reach Fooocus-API' })
    }
  }
)

// GET /fooocus/v1/generation/query-job: the submit route above only screens the INPUT
// (prompt text + source photo) before a job is queued — but Fooocus's "ImagePrompt" mode
// only loosely follows the source image for style/subject guidance, so an off-topic prompt
// can still make it generate something with no craft/art content at all (e.g. a portrait)
// even though the input passed. Registered ahead of the generic '/fooocus' passthrough
// below so polling is intercepted here instead of streaming straight through: once a job
// reaches SUCCESS, each generated image gets the same CLIP craft/art check the input
// already gets, before the client ever sees it. Non-terminal stages (WAITING/RUNNING/ERROR)
// pass through untouched — nothing to check yet.
app.get('/fooocus/v1/generation/query-job', async (req, res) => {
  try {
    const upstreamRes = await fetch(
      `${FOOOCUS_TARGET}/v1/generation/query-job?job_id=${encodeURIComponent(req.query.job_id || '')}`
    )
    const data = await upstreamRes.json().catch(() => null)
    if (!upstreamRes.ok || !data) {
      return res.status(upstreamRes.status).json(data || { error: 'Failed to check co-creation status' })
    }

    if (data.job_stage === 'SUCCESS' && Array.isArray(data.job_result)) {
      const checked = await Promise.all(
        data.job_result.map(async (r) => {
          if (!r?.base64) return { result: r, ok: true }
          try {
            const screen = await screenSubmission({ imageDataUrl: r.base64 })
            return { result: r, ok: !screen.rejected }
          } catch (err) {
            console.error('[moderation] output check failed:', err.message)
            return { result: r, ok: false } // fail closed, same as the input-side check
          }
        })
      )
      const passed = checked.filter((c) => c.ok).map((c) => c.result)
      // Only reject the whole job if every variation failed — a prompt that made one
      // variation drift off-topic doesn't necessarily mean the other did too, and there's
      // no reason to throw away a variation that did pass.
      if (passed.length === 0) {
        console.warn('[moderation] rejected: all Fooocus job results failed output-side craft/art check')
        return res.status(422).json({ error: rejectionMessage() })
      }
      data.job_result = passed
    }

    res.status(200).json(data)
  } catch (err) {
    console.error('Failed to check Fooocus job status:', err.message)
    res.status(502).json({ error: 'Failed to reach Fooocus-API' })
  }
})

// Everything else under /fooocus (the submit route is handled above; this covers any other
// Fooocus-API route the client might hit) passes straight through, unmoderated — job status
// polling for non-terminal stages carries no result images yet, and nothing else here
// returns generated content directly to the client the way query-job's SUCCESS stage does.
app.use('/fooocus', createProxyMiddleware({
  target: FOOOCUS_TARGET,
  changeOrigin: true,
  pathRewrite: (path) => path.replace(/^\/fooocus/, ''),
  onProxyReq: (proxyReq) => console.log('Forwarding to Fooocus-API:', proxyReq.path),
}))

app.listen(PORT, () => {
  console.log(`GPU proxy listening on :${PORT}`)
  console.log(`  InstantMesh -> ${INSTANTMESH_TARGET}`)
  console.log(`  Fooocus-API -> ${FOOOCUS_TARGET}`)
  console.log(`  Content moderation: ${MODERATION_SERVICE_URL} (local, no external API)`)
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`)
})
