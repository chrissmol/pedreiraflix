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
