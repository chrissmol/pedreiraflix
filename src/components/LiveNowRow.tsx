import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import LiveChannelCard from './LiveChannelCard'
import Row from './Row'
import { flattenGroups, useLiveCatalog } from '../hooks/useCatalog'
import { favoritesFor, useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'

const MAX = 12

/** "Ao vivo agora" no Inicio: canais favoritos e recentes do perfil, cada um com o programa que esta passando.
 * Sem favorito nem recente a fileira nem existe (e a lista de canais nem carrega). */
export default function LiveNowRow() {
  const profileId = useActiveProfileId()
  const favoritesRecord = useLibraryStore((s) => s.favorites)
  const recent = useLibraryStore((s) => s.recentLive[profileId])
  const ids = useMemo(() => {
    const favs = favoritesFor(favoritesRecord, profileId).filter((f) => f.kind === 'live').map((f) => f.id)
    return [...new Set([...favs, ...(recent ?? [])])].slice(0, MAX)
  }, [favoritesRecord, profileId, recent])
  if (ids.length === 0) return null
  return <LiveNowChannels ids={ids} />
}

function LiveNowChannels({ ids }: { ids: number[] }) {
  const navigate = useNavigate()
  // Mesmas chaves de cache da tela de canais e do player: quem ja abriu um canal tem a lista guardada.
  const { groups } = useLiveCatalog()
  const channels = useMemo(() => {
    const byId = new Map(flattenGroups(groups).map((c) => [c.streamId, c]))
    return ids.flatMap((id) => byId.get(id) ?? [])
  }, [groups, ids])
  if (channels.length === 0) return null
  return (
    <Row title="Ao vivo agora">
      {channels.map((ch) => (
        <div key={ch.streamId} className="w-72 shrink-0 sm:w-80">
          <LiveChannelCard channel={ch} onOpen={() => navigate(`/watch/live/${ch.streamId}?name=${encodeURIComponent(ch.name)}`)} />
        </div>
      ))}
    </Row>
  )
}
