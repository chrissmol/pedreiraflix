import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiProxy = { '/api': 'http://localhost:8787' }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: apiProxy },
  // `vite preview` (serving the real production build, used by the PWA/service-worker e2e test) has its
  // own proxy option, separate from `server.proxy` — without this, /api requests 404 under `preview`.
  preview: { proxy: apiProxy },
})
