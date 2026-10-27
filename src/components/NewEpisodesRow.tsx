import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PosterCard from './PosterCard'
import Row from './Row'
import { useXtream } from '../hooks/useXtream'
import { cached } from '../lib/cache'
import { useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'
import type { SeriesDetails } from '../types'

// shortcut: so as 8 series terminadas mais recentes (um pedido ao provedor cada); aumentar se alguem sentir falta.
const MAX = 8

/** "Novos episódios" no Inicio: series que o perfil terminou e que ganharam episodio depois disso (o mesmo selo da
 * pagina da serie, so que sem precisar entrar nela). Usa o mesmo cache da pagina da serie e do player. */
export default function NewEpisodesRow() {
  const client = useXtream()
  const navigate = useNavigate()
  const profileId = useActiveProfileId()
  const seriesDone = useLibraryStore((s) => s.seriesDone)
  const done = useMemo(() => {
    const prefix = `${profileId}:`
    return Object.entries(seriesDone)
      .filter(([key, v]) => key.startsWith(prefix) && v.done)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX)
      .map(([key, v]) => ({ seriesId: Number(key.slice(prefix.length)), episodes: v.episodes }))
  }, [seriesDone, profileId])
  const [found, setFound] = useState<{ series: SeriesDetails; extra: number }[]>([])

  useEffect(() => {
    if (!client || done.length === 0) return
    let cancelled = false
    Promise.all(
      done.map(({ seriesId, episodes }) =>
        cached(`series-info:${seriesId}`, () => client.getSeriesInfo(seriesId))
          .then((series) => {
            const now = series.seasons.filter((s) => s.seasonNumber > 0).reduce((n, s) => n + s.episodes.length, 0)
            return now > episodes ? [{ series, extra: now - episodes }] : []
          })
          .catch(() => []),
      ),
    ).then((lists) => !cancelled && setFound(lists.flat()))
    return () => {
      cancelled = true
    }
  }, [client, done])

  if (done.length === 0 || found.length === 0) return null
  return (
    <Row title="Novos episódios">
      {found.map(({ series, extra }) => (
        <PosterCard
          key={series.seriesId}
          title={series.name}
          image={series.cover}
          subtitle={extra === 1 ? '1 episódio novo' : `${extra} episódios novos`}
          onClick={() => navigate(`/series/${series.seriesId}`)}
        />
      ))}
    </Row>
  )
}
