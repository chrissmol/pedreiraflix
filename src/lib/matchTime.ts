// Quando e o jogo, em palavras: "Hoje", "Amanha" ou o dia, a hora, quanto falta e se esta rolando agora.
const LIVE = /\b(live|in_?play|1h|2h|ht|ao vivo|em andamento)\b/i
const OVER = /\b(ft|aet|finished|ended|final|encerrad\w*|postponed|cancel\w*|adiad\w*)\b/i
// 90 min + intervalo + acrescimos: a API so muda o status de vez em quando, entao o relogio tambem decide.
const LIVE_WINDOW_MS = 135 * 60_000
const DAY_MS = 86_400_000

const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dateFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })

export interface MatchWhen {
  live: boolean
  /** "Hoje", "Amanhã" ou "sáb., 25/10". */
  day: string
  time: string
  /** "em 3 h 18 min" quando falta menos de um dia; senao null. */
  countdown: string | null
}

export function matchWhen(kickoff: string, status: string, now: number): MatchWhen {
  const start = new Date(kickoff)
  const left = start.getTime() - now
  const live = !OVER.test(status) && (LIVE.test(status) || (left <= 0 && -left < LIVE_WINDOW_MS))
  const today = new Date(now)
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  const day =
    start.toDateString() === today.toDateString() ? 'Hoje' : start.toDateString() === tomorrow.toDateString() ? 'Amanhã' : dateFormat.format(start)
  let countdown: string | null = null
  if (left > 0 && left < DAY_MS) {
    const min = Math.ceil(left / 60_000)
    countdown = min < 60 ? `em ${min} min` : `em ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`
  }
  return { live, day, time: timeFormat.format(start), countdown }
}
