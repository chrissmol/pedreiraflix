// "Fórmula 1": proxy da Jolpica (sucessora gratuita da Ergast, sem chave) so para a proxima etapa do calendario.
// Devolve um formato nosso (sessoes com horario UTC ISO) para a tela nao depender do formato da Ergast.
export const JOLPICA_NEXT = 'https://api.jolpi.ca/ergast/f1/current/next.json'

const SESSIONS = [
  ['FirstPractice', 'Treino livre 1'],
  ['SecondPractice', 'Treino livre 2'],
  ['ThirdPractice', 'Treino livre 3'],
  ['SprintQualifying', 'Classificação da sprint'],
  ['SprintShootout', 'Classificação da sprint'],
  ['Sprint', 'Sprint'],
  ['Qualifying', 'Classificação'],
]

// Ergast: { date: '2026-03-15', time: '04:00:00Z' }; sem hora, nao da para mostrar horario local.
const startOf = (s) => {
  const t = s && s.date && s.time ? Date.parse(`${s.date}T${s.time}`) : NaN
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

export function f1Normalize(json) {
  const r = json?.MRData?.RaceTable?.Races?.[0]
  if (!r) return { race: null }
  const sessions = [...SESSIONS, ['Race', 'Corrida']]
    .map(([key, name]) => ({ key, name, start: startOf(key === 'Race' ? r : r[key]) }))
    .filter((s) => s.start)
    .sort((a, b) => a.start.localeCompare(b.start))
  if (!sessions.length) return { race: null }
  return {
    race: {
      name: String(r.raceName || 'Grande Prêmio'),
      round: Number(r.round) || 0,
      circuit: String(r.Circuit?.circuitName || ''),
      place: [r.Circuit?.Location?.locality, r.Circuit?.Location?.country].filter(Boolean).join(', '),
      sessions,
    },
  }
}

export async function f1Next() {
  try {
    const res = await fetch(JOLPICA_NEXT, { signal: AbortSignal.timeout(8000), cf: { cacheTtl: 600, cacheEverything: true } })
    if (!res.ok) return new Response('f1 unavailable', { status: 502 })
    return Response.json(f1Normalize(await res.json()), { headers: { 'cache-control': 'public, max-age=600' } })
  } catch {
    return new Response('f1 unavailable', { status: 502 })
  }
}
