/** Nome para exibir: o provedor enfeita os titulos ("Bound by Fate [L] (2025) (2025) (2025)"). Tira as marcas
 * entre colchetes e os enfeites ★/⚽ e repete o ano uma vez so. O nome cru continua sendo usado para busca e para o TMDB. */
export function displayTitle(name: string): string {
  return name
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[★⚽]/g, ' ')
    .replace(/(\((\d{4})\))(\s*\(\2\))+/g, '$1')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–]\s*$/, '')
    .trim()
}

/** Ano do filme para o filtro: o campo `year` quando o painel manda, senao o "(2024)" do nome. */
export function movieYear(m: { name: string; year?: string | null }): number | null {
  const y = Number(m.year || m.name.match(/\(((?:19|20)\d{2})\)/)?.[1])
  return y > 1900 ? y : null
}

/** Titulo do episodio sem o nome da serie na frente: muitos paineis mandam "Breaking Bad S01E02" e o app ja escreve
 * "Breaking Bad - " antes, o que virava "Breaking Bad - Breaking Bad S01E02". */
export function episodeTitle(seriesName: string, title: string): string {
  const series = displayTitle(seriesName).replace(/\s*\(\d{4}\)$/, '').toLowerCase()
  const t = title.trim()
  if (!series || !t.toLowerCase().startsWith(series)) return t
  const rest = t.slice(series.length)
  // "Lost" nao come o comeco de "Lostgirl S01E01".
  if (/^[\p{L}\p{N}]/u.test(rest)) return t
  return rest.replace(/^[\s\-–:|.]*(\(\d{4}\))?[\s\-–:|.]*/, '') || t
}

/** Nome do episodio no player, no Continuar assistindo e nos downloads: "Serie - episodio", sem repetir a serie. */
export function episodeName(seriesName: string, title: string): string {
  return `${seriesName} - ${episodeTitle(seriesName, title)}`
}
