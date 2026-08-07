// Public-facing proxy for the InstantMesh reconstruction API.
//
// Runs on the GPU workstation, next to InstantMesh (target: INSTANTMESH_TARGET,
// default localhost:43839). Sits behind a Cloudflare Tunnel (or ngrok) so it's the
// only thing exposed to the internet — InstantMesh itself stays bound to localhost.
//
// Responsibilities:
//   1. CORS — InstantMesh only sends CORS headers on its OPTIONS preflight, not on
//      real responses (server bug). This proxy sets them on every response instead.
//   2. Auth — requires a valid Supabase access token (the same one issued when a
//      user signs into the app) so anonymous internet traffic can't submit jobs.
//      Supabase signs tokens with an asymmetric key (ES256), not a shared secret, so
//      verification uses Supabase's public JWKS endpoint (keyed by the token's `kid`)
//      rather than a secret this proxy would have to hold and protect.
//   3. Rate limiting — caps job submissions per signed-in user, since each one
//      consumes real GPU time.
require('dotenv').config()
const express = require('express')
const jwt = require('jsonwebtoken')
const jwksClient = require('jwks-rsa')
const { createProxyMiddleware } = require('http-proxy-middleware')

const PORT = process.env.PORT || 8787
const TARGET = process.env.INSTANTMESH_TARGET || 'http://127.0.0.1:43839'
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean)
const SUPABASE_URL = process.env.SUPABASE_URL
const RATE_LIMIT_PER_HOUR = Number(process.env.RATE_LIMIT_PER_HOUR) || 20

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

// Per-user submission cap — resets on an hourly sliding window, in-memory only
// (fine for a single-process proxy; resets on restart).
const submissionLog = new Map() // userId -> timestamps[]

app.use('/api/generate', (req, res, next) => {
  if (req.method !== 'POST') return next()

  const now = Date.now()
  const windowStart = now - 60 * 60 * 1000
  const timestamps = (submissionLog.get(req.userId) || []).filter((t) => t > windowStart)

  if (timestamps.length >= RATE_LIMIT_PER_HOUR) {
    return res.status(429).json({ error: `Rate limit exceeded: max ${RATE_LIMIT_PER_HOUR} jobs/hour` })
  }

  timestamps.push(now)
  submissionLog.set(req.userId, timestamps)
  next()
})

// http-proxy-middleware restores req.url from req.originalUrl internally before
// proxying, so the full '/api/...' path already reaches InstantMesh as-is — no
// pathRewrite needed despite this being mounted under app.use('/api', ...).
app.use('/api', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  onProxyReq: (proxyReq) => console.log('Forwarding to:', proxyReq.path),
}))

app.listen(PORT, () => {
  console.log(`InstantMesh proxy listening on :${PORT} -> ${TARGET}`)
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`)
})
