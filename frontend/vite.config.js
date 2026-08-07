import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The InstantMesh API sends CORS headers on its OPTIONS preflight but not on the
// actual GET/POST responses (a server-side bug, out of this repo's scope — see
// AGENTS.md §5a) — browsers block reading those responses cross-origin. Proxying
// through the Vite dev server sidesteps it: the browser calls same-origin
// `/instantmesh-api/...`, and Vite's Node process makes the real cross-origin
// request server-side, where CORS doesn't apply. Dev-only; a production build has
// no such proxy layer (see AGENTS.md §5a "Caveat").
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/instantmesh-api': {
        target: 'http://10.231.121.101:43839',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/instantmesh-api/, ''),
      },
    },
  },
})
