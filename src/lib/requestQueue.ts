function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const BASE_GAP_MS = 150
const RATE_LIMITED_GAP_MS = 2000
// How many requests in a row have to succeed, after a 429 widened the gap, before it's considered safe
// to ease back down — one clean success isn't enough evidence the provider's limit has actually passed.
const SUCCESSES_TO_EASE = 5

// Serializes every Xtream API call app-wide (movies, series, live all share
// this one queue) so independent catalog hooks can't each run their own
// "small" concurrency pool that adds up to a burst the provider rate-limits.
// Each call waits for the previous one to fully finish, then for `gapMs`,
// before starting — true concurrency 1, not just a capped start rate.
class RequestThrottle {
  private tail: Promise<void> = Promise.resolve()
  private gapMs: number
  private successStreak = 0

  constructor(gapMs: number) {
    this.gapMs = gapMs
  }

  /** Call after a 429: widens the gap immediately and resets the ease-back-down streak. */
  reportRateLimited() {
    this.gapMs = RATE_LIMITED_GAP_MS
    this.successStreak = 0
  }

  /** Call after every non-429 response. Once enough clean requests land in a row, halves the gap back
   * toward the base pace instead of staying at the defensive 429 speed for the rest of the session —
   * the widen-on-429 above previously had no counterpart, so one rate limit early on silently made
   * every request for the rest of the tab's lifetime slower than it needed to be. */
  reportSuccess() {
    if (this.gapMs <= BASE_GAP_MS) return
    this.successStreak++
    if (this.successStreak >= SUCCESSES_TO_EASE) {
      this.gapMs = Math.max(BASE_GAP_MS, Math.round(this.gapMs / 2))
      this.successStreak = 0
    }
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn)
    this.tail = result.then(
      () => sleep(this.gapMs),
      () => sleep(this.gapMs),
    )
    return result
  }
}

export const xtreamQueue = new RequestThrottle(BASE_GAP_MS)
