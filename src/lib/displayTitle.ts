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
