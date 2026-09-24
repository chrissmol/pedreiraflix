import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ensureActiveProfile, refreshSession } from './lib/session'
import { useAccountsStore } from './store/accounts'
import { useAuthStore } from './store/auth'

// Sessions from before saved accounts existed: remember them too, so a later logout doesn't lose the password.
const { credentials } = useAuthStore.getState()
if (credentials && useAccountsStore.getState().accounts.length === 0) {
  useAccountsStore.getState().saveAccount(credentials)
}
// Sessions from before profiles existed: ensure a default profile and fold in whatever
// favorites/progress/watched history was saved under the old, unscoped format.
if (credentials) ensureActiveProfile(credentials)

// Asks the browser not to evict our localStorage under storage pressure (where the login lives).
navigator.storage?.persist?.().catch(() => {})

// Keep account status/expiry fresh on every launch, without ever forcing a new login.
refreshSession()

// Only in the real build: in dev, Vite serves unhashed/rebuilding modules on every save, and a service
// worker caching those would fight HMR instead of helping anything. This is what makes "Adicionar à
// tela de início" behave like an app (instant launch, cached shell) instead of a bookmarked tab.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
