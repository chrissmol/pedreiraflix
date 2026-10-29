import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import cascadeLayers from '@csstools/postcss-cascade-layers'
import { defineConfig, type Plugin } from 'vite'

const apiProxy = { '/api': 'http://localhost:8787' }

// Lista de todos os arquivos do build para o service worker guardar ja na instalacao (public/sw.js): sem isso,
// uma tela nunca aberta com internet (ex.: Downloads) nao carregava offline — o download em segundo plano do
// APK guardava o filme, mas a tela para assistir podia nao abrir (08/10).
const precacheList = (): Plugin => ({
  name: 'precache-list',
  apply: 'build',
  generateBundle(_, bundle) {
    const files = Object.keys(bundle).filter((f) => /\.(js|css|html|png|svg|webmanifest|woff2?)$/.test(f) && f !== 'sw.js')
    // index.html (a pagina que o service worker usa sem internet) e os arquivos de public/ nao passam pelo bundle.
    const extras = ['/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/fonts/inter-v20-latin.woff2']
    this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify([...extras, ...files.map((f) => `/${f}`)]) })
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), precacheList()],
  // Navegador da TV Samsung (Tizen, Chromium ~76) nao conhece @layer (Chrome 99+) e descartava todos os utilitarios do
  // Tailwind 4: a tela vinha sem estilo (icone gigante, campo minusculo). O plugin desembrulha as camadas; e es2019
  // tira ?. e ?? do JS, que esse Chromium tambem nao le (29/10).
  css: { postcss: { plugins: [cascadeLayers()] } },
  build: { target: 'es2019' },
  server: { proxy: apiProxy },
  // `vite preview` (serving the real production build, used by the PWA/service-worker e2e test) has its
  // own proxy option, separate from `server.proxy` — without this, /api requests 404 under `preview`.
  preview: { proxy: apiProxy },
})
