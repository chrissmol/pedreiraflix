import type Hls from 'hls.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Maximize, Search, VolumeHigh, VolumeMute, X } from '../components/icons'
import LiveChannelCard from '../components/LiveChannelCard'
import { refusedMessage, supportsNativeHls } from '../components/videoPlayerUtils'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { useLiveCatalog } from '../hooks/useCatalog'
import { useXtream } from '../hooks/useXtream'
import { isTv } from '../lib/device'
import { displayTitle } from '../lib/displayTitle'
import { matchesQuery } from '../lib/search'
import { connectionStatus, refreshSession } from '../lib/session'
import { moveFocusTv } from '../lib/spatialNav'
import { useAuthStore } from '../store/auth'
import { useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'
import type { LiveChannel } from '../types'

const nativeHls = supportsNativeHls()

/** Mosaico: 2 ou 4 canais ao vivo ao mesmo tempo, so o quadro escolhido com som. Tudo fica na URL
 * (`n` = quadros, `c` = canais, `pick` = quadro escolhendo canal) para o Voltar da tela cheia e do Android
 * voltarem ao mesmo mosaico. Cada quadro e uma conexao no provedor, por isso o limite de telas da conta manda. */
export default function MosaicPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const client = useXtream()
  const { groups, loading } = useLiveCatalog()
  const user = useAuthStore((s) => s.user)
  const isXtream = useAuthStore((s) => s.credentials?.type === 'xtream')
  const connections = isXtream ? connectionStatus(user) : null

  // Conferir as telas ao abrir: o numero do login pode ser de horas atras.
  useEffect(() => {
    refreshSession(30_000)
  }, [])

  const count = params.get('n') === '4' ? 4 : 2
  const ids = (params.get('c') ?? '').split(',').map(Number)
  const pick = params.get('pick') === null ? null : Number(params.get('pick'))
  // Canal so entra se esta no catalogo deste perfil: link direto nao fura o perfil infantil.
  const byId = useMemo(() => new Map(groups.flatMap((g) => g.items.map((c) => [c.streamId, c] as const))), [groups])
  const slots = Array.from({ length: count }, (_, i) => byId.get(ids[i]) ?? null)
  const [audio, setAudio] = useState(0)
  // Na lista de escolha, os recentes primeiro (e quase sempre um deles que se quer no mosaico).
  const profileId = useActiveProfileId()
  const recentIds = useLibraryStore((s) => s.recentLive[profileId])
  const pickerChannels = useMemo(() => {
    const recent = (recentIds ?? []).flatMap((id) => byId.get(id) ?? [])
    const seen = new Set(recent.map((c) => c.streamId))
    return [...recent, ...groups.flatMap((g) => g.items).filter((c) => !seen.has(c.streamId))]
  }, [recentIds, byId, groups])

  function save(nextIds: number[], n = count) {
    setParams({ n: String(n), c: nextIds.slice(0, n).map((id) => id || '').join(',') }, { replace: true })
  }

  // Escolher canal abre com push (o Voltar fecha a lista); a escolha volta uma entrada e so entao grava.
  const chosen = useRef<{ slot: number; id: number } | null>(null)
  useEffect(() => {
    const c = chosen.current
    if (!c || pick !== null) return
    chosen.current = null
    const next = [...ids]
    next[c.slot] = c.id
    save(next)
    setAudio(c.slot)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  function choose(slot: number, ch: LiveChannel) {
    chosen.current = { slot, id: ch.streamId }
    navigate(-1)
  }

  // TV: as setas andam entre quadros e botoes (fora do Layout nao ha quem faca isso).
  useEffect(() => {
    if (!isTv) return
    const dirs: Record<string, 'up' | 'down' | 'left' | 'right'> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
    function onKeyDown(e: KeyboardEvent) {
      const dir = dirs[e.key]
      if (!dir || e.defaultPrevented) return
      const typing = document.activeElement instanceof HTMLInputElement && !document.activeElement.readOnly && (dir === 'left' || dir === 'right')
      if (!typing && moveFocusTv(dir)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const max = connections?.max ?? 4
  const filled = slots.filter(Boolean).length
  const overLimit = connections ? filled > connections.max : false

  return (
    <div id="main-content" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]" inert={pick !== null}>
        <button onClick={() => navigate(-1)} className="btn-secondary h-11" aria-label="Sair do mosaico">
          <ChevronLeft className="h-4 w-4" /> Sair
        </button>
        <h1 className="font-display mr-auto text-headline-sm">Mosaico</h1>
        {[2, 4].map((n) => (
          <button
            key={n}
            onClick={() => save(ids, n)}
            disabled={n > max}
            aria-pressed={count === n}
            title={n > max ? `Sua conta só permite ${max} telas ao mesmo tempo` : undefined}
            className={`btn-secondary h-11 disabled:opacity-40 ${count === n ? 'player-btn-active' : ''}`}
          >
            {n} telas
          </button>
        ))}
        <p data-testid="mosaico-telas" className={`w-full text-body-sm sm:w-auto ${overLimit ? 'text-red-300' : 'text-on-surface-variant'}`}>
          {connections
            ? overLimit
              ? `Sua conta permite ${connections.max} telas ao mesmo tempo: os quadros a mais vão ser recusados.`
              : `Cada quadro usa 1 tela da conta (limite ${connections.max}, em uso agora ${connections.active}).`
            : 'Cada quadro usa 1 conexão no provedor; se ele limitar telas, os quadros a mais são recusados.'}
          {isTv && count === 4 && ' Em TV mais simples, 4 vídeos juntos podem travar.'}
        </p>
      </div>

      {connections && connections.max < 2 ? (
        <p className="m-auto max-w-md px-6 text-center text-body-md text-on-surface-variant">
          Sua conta só permite 1 tela ao mesmo tempo, então o mosaico não tem como tocar dois canais. Fale com o provedor para aumentar o limite.
        </p>
      ) : (
        <div
          inert={pick !== null}
          className={`grid min-h-0 flex-1 gap-1 p-1 ${count === 4 ? 'grid-cols-2 grid-rows-2' : 'grid-rows-2 landscape:grid-cols-2 landscape:grid-rows-1'}`}
        >
          {slots.map((ch, i) =>
            ch && client ? (
              <MosaicTile
                key={`${i}-${ch.streamId}`}
                channel={ch}
                src={client.streamUrl('live', ch.streamId, 'm3u8')}
                hasAudio={audio === i}
                autoFocus={isTv && i === audio}
                onSelect={() => setAudio(i)}
                onPick={() => setParams({ n: String(count), c: ids.join(','), pick: String(i) })}
                onFull={() => navigate(`/watch/live/${ch.streamId}?name=${encodeURIComponent(ch.name)}`)}
                onRemove={() => save(ids.map((id, j) => (j === i ? 0 : id)))}
              />
            ) : (
              <button
                key={i}
                data-spatial
                autoFocus={isTv && i === 0 && filled === 0}
                onClick={() => setParams({ n: String(count), c: ids.join(','), pick: String(i) })}
                className="brand-focus flex items-center justify-center rounded-lg border border-dashed border-outline-soft text-label-md text-on-surface-variant hover:text-white"
              >
                {loading && ids[i] ? 'Carregando…' : '+ Escolher canal'}
              </button>
            ),
          )}
        </div>
      )}

      {pick !== null && <ChannelPicker channels={pickerChannels} onChoose={(ch) => choose(pick, ch)} onClose={() => navigate(-1)} />}
    </div>
  )
}

interface MosaicTileProps {
  channel: LiveChannel
  src: string
  hasAudio: boolean
  autoFocus: boolean
  onSelect: () => void
  onPick: () => void
  onFull: () => void
  onRemove: () => void
}

/** Um quadro: player enxuto (sem os controles do player completo), qualidade presa ao tamanho do quadro. */
function MosaicTile({ channel, src, hasAudio, autoFocus, onSelect, onPick, onFull, onRemove }: MosaicTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hasAudioRef = useRef(hasAudio)
  const [error, setError] = useState<string | null>(null)
  const [buffering, setBuffering] = useState(true)
  // TV: os botoes do quadro so aparecem com OK, senao as setas caem neles em vez de irem ao quadro vizinho.
  const [menu, setMenu] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const showBar = hasAudio && (!isTv || menu)
  const name = displayTitle(channel.name)

  useEffect(() => {
    if (menu) barRef.current?.querySelector('button')?.focus()
  }, [menu])

  useEffect(() => {
    hasAudioRef.current = hasAudio
    const video = videoRef.current
    if (!video) return
    video.muted = !hasAudio
    // Sem gesto antes o navegador recusa som: volta mudo e o quadro mostra o icone de sem som.
    if (hasAudio) video.play().catch((e) => e.name === 'NotAllowedError' && (video.muted = true))
  }, [hasAudio])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let hls: Hls | null = null
    let cancelled = false
    let retries = 0
    setError(null)
    setBuffering(true)
    video.muted = !hasAudioRef.current
    const play = () =>
      video.play().catch((e) => {
        if (e.name !== 'NotAllowedError') return
        video.muted = true
        video.play().catch(() => {})
      })
    const onPlaying = () => setBuffering(false)
    const onWaiting = () => setBuffering(true)
    const onError = () => !hls && !cancelled && setError('Não foi possível tocar este canal.')
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('error', onError)

    async function setup() {
      if (!nativeHls) {
        const { default: HlsCtor } = await import('hls.js')
        if (cancelled) return
        if (HlsCtor.isSupported()) {
          hls = new HlsCtor({
            enableWorker: true,
            // Quadro pequeno pede qualidade pequena: menos banda e menos decodificacao em celular fraco e Fire TV.
            capLevelToPlayerSize: true,
            startLevel: 0,
            maxBufferLength: 12,
            maxMaxBufferLength: 24,
            manifestLoadingMaxRetry: 6,
            levelLoadingMaxRetry: 6,
            fragLoadingMaxRetry: 6,
          })
          hls.on(HlsCtor.Events.ERROR, (_evt, data) => {
            if (!data.fatal || cancelled) return
            if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && data.response?.code !== 403 && ++retries <= 4) return hls?.startLoad()
            if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) return hls?.recoverMediaError()
            hls?.destroy()
            if (data.response?.code === 403) refusedMessage().then((msg) => !cancelled && setError(msg))
            else setError('Não foi possível tocar este canal.')
          })
          hls.loadSource(src)
          hls.attachMedia(video!)
          play()
          return
        }
      }
      video!.src = src
      play()
    }
    setup()
    return () => {
      cancelled = true
      hls?.destroy()
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('error', onError)
      // Solta a conexao no provedor ja, nao quando o elemento for coletado.
      video.removeAttribute('src')
      video.load()
    }
  }, [src])

  return (
    <div
      onFocus={onSelect}
      className={`relative min-h-0 overflow-hidden rounded-lg bg-surface-container ring-2 ${hasAudio ? 'ring-brand-500' : 'ring-transparent'}`}
    >
      <video ref={videoRef} playsInline className="pointer-events-none h-full w-full object-contain" />
      {/* O quadro inteiro e o botao: toque, clique ou OK da TV passam o som para ele. */}
      <button
        data-spatial
        autoFocus={autoFocus}
        onClick={() => (isTv ? setMenu(true) : onSelect())}
        aria-label={`Ouvir ${name}`}
        aria-pressed={hasAudio}
        className="absolute inset-0 focus:outline-none"
      />
      <div className="pointer-events-none absolute left-0 top-0 flex max-w-full items-center gap-1.5 bg-gradient-to-b from-black/70 px-2 py-1 text-label-md">
        {hasAudio ? <VolumeHigh className="h-4 w-4 shrink-0 text-brand-300" /> : <VolumeMute className="h-4 w-4 shrink-0 opacity-70" />}
        <span className="truncate">{name}</span>
      </div>
      {error ? (
        <p className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 text-center text-body-sm text-red-200">{error}</p>
      ) : (
        buffering && <div className="pointer-events-none absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-4 border-outline-strong border-t-brand-400" />
      )}
      {showBar && (
        <div
          ref={barRef}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setMenu(false)}
          className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-black/80 p-2"
        >
          <button onClick={onPick} className="btn-secondary h-10">Trocar canal</button>
          <button onClick={onFull} className="btn-secondary h-10" aria-label={`Tela cheia: ${name}`}>
            <Maximize className="h-4 w-4" />
          </button>
          <button onClick={onRemove} className="btn-secondary h-10" aria-label={`Tirar ${name} do mosaico`}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function ChannelPicker({ channels, onChoose, onClose }: { channels: LiveChannel[]; onChoose: (ch: LiveChannel) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  useDialogA11y(ref, true, onClose)
  const shown = (query.trim() ? channels.filter((c) => matchesQuery(c.name, query)) : channels).slice(0, 60)
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Escolher canal" className="absolute inset-0 flex flex-col bg-surface p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onClose} className="btn-secondary h-11" aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-muted" />
          <input
            type="search"
            placeholder="Buscar canal…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="brand-focus h-11 w-full rounded-full border border-outline-soft bg-surface-container pl-10 pr-4 text-body-md text-white placeholder-on-surface-muted"
          />
        </div>
      </div>
      <div className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))] content-start gap-3 overflow-y-auto">
        {shown.map((ch) => (
          <LiveChannelCard key={ch.streamId} channel={ch} onOpen={() => onChoose(ch)} />
        ))}
        {shown.length === 0 && <p className="text-on-surface-variant">Nenhum canal encontrado.</p>}
      </div>
    </div>
  )
}
