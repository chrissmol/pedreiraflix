function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const BASE_GAP_MS = 150
const RATE_LIMITED_GAP_MS = 2000
// Depois de um 429 o app PARA de pedir por um tempo (em vez de so alargar o intervalo): contra um provedor que
// corta depois de 2 ou 3 pedidos, continuar batendo prolonga o castigo (app do Windows do Christian, 09/10: nenhum
// canal carregava). O tempo dobra a cada 429 seguido ate o teto, volta ao normal depois de pedidos bons, e o
// "espere N segundos" do provedor (Retry-After) vale quando for maior. Override so para teste e2e.
const COOLDOWN_MS =
  (typeof window !== 'undefined' && (window as { __RATE_COOLDOWN_MS__?: number }).__RATE_COOLDOWN_MS__) || 15_000
const MAX_COOLDOWN_MS = 180_000
// How many requests in a row have to succeed, after a 429 widened the gap, before it's considered safe
// to ease back down — one clean success isn't enough evidence the provider's limit has actually passed.
const SUCCESSES_TO_EASE = 5
// O ritmo que levou ao 429 nao pode voltar na hora: antes o intervalo caia de volta a 150 ms (7 pedidos/s) em ~20
// pedidos e o provedor limitava de novo, em ciclos (app do Windows do Christian, 09/10). Cada 429 sobe um PISO
// (dobra, ate 1/4 do intervalo de castigo); o intervalo desce so ate o piso, e o piso so cai devagar, depois de
// muitos pedidos bons seguidos.
const SUCCESSES_TO_LOWER_FLOOR = 40
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
interface QueueItem {
  start: () => void
  /** Devolve um erro se o pedido nao vale mais a pena quando chegar a vez dele (nao ocupa via nem espera o intervalo). */
  drop?: () => Error | null
  reject: (err: Error) => void
}

export class RequestThrottle {
  private gapMs: number
  private successStreak = 0
  private queue: QueueItem[] = []
  private active = 0
  private concurrency: number
  private baseGapMs: number
  private cooldownMs: number
  private rateLimitedGapMs: number
  private floorGapMs: number
  private floorStreak = 0
  private nextCooldownMs: number
  private pausedUntil = 0
  private resumeTimer: ReturnType<typeof setTimeout> | null = null

  constructor(gapMs: number, concurrency: number, cooldownMs = COOLDOWN_MS, rateLimitedGapMs = RATE_LIMITED_GAP_MS) {
    this.gapMs = gapMs
    this.baseGapMs = gapMs
    this.concurrency = concurrency
    this.cooldownMs = cooldownMs
    this.rateLimitedGapMs = rateLimitedGapMs
    this.floorGapMs = gapMs
    this.nextCooldownMs = cooldownMs
  }

  /** Call after a 429: widens the gap, resets the ease-back-down streak and pauses the background queue for a
   * growing cooldown (at least `retryAfterSec` when the provider said how long to wait). */
  reportRateLimited(retryAfterSec?: number) {
    this.gapMs = Math.max(this.gapMs, this.rateLimitedGapMs)
    this.successStreak = 0
    this.floorStreak = 0
    this.floorGapMs = Math.min(this.rateLimitedGapMs, Math.max(this.floorGapMs * 2, Math.round(this.rateLimitedGapMs / 4)))
    const wait = Math.max(this.nextCooldownMs, (retryAfterSec ?? 0) * 1000)
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + wait)
    this.nextCooldownMs = Math.min(this.nextCooldownMs * 2, MAX_COOLDOWN_MS)
    if (this.resumeTimer) clearTimeout(this.resumeTimer)
    this.resumeTimer = setTimeout(() => this.pump(), this.pausedUntil - Date.now() + 5)
  }

  /** Pausada por causa de um 429 (so o catalogo em segundo plano; o que a pessoa pediu agora passa). */
  get paused() {
    return Date.now() < this.pausedUntil
  }

  /** Call after every non-429 response. Once enough clean requests land in a row, halves the gap back
   * toward the base pace instead of staying at the defensive 429 speed for the rest of the session —
   * the widen-on-429 above previously had no counterpart, so one rate limit early on silently made
   * every request for the rest of the tab's lifetime slower than it needed to be. */
  reportSuccess() {
    if (this.gapMs <= this.floorGapMs) {
      this.nextCooldownMs = this.cooldownMs
      // No piso: depois de muitos pedidos bons o proprio piso desce (ate o ritmo original).
      if (this.floorGapMs > this.baseGapMs && ++this.floorStreak >= SUCCESSES_TO_LOWER_FLOOR) {
        this.floorGapMs = Math.max(this.baseGapMs, Math.round(this.floorGapMs / 2))
        this.floorStreak = 0
      }
      return
    }
    this.successStreak++
    if (this.successStreak >= SUCCESSES_TO_EASE) {
      this.gapMs = Math.max(this.floorGapMs, Math.round(this.gapMs / 2))
      this.successStreak = 0
    }
  }

  /** Limitando ou ainda no ritmo de cautela: o que e so enfeite (programacao dos canais) nao deve gastar a cota. */
  get degraded() {
    return this.paused || this.gapMs > this.baseGapMs
  }

  // Pedidos que a pessoa disparou agora (abrir um filme, uma serie, checar o perfil) nao podem esperar
  // atras das centenas de categorias que o catalogo baixa em segundo plano: antes, com uma fila so,
  // abrir um filme levava minutos depois de um 429. Eles furam a fila e tem uma via extra so deles,
  // entao nem esperam uma das vias do catalogo terminar.
  private urgent: QueueItem[] = []

  private pump() {
    for (;;) {
      // Enquanto o provedor esta limitando (ou logo depois, ate pedidos bons seguidos), uma via so: um pedido de
      // cada vez, em vez das tres de sempre.
      const lanes = this.gapMs > this.baseGapMs ? 1 : this.concurrency
      const fromUrgent = this.urgent.length > 0 && this.active < this.concurrency + 1
      const fromQueue = !fromUrgent && this.queue.length > 0 && this.active < lanes && !this.paused
      if (!fromUrgent && !fromQueue) return
      const next = (fromUrgent ? this.urgent : this.queue).shift()!
      const skip = next.drop?.()
      if (skip) {
        next.reject(skip)
        continue
      }
      this.active++
      next.start()
    }
  }

  schedule<T>(fn: () => Promise<T>, priority: 'urgent' | 'background' = 'background', dropIf?: () => Error | null): Promise<T> {
    return new Promise((resolve, reject) => {
      const release = () =>
        sleep(this.gapMs).then(() => {
          this.active--
          this.pump()
        })
      ;(priority === 'urgent' ? this.urgent : this.queue).push({
        drop: dropIf,
        reject,
        start: () =>
          fn().then(
            (value) => {
              resolve(value)
              release()
            },
            (err) => {
              reject(err)
              release()
            },
          ),
      })
      this.pump()
    })
  }
}

export const xtreamQueue = new RequestThrottle(BASE_GAP_MS, CONCURRENCY)
