import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PosterCard from './PosterCard'
import Row from './Row'
import { useMovieCatalog, useSeriesCatalog } from '../hooks/useCatalog'
import { aiTitles, findInCatalog } from '../lib/sugestoes'
import { displayTitle } from '../lib/displayTitle'

/** "Parecidos com este" na pagina do filme/serie: a IA sugere nomes e so aparece o que existe no catalogo deste
 * perfil (o infantil nao ve categoria adulta). Nada achado ou IA fora: a fileira nem aparece. */
export default function SimilarRow({ kind, name, id }: { kind: 'movie' | 'series'; name: string; id: number }) {
  const [titles, setTitles] = useState<string[]>([])
  useEffect(() => {
    let cancelled = false
    aiTitles({ like: displayTitle(name).replace(/\(\d{4}\)/g, '').trim(), kind: kind === 'series' ? 'tv' : 'movie' }).then((t) => !cancelled && setTitles(t))
    return () => {
      cancelled = true
    }
  }, [kind, name])
  // O catalogo inteiro so carrega depois que a IA respondeu: sem sugestao, nada de baixar milhares de titulos.
  if (titles.length === 0) return null
  return kind === 'movie' ? <MovieMatches titles={titles} id={id} /> : <SeriesMatches titles={titles} id={id} />
}

function MovieMatches({ titles, id }: { titles: string[]; id: number }) {
  const navigate = useNavigate()
  const { groups } = useMovieCatalog()
  const items = useMemo(() => findInCatalog(groups, titles).filter((m) => m.streamId !== id), [groups, titles, id])
  if (items.length === 0) return null
  return (
    <Row title="Parecidos com este">
      {items.map((m) => (
        <PosterCard key={m.streamId} title={m.name} image={m.streamIcon} onClick={() => navigate(`/movies/${m.streamId}`)} />
      ))}
    </Row>
  )
}

function SeriesMatches({ titles, id }: { titles: string[]; id: number }) {
  const navigate = useNavigate()
  const { groups } = useSeriesCatalog()
  const items = useMemo(() => findInCatalog(groups, titles).filter((s) => s.seriesId !== id), [groups, titles, id])
  if (items.length === 0) return null
  return (
    <Row title="Parecidos com este">
      {items.map((s) => (
        <PosterCard key={s.seriesId} title={s.name} image={s.cover} onClick={() => navigate(`/series/${s.seriesId}`)} />
      ))}
    </Row>
  )
}
