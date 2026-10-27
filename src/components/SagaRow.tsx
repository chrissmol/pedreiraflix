import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PosterCard from './PosterCard'
import Row from './Row'
import { useMovieCatalog } from '../hooks/useCatalog'
import { displayTitle } from '../lib/displayTitle'
import { findInCatalog, sagaTitles } from '../lib/sugestoes'

/** "Da mesma saga" na pagina do filme: os outros filmes da colecao do TMDB que existem no catalogo, na ordem em que
 * sairam, com o ✓ de visto do proprio poster. Sem colecao ou nada no catalogo: a fileira nem aparece. */
export default function SagaRow({ name, year, id }: { name: string; year: string | null; id: number }) {
  const [parts, setParts] = useState<{ title: string; original: string }[]>([])
  useEffect(() => {
    let cancelled = false
    sagaTitles(displayTitle(name).replace(/\(\d{4}\)/g, '').trim(), year).then((saga) => !cancelled && setParts(saga?.parts ?? []))
    return () => {
      cancelled = true
    }
  }, [name, year])
  // Igual ao "Parecidos": o catalogo inteiro so carrega quando o filme tem saga.
  if (parts.length === 0) return null
  return <SagaMatches parts={parts} id={id} />
}

function SagaMatches({ parts, id }: { parts: { title: string; original: string }[]; id: number }) {
  const navigate = useNavigate()
  const { groups } = useMovieCatalog()
  // Um titulo por parte (o nome em portugues, senao o original), para manter a ordem da saga.
  const items = useMemo(
    () => [...new Set(parts.flatMap((p) => findInCatalog(groups, [p.title, p.original]).slice(0, 1)))].filter((m) => m.streamId !== id),
    [groups, parts, id],
  )
  if (items.length === 0) return null
  return (
    <Row title="Da mesma saga">
      {items.map((m) => (
        <PosterCard key={m.streamId} title={m.name} image={m.streamIcon} watchedRef={{ kind: 'movie', id: m.streamId }} onClick={() => navigate(`/movies/${m.streamId}`)} />
      ))}
    </Row>
  )
}
