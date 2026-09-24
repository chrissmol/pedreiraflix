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
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /\.mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /\.mobile\.spec\.ts/ },
  ],
  webServer: [
    { command: 'node e2e/mock-xtream.mjs', port: 8790, reuseExistingServer: true, timeout: 120_000 },
    { command: 'node server/index.js', port: 8787, reuseExistingServer: true, env: { ALLOW_PRIVATE_HOSTS: '1' } },
    { command: 'npx vite --port 5173 --strictPort', port: 5173, reuseExistingServer: true },
  ],
})
