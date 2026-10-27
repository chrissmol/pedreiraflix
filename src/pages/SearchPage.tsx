import { movieYear } from '../lib/displayTitle'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import LiveChannelCard from '../components/LiveChannelCard'
import PosterCard from '../components/PosterCard'
import { Clock, Search, X } from '../components/icons'
import { useLiveCatalog, useMovieCatalog, useSeriesCatalog } from '../hooks/useCatalog'
import { useDebounced } from '../hooks/useDebounced'
import { isTv } from '../lib/device'
import { searchCatalog } from '../lib/search'
import { clearRecentSearches, loadRecentSearches, saveRecentSearch } from '../store/library'
import { useActiveProfileId } from '../store/profiles'
import PageLoading from '../components/PageLoading'
import { aiTitles, findInCatalog, personTitles } from '../lib/sugestoes'

// Buscar "a" no painel do Christian dava ~29 mil cartoes montados de uma vez (209 mil nos do DOM). Cada secao
// mostra um bloco e o resto vem em "Mostrar mais".
const BLOCK = 60

type Section = 'movies' | 'series' | 'live'

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const query = (params.get('q') || '').trim()
  const navigate = useNavigate()
  const profileId = useActiveProfileId()
  const inputRef = useRef<HTMLInputElement>(null)
  // O quanto cada secao ja foi ampliada pertence a uma busca: outra busca volta ao primeiro bloco.
  const [extra, setExtra] = useState({ q: query, movies: 0, series: 0, live: 0 })
  const added = extra.q === query ? extra : { q: query, movies: 0, series: 0, live: 0 }
  const more = (section: Section) => setExtra({ ...added, [section]: added[section] + BLOCK })
  const shown = (section: Section) => BLOCK + added[section]

  // Campo da pagina (celular, tablet e TV): o texto e local e a URL so muda depois de uma pausa na digitacao, sempre
  // trocando a entrada do historico — o Voltar sai da busca com um toque, e a TV nao refaz a busca a cada letra.
  const [text, setText] = useState(query)
  const pushed = useRef(query)
  const typed = useDebounced(text.trim(), 300)
  function commit(q: string) {
    pushed.current = q
    setParams(q ? { q } : {}, { replace: true })
  }
  useEffect(() => {
    if (typed !== pushed.current) commit(typed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed])
  // A URL mudou por fora (busca do cabecalho, Voltar): o campo acompanha.
  useEffect(() => {
    if (query !== pushed.current) {
      pushed.current = query
      setText(query)
    }
  }, [query])

  const [recentCleared, setRecentCleared] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recent = useMemo(() => loadRecentSearches(profileId), [profileId, query, recentCleared])
  function open(path: string) {
    saveRecentSearch(profileId, query)
    navigate(path)
  }

  const movies = useMovieCatalog()
  const series = useSeriesCatalog()
  const live = useLiveCatalog()

  // Mesma regra das sugestoes do cabecalho: nome por relevancia, depois o que so bate pela categoria.
  const results = useMemo(() => {
    if (query.length < 2) return { movies: [], series: [], live: [] }
    const items = <T,>(hits: { item: T }[]) => hits.map((h) => h.item)
    return {
      movies: items(searchCatalog(movies.groups, query, true)),
      series: items(searchCatalog(series.groups, query, true)),
      live: items(searchCatalog(live.groups, query)),
    }
  }, [query, movies.groups, series.groups, live.groups])

  const anyGroupLoading = (g: { loading: boolean }[]) => g.some((group) => group.loading)
  const loading =
    movies.loading ||
    series.loading ||
    live.loading ||
    anyGroupLoading(movies.groups) ||
    anyGroupLoading(series.groups) ||
    anyGroupLoading(live.groups)
  const total = results.movies.length + results.series.length + results.live.length

  // Busca por frase ("comedia anos 90", "filme de tubarao"): a IA sugere titulos e mostramos os que existem no catalogo.
  // So pergunta com 3+ palavras ou quando o nome nao achou nada, para nao gastar a cota diaria em cada nome digitado.
  const askAi = query.length >= 3 && (query.split(/\s+/).length >= 3 || (!loading && total === 0))
  const [ai, setAi] = useState({ q: '', titles: [] as string[] })
  useEffect(() => {
    if (!askAi) return
    let cancelled = false
    aiTitles({ q: query }).then((titles) => !cancelled && setAi({ q: query, titles }))
    return () => {
      cancelled = true
    }
  }, [askAi, query])
  // Ator ou diretor ("tom hanks", "nolan"): o TMDB da os titulos da pessoa e mostramos os que existem no catalogo.
  const [person, setPerson] = useState<{ q: string; data: Awaited<ReturnType<typeof personTitles>> }>({ q: '', data: null })
  useEffect(() => {
    if (query.length < 3) return
    let cancelled = false
    personTitles(query).then((data) => !cancelled && setPerson({ q: query, data }))
    return () => {
      cancelled = true
    }
  }, [query])
  const { picks, personPicks } = useMemo(() => {
    const inCatalog = (titles: string[]) => [
      ...findInCatalog(movies.groups, titles).map((m) => ({ key: `m${m.streamId}`, name: m.name, image: m.streamIcon, path: `/movies/${m.streamId}` })),
      ...findInCatalog(series.groups, titles).map((s) => ({ key: `s${s.seriesId}`, name: s.name, image: s.cover, path: `/series/${s.seriesId}` })),
    ]
    const personPicks = inCatalog(person.q === query && person.data ? person.data.titles : [])
    const shown = new Set(personPicks.map((p) => p.key))
    return { personPicks, picks: inCatalog(ai.q === query ? ai.titles : []).filter((p) => !shown.has(p.key)) }
  }, [movies.groups, series.groups, ai, person, query])

  return (
    <div className="min-h-screen px-4 pt-[calc(6rem+env(safe-area-inset-top))] sm:px-10">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          commit(text.trim())
          saveRecentSearch(profileId, text)
          inputRef.current?.blur() // fecha o teclado do celular/TV para mostrar os resultados
        }}
        className={`relative mb-6 ${isTv ? '' : 'lg:hidden'}`}
      >
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-on-surface-muted" />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoFocus={!query}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Filmes, séries e canais"
          aria-label="Buscar no catálogo"
          className="brand-focus h-12 w-full appearance-none rounded-full border border-outline-soft bg-surface-container pl-12 pr-12 text-body-lg text-white placeholder:text-on-surface-muted focus:border-brand-500/60"
        />
        {text && (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => {
              setText('')
              commit('')
              inputRef.current?.focus()
            }}
            className="brand-focus absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-muted hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </form>

      {query.length >= 2 && <h1 className="font-display text-headline-md text-white sm:text-headline-lg mb-8">Resultados para "{query}"</h1>}

      {query.length === 0 && recent.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-headline-sm text-white">Buscas recentes</h2>
            <button
              type="button"
              onClick={() => {
                clearRecentSearches(profileId)
                setRecentCleared((n) => n + 1)
              }}
              className="text-label-md text-on-surface-variant hover:text-white"
            >
              Limpar
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recent.map((q) => (
              <button key={q} type="button" onClick={() => commit(q)} className="btn-secondary flex items-center gap-2">
                <Clock className="h-4 w-4" /> {q}
              </button>
            ))}
          </div>
        </section>
      )}
      {query.length === 0 && recent.length === 0 && <p className="text-on-surface-variant">Digite o nome de um filme, série ou canal.</p>}
      {query.length === 1 && <p className="text-on-surface-variant">Digite pelo menos 2 letras.</p>}

      {query.length >= 2 && loading && <PageLoading label="Carregando catálogo" className="py-8" />}
      {query.length >= 2 && !loading && total === 0 && picks.length === 0 && personPicks.length === 0 && <p className="text-on-surface-variant">Nada encontrado para "{query}". Confira se o nome está certo.</p>}

      {personPicks.length > 0 && person.data && (
        <section className="mb-8">
          <h2 className="font-display mb-3 flex items-center gap-2 text-headline-sm text-white">
            <span className="h-4 w-1 rounded-full bg-brand-500" />
            {person.data.directing ? `Dirigidos por ${person.data.name}` : `Com ${person.data.name}`}
          </h2>
          <div className="flex flex-wrap gap-3">
            {personPicks.map((p) => (
              <PosterCard key={p.key} title={p.name} image={p.image} onClick={() => open(p.path)} />
            ))}
          </div>
        </section>
      )}
      {picks.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 flex items-center gap-2 text-headline-sm text-white">
            <span className="h-4 w-1 rounded-full bg-brand-500" />
            Combina com a sua busca
          </h2>
          <div className="flex flex-wrap gap-3">
            {picks.map((p) => (
              <PosterCard key={p.key} title={p.name} image={p.image} onClick={() => open(p.path)} />
            ))}
          </div>
        </section>
      )}

      {results.movies.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 flex items-center gap-2 text-headline-sm text-white">
            <span className="h-4 w-1 rounded-full bg-brand-500" />
            Filmes
          </h2>
          <div className="flex flex-wrap gap-3">
            {results.movies.slice(0, shown('movies')).map((m) => (
              <PosterCard key={m.streamId} title={m.name} image={m.streamIcon} imdb={{ title: m.name, year: movieYear(m), kind: 'movie' }} watchedRef={{ kind: 'movie', id: m.streamId }} onClick={() => open(`/movies/${m.streamId}`)} />
            ))}
          </div>
          {results.movies.length > shown('movies') && (
            <button onClick={() => more('movies')} className="btn-secondary mt-4">
              Mostrar mais ({results.movies.length - shown('movies')})
            </button>
          )}
        </section>
      )}

      {results.series.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 flex items-center gap-2 text-headline-sm text-white">
            <span className="h-4 w-1 rounded-full bg-brand-500" />
            Séries
          </h2>
          <div className="flex flex-wrap gap-3">
            {results.series.slice(0, shown('series')).map((s) => (
              <PosterCard key={s.seriesId} title={s.name} image={s.cover} imdb={{ title: s.name, year: s.releaseDate, kind: 'tv' }} watchedRef={{ kind: 'series', id: s.seriesId }} onClick={() => open(`/series/${s.seriesId}`)} />
            ))}
          </div>
          {results.series.length > shown('series') && (
            <button onClick={() => more('series')} className="btn-secondary mt-4">
              Mostrar mais ({results.series.length - shown('series')})
            </button>
          )}
        </section>
      )}

      {results.live.length > 0 && (
        <section className="mb-8">
          <h2 className="font-display mb-3 flex items-center gap-2 text-headline-sm text-white">
            <span className="h-4 w-1 rounded-full bg-brand-500" />
            Canais
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))] gap-3">
            {results.live.slice(0, shown('live')).map((c) => (
              <LiveChannelCard
                key={c.streamId}
                channel={c}
                onOpen={() => open(`/watch/live/${c.streamId}?name=${encodeURIComponent(c.name)}`)}
              />
            ))}
          </div>
          {results.live.length > shown('live') && (
            <button onClick={() => more('live')} className="btn-secondary mt-4">
              Mostrar mais ({results.live.length - shown('live')})
            </button>
          )}
        </section>
      )}
    </div>
  )
}
