function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const BASE_GAP_MS = 150
const RATE_LIMITED_GAP_MS = 2000
// How many requests in a row have to succeed, after a 429 widened the gap, before it's considered safe
// to ease back down — one clean success isn't enough evidence the provider's limit has actually passed.
const SUCCESSES_TO_EASE = 5
// The Worker's own rate limiter allows 300 req/10s (30/s) for these calls — 3 lanes at the base gap
// below works out to well under half that, so there's real headroom before this needs to widen. Movies,
// series and live catalogs used to fully serialize behind each other (concurrency 1) even though they're
// independent category lists; multiple lanes let them load in parallel instead.
const CONCURRENCY = 3

// Rate-limits every Xtream API call app-wide (movies, series, live all share this one queue) so
// independent catalog hooks can't each run their own "small" concurrency pool that adds up to a burst
// the provider rate-limits. Up to CONCURRENCY calls run at once; each lane waits `gapMs` after its call
// finishes before picking up the next queued one, so the pacing guarantee is per-lane, not just a capped
// total start rate.
class RequestThrottle {
  private gapMs: number
  private successStreak = 0
  private queue: (() => void)[] = []
  private active = 0
  private concurrency: number

  constructor(gapMs: number, concurrency: number) {
    this.gapMs = gapMs
    this.concurrency = concurrency
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

  private pump() {
    if (this.active >= this.concurrency) return
    const next = this.queue.shift()
    if (!next) return
    this.active++
    next()
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(() => {
        fn().then(
          (value) => {
            resolve(value)
            sleep(this.gapMs).then(() => {
              this.active--
              this.pump()
            })
          },
          (err) => {
            reject(err)
            sleep(this.gapMs).then(() => {
              this.active--
              this.pump()
            })
          },
        )
      })
      this.pump()
    })
  }
}

export const xtreamQueue = new RequestThrottle(BASE_GAP_MS, CONCURRENCY)
