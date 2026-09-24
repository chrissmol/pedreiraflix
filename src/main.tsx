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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
