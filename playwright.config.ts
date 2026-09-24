import { defineConfig, devices } from '@playwright/test'

// Drives the real app (Vite + local proxy) against the mock Xtream panel in e2e/mock-xtream.mjs.
export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    // Autoplay with sound is otherwise blocked in headless Chromium.
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: [/\.mobile\.spec\.ts/, /\.pwa\.spec\.ts/] },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /\.mobile\.spec\.ts/ },
    // The service worker only ever registers on a real production build (see src/main.tsx), so it can
    // only be exercised against `vite preview` serving dist/, not the dev server the other projects use.
    { name: 'pwa', use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173' }, testMatch: /\.pwa\.spec\.ts/ },
  ],
  webServer: [
    { command: 'node e2e/mock-xtream.mjs', port: 8790, reuseExistingServer: true, timeout: 120_000 },
    { command: 'node server/index.js', port: 8787, reuseExistingServer: true, env: { ALLOW_PRIVATE_HOSTS: '1' } },
    { command: 'npx vite --port 5173 --strictPort', port: 5173, reuseExistingServer: true },
    // Rebuilds first so the PWA test exercises what would actually ship, not a stale dist/. Kill any
    // process already on :4173 (`npx kill-port` isn't installed) before re-running after a code change.
    { command: 'npm run build && npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 60_000 },
  ],
})
