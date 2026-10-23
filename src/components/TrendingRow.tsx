import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PosterCard from './PosterCard'
import Row from './Row'
import { useMovieCatalog, useSeriesCatalog } from '../hooks/useCatalog'
import { findInCatalog, trendingTitles } from '../lib/sugestoes'

/** "Em alta esta semana" no Inicio: a lista de tendencias do TMDB, so com o que existe no catalogo deste perfil,
 * intercalando filme e serie. Nada achado: a fileira nem aparece. Nao pede nada ao provedor. */
export default function TrendingRow() {
  const navigate = useNavigate()
  const movies = useMovieCatalog()
  const series = useSeriesCatalog()
  const [titles, setTitles] = useState<{ movie: string[]; tv: string[] }>({ movie: [], tv: [] })
  useEffect(() => {
    let cancelled = false
    Promise.all([trendingTitles('movie'), trendingTitles('tv')]).then(([movie, tv]) => !cancelled && setTitles({ movie, tv }))
    return () => {
      cancelled = true
    }
  }, [])
  const items = useMemo(() => {
    const m = findInCatalog(movies.groups, titles.movie).map((x) => ({ kind: 'movie' as const, id: x.streamId, name: x.name, image: x.streamIcon }))
    const s = findInCatalog(series.groups, titles.tv).map((x) => ({ kind: 'series' as const, id: x.seriesId, name: x.name, image: x.cover }))
    const out = []
    for (let i = 0; i < Math.max(m.length, s.length); i++) out.push(...[m[i], s[i]].filter((x) => x !== undefined))
    return out.slice(0, 20)
  }, [movies.groups, series.groups, titles])
  if (items.length === 0) return null
  return (
    <Row title="Em alta esta semana">
      {items.map((it) => (
        <PosterCard
          key={`${it.kind}-${it.id}`}
          title={it.name}
          image={it.image}
          imdb={{ title: it.name, kind: it.kind === 'movie' ? 'movie' : 'tv' }}
          watchedRef={{ kind: it.kind, id: it.id }}
          onClick={() => navigate(it.kind === 'movie' ? `/movies/${it.id}` : `/series/${it.id}`)}
        />
      ))}
    </Row>
  )
}
