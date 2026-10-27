// Gêneros do TMDB chegam misturados (Documentário e Documentary, Kids e Família, "Action & Adventure"): o painel
// do provedor entrega o que o TMDB devolveu, em português ou inglês conforme o título. Tudo vira um nome só, em
// português, para o filtro não mostrar o mesmo gênero duas vezes.
const ALIASES: Record<string, string> = {
  action: 'Ação',
  adventure: 'Aventura',
  'action & adventure': 'Ação e Aventura',
  animation: 'Animação',
  comedy: 'Comédia',
  documentary: 'Documentário',
  family: 'Família',
  kids: 'Família',
  infantil: 'Família',
  fantasy: 'Fantasia',
  history: 'História',
  horror: 'Terror',
  music: 'Música',
  mystery: 'Mistério',
  news: 'Notícias',
  soap: 'Novela',
  talk: 'Talk show',
  thriller: 'Suspense',
  'sci-fi': 'Ficção Científica',
  'science fiction': 'Ficção Científica',
  'sci-fi & fantasy': 'Ficção Científica e Fantasia',
  war: 'Guerra',
  'war & politics': 'Guerra e Política',
  western: 'Faroeste',
  'tv movie': 'Filme de TV',
}

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const BY_KEY = new Map(Object.entries(ALIASES).map(([k, v]) => [strip(k), v]))

export function normalizeGenre(raw: string): string {
  const trimmed = raw.trim()
  return BY_KEY.get(strip(trimmed)) ?? trimmed
}

/** Gêneros de um título (campo livre do provedor, separado por vírgula ou barra), já normalizados e sem repetir. */
export function genresOf(genre?: string | null): string[] {
  if (!genre) return []
  const seen = new Map<string, string>()
  for (const part of genre.split(/[,/]/)) {
    const name = normalizeGenre(part)
    if (name) seen.set(strip(name), name)
  }
  return [...seen.values()]
}
