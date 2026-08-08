import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// InstantMesh and Fooocus-API (instantMesh.js, fooocus.js) are both reached through
// instantmesh-proxy/ (GPU workstation, VITE_GPU_PROXY_URL) directly, in dev and prod
// alike — that proxy sets its own CORS headers (fixing InstantMesh's missing ones, see
// AGENTS.md §5a/§5b), so no Vite dev-proxy workaround is needed here.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
})
