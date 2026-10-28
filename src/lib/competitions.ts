// Campeonatos da aba "Times": campeonato -> times -> jogos -> canal. A Mol TV API (via /api/moltv) conhece times e o
// campeonato de cada jogo (`match.competition`), mas o nome varia entre fontes ("Brasileirão", "Campeonato Brasileiro
// Série A"): o slug estavel e o nosso, e `test` e quem casa o nome com ele.
export interface Broadcast {
  channel: string
  slug: string
  confidence: 'confirmada' | 'provavel' | string
}
export interface NextMatchData {
  match: { id: string; home: string; away: string; kickoff: string; competition: string; status: string }
  broadcasts: Broadcast[]
}
export interface TeamRef {
  slug: string
  name: string
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`/api/moltv${path}`)
  if (!res.ok) throw new Error(String(res.status))
  return (await res.json()) as T
}

export interface Competition {
  slug: string
  name: string
  group: string
  /** Testado no nome normalizado (sem acento, minusculo) que vem em `match.competition`. */
  test: RegExp
  /** Times de ponta, buscados pelo nome na API: sao a porta de entrada dos jogos e a lista de "times" do campeonato. */
  seeds: string[]
}

// A ordem importa: o primeiro que casa vence ("serie a" do Brasil antes da italiana, eliminatorias antes da Copa).
export const COMPETITIONS: Competition[] = [
  { slug: 'brasileirao-a', name: 'Brasileirão Série A', group: 'Brasil', test: /brasileir\w*( serie)? a\b|brazil\w* serie a|^brasileirao$|^serie a.*brasil/, seeds: ['Flamengo', 'Palmeiras', 'Corinthians', 'São Paulo', 'Fluminense', 'Botafogo', 'Cruzeiro', 'Atlético Mineiro'] },
  { slug: 'brasileirao-b', name: 'Brasileirão Série B', group: 'Brasil', test: /brasileir\w*( serie)? b\b|brazil\w* serie b|^serie b.*brasil/, seeds: ['Santos', 'Vasco', 'Sport', 'Ceará', 'Coritiba', 'Goiás', 'Chapecoense', 'Avaí'] },
  { slug: 'copa-do-brasil', name: 'Copa do Brasil', group: 'Brasil', test: /copa do brasil|brazil\w* cup/, seeds: ['Flamengo', 'Corinthians', 'São Paulo', 'Palmeiras', 'Grêmio', 'Internacional', 'Cruzeiro', 'Fluminense'] },
  { slug: 'libertadores', name: 'Libertadores', group: 'América do Sul', test: /libertadores/, seeds: ['Flamengo', 'Palmeiras', 'Botafogo', 'River Plate', 'Boca Juniors', 'Atlético Mineiro', 'Peñarol', 'Racing'] },
  { slug: 'sul-americana', name: 'Sul-Americana', group: 'América do Sul', test: /sul.?americana|sudamericana/, seeds: ['Corinthians', 'Bahia', 'Cruzeiro', 'Independiente', 'Lanús', 'Vasco', 'Fortaleza', 'Racing'] },
  { slug: 'premier-league', name: 'Premier League', group: 'Europa', test: /premier league/, seeds: ['Manchester City', 'Arsenal', 'Liverpool', 'Manchester United', 'Chelsea', 'Tottenham', 'Newcastle', 'Aston Villa'] },
  { slug: 'la-liga', name: 'La Liga', group: 'Europa', test: /la liga|primera division|laliga/, seeds: ['Real Madrid', 'Barcelona', 'Atlético de Madrid', 'Sevilla', 'Real Sociedad', 'Athletic Bilbao', 'Villarreal', 'Valencia'] },
  { slug: 'serie-a-italia', name: 'Serie A (Itália)', group: 'Europa', test: /^(italian )?serie a\b|calcio|italia/, seeds: ['Inter', 'Milan', 'Juventus', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina'] },
  { slug: 'bundesliga', name: 'Bundesliga', group: 'Europa', test: /bundesliga/, seeds: ['Bayern', 'Borussia Dortmund', 'Bayer Leverkusen', 'RB Leipzig', 'Eintracht Frankfurt', 'Stuttgart', 'Wolfsburg', 'Borussia Mönchengladbach'] },
  { slug: 'ligue-1', name: 'Ligue 1', group: 'Europa', test: /ligue 1/, seeds: ['Paris Saint-Germain', 'Marseille', 'Lyon', 'Monaco', 'Lille', 'Nice', 'Lens', 'Rennes'] },
  { slug: 'champions-league', name: 'Champions League', group: 'Europa', test: /champions league|liga dos campeoes/, seeds: ['Real Madrid', 'Manchester City', 'Bayern', 'Barcelona', 'Paris Saint-Germain', 'Liverpool', 'Inter', 'Arsenal'] },
  { slug: 'europa-league', name: 'Europa League', group: 'Europa', test: /europa league|liga europa/, seeds: ['Roma', 'Tottenham', 'Manchester United', 'Atalanta', 'Lazio', 'Porto', 'Ajax', 'Benfica'] },
  { slug: 'eliminatorias', name: 'Eliminatórias', group: 'Seleções', test: /eliminat|qualif/, seeds: ['Brasil', 'Argentina', 'Uruguai', 'Colômbia', 'Equador', 'Paraguai', 'Chile', 'Peru'] },
  { slug: 'copa-do-mundo', name: 'Copa do Mundo', group: 'Seleções', test: /copa do mundo|world cup|fifa/, seeds: ['Brasil', 'Argentina', 'França', 'Alemanha', 'Espanha', 'Inglaterra', 'Portugal', 'Itália'] },
  { slug: 'eurocopa', name: 'Eurocopa', group: 'Seleções', test: /eurocopa|european championship|euro 20/, seeds: ['França', 'Alemanha', 'Espanha', 'Inglaterra', 'Portugal', 'Itália', 'Holanda', 'Bélgica'] },
  { slug: 'copa-america', name: 'Copa América', group: 'Seleções', test: /copa america/, seeds: ['Brasil', 'Argentina', 'Uruguai', 'Colômbia', 'Equador', 'Paraguai', 'Chile', 'México'] },
  { slug: 'nba', name: 'NBA', group: 'EUA', test: /^nba\b|national basketball/, seeds: ['Lakers', 'Celtics', 'Warriors', 'Knicks', 'Heat', 'Bucks', 'Nuggets', 'Mavericks'] },
  { slug: 'nfl', name: 'NFL', group: 'EUA', test: /^nfl\b|national football/, seeds: ['Chiefs', 'Cowboys', '49ers', 'Eagles', 'Patriots', 'Packers', 'Bills', 'Ravens'] },
]

export const COMPETITION_PREFIX = 'comp:'
export const competitionBySlug = (slug: string) => COMPETITIONS.find((c) => c.slug === slug)

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
/** O campeonato nosso a que o nome da API se refere, ou undefined. */
export function competitionOf(name: string) {
  const n = norm(name)
  return COMPETITIONS.find((c) => c.test.test(n))
}

export interface CompetitionData {
  teams: TeamRef[]
  matches: NextMatchData[]
}

const TTL = 10 * 60_000
const cache = new Map<string, { at: number; data: Promise<CompetitionData> }>()
// shortcut: se a API nao tem rota por campeonato, junta os proximos jogos dos times de ponta (+ os que a pessoa segue);
// jogo entre times fora dessa lista nao aparece. Trocar pela rota propria quando a Mol TV API tiver.
let routeMissing = false

async function load(c: Competition, followed: TeamRef[]): Promise<CompetitionData> {
  if (!routeMissing) {
    try {
      const d = await getJson<{ matches: NextMatchData[]; teams?: TeamRef[] }>(`/v1/competitions/${c.slug}/next`)
      if (Array.isArray(d.matches)) return { teams: d.teams ?? [], matches: d.matches }
    } catch {
      routeMissing = true
    }
  }
  const found = await Promise.all(
    c.seeds.map((q) =>
      getJson<{ results: (TeamRef & { type: string })[] }>(`/v1/search?${new URLSearchParams({ q })}`)
        .then((d) => d.results.find((r) => r.type === 'team'))
        .catch(() => undefined),
    ),
  )
  const teams = found.filter((t): t is TeamRef & { type: string } => !!t).map(({ slug, name }) => ({ slug, name }))
  const slugs = [...new Set([...teams, ...followed].map((t) => t.slug))]
  const lists = await Promise.all(slugs.map((s) => getJson<{ matches: NextMatchData[] }>(`/v1/teams/${s}/next`).then((d) => d.matches).catch(() => [])))
  const byId = new Map<string, NextMatchData>()
  for (const m of lists.flat()) if (competitionOf(m.match.competition)?.slug === c.slug) byId.set(m.match.id, m)
  const matches = [...byId.values()].sort((a, b) => a.match.kickoff.localeCompare(b.match.kickoff))
  return { teams, matches }
}

export function loadCompetition(c: Competition, followed: TeamRef[], attempt = 0): Promise<CompetitionData> {
  const key = `${c.slug}:${attempt}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.data
  const data = load(c, followed)
  cache.set(key, { at: Date.now(), data })
  data.catch(() => cache.delete(key))
  return data
}
