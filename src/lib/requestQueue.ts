function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Serializes every Xtream API call app-wide (movies, series, live all share
// this one queue) so independent catalog hooks can't each run their own
// "small" concurrency pool that adds up to a burst the provider rate-limits.
// Each call waits for the previous one to fully finish, then for `minGapMs`,
// before starting — true concurrency 1, not just a capped start rate.
class RequestThrottle {
  private tail: Promise<void> = Promise.resolve()
  private gapMs: number

  constructor(gapMs: number) {
    this.gapMs = gapMs
  }

  /** Widens the gap after hitting a rate limit; call on a successful response to ease back down. */
  setGap(ms: number) {
    this.gapMs = ms
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

export const xtreamQueue = new RequestThrottle(350)
