// instantMesh.js and fooocus.js both call the same GPU-box proxy (instantmesh-proxy, behind
// a Cloudflare Tunnel in prod) for every AI feature (3D reconstruction, Co-Create). If that
// proxy/tunnel is down or unreachable, the browser's `fetch` throws a generic
// `TypeError: Failed to fetch` — indistinguishable, message-wise, from a CORS misconfiguration
// or any other network failure, and useless shown raw to a user (see AGENTS.md progress log).
// Wrapping `fetch` here gives every AI-feature call site one consistent, friendly message for
// that case instead of each one needing its own try/catch.
export async function aiFetch(url, options) {
  try {
    return await fetch(url, options)
  } catch {
    const err = new Error('The AI server is currently offline. Please try again in a few minutes.')
    err.offline = true
    throw err
  }
}
