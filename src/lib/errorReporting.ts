// The project has no Sentry/analytics account, so a crash a real user hits used to be invisible until
// Christian happened to notice and describe it. This posts uncaught errors/rejections/render crashes to
// /api/log-error (worker/index.js, server/index.js), which just console.error-logs them — viewable with
// `wrangler tail` in production, no third-party account needed. It's a floor, not a real observability
// stack (no retention/alerting/dashboards), but it's a real step up from nothing.

function report(kind: string, message: string, stack?: string) {
  try {
    // Fire-and-forget, deliberately not awaited: reporting a crash must never itself throw, block, or
    // become the thing the user waits on. keepalive lets it survive if the report fires during unload.
    fetch('/api/log-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        kind,
        message: message.slice(0, 500),
        stack: stack?.slice(0, 2000),
        url: location.href,
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {})
  } catch {
    // Never let error reporting itself be the source of a new error.
  }
}

/** Call once, at app startup. Catches what a React error boundary can't: errors outside React's render
 * (event handlers already inside try/catch elsewhere, timers, etc.) and unhandled promise rejections. */
export function installErrorReporting() {
  window.addEventListener('error', (e) => {
    report('window.onerror', e.message || 'Unknown error', e.error?.stack)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    report('unhandledrejection', message, reason instanceof Error ? reason.stack : undefined)
  })
}

/** Called from the React error boundary (see ErrorBoundary.tsx) for render-time crashes. */
export function reportReactError(error: Error) {
  report('react-render', error.message, error.stack)
}
