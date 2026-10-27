import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Film, Layers, Trophy, Tv } from '../components/icons'
import { flattenGroups, useMovieCatalog, useSeriesCatalog } from '../hooks/useCatalog'
import { cleanCategoryName } from '../lib/channelGroups'
import { displayTitle } from '../lib/displayTitle'
import { useActiveProfile, useActiveProfileId } from '../store/profiles'
import { monthKey, useWatchStats, type WatchedItem } from '../store/watchStats'

/** "3 h 20 min", "45 min", "menos de 1 min". */
function formatWatchTime(seconds: number): string {
  const min = Math.floor(seconds / 60)
  if (min < 1) return 'menos de 1 min'
  const h = Math.floor(min / 60)
  return h ? `${h} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`
}

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

/** Retrospectiva do perfil: quanto assistiu no mes, do que mais gostou e a serie mais maratonada. So o que foi visto
 * neste aparelho desde que a contagem comecou (store/watchStats.ts). */
export default function RetrospectivePage() {
  const navigate = useNavigate()
  const profileId = useActiveProfileId()
  const profile = useActiveProfile()
  const allMonths = useWatchStats((s) => s.months)
  const months = useMemo(() => {
    const prefix = `${profileId}:`
    const keys = Object.keys(allMonths).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))
    return [...new Set([monthKey(), ...keys])].sort().reverse().slice(0, 12)
  }, [allMonths, profileId])
  const [chosen, setChosen] = useState(monthKey())
  const items = useMemo(
    () => Object.values(allMonths[`${profileId}:${chosen}`] ?? {}).sort((a, b) => b.seconds - a.seconds),
    [allMonths, profileId, chosen],
  )
  const total = items.reduce((n, i) => n + i.seconds, 0)
  const byKind = (kind: WatchedItem['kind']) => items.filter((i) => i.kind === kind).reduce((n, i) => n + i.seconds, 0)
  const topSeries = items.find((i) => i.kind === 'series')
  const topMovie = items.find((i) => i.kind === 'movie')
  const genre = useFavoriteGenre(items)
  const open = (i: WatchedItem) =>
    navigate(i.kind === 'movie' ? `/movies/${i.id}` : i.kind === 'series' ? `/series/${i.id}` : `/watch/live/${i.id}?name=${encodeURIComponent(i.name)}`)

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-4 pb-16 pt-[calc(6rem+env(safe-area-inset-top))] sm:px-10">
      <h1 className="font-display text-headline-md text-white sm:text-headline-lg">Sua retrospectiva</h1>
      <p className="mt-1 text-body-md text-on-surface-variant">
        {profile?.name ? `${profile.name}, o` : 'O'} que você assistiu neste aparelho.
      </p>

      <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Mês">
        {months.map((m) => (
          <button
            key={m}
            onClick={() => setChosen(m)}
            aria-pressed={m === chosen}
            className={`brand-focus shrink-0 rounded-full px-4 py-2 text-label-md capitalize transition-colors ${m === chosen ? 'bg-white text-black' : 'bg-surface-container text-on-surface-variant hover:text-white'}`}
          >
            {monthLabel(m)}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <p className="mt-12 rounded-2xl border border-outline-soft bg-surface-low p-6 text-center text-body-md text-on-surface-variant">
          Nada assistido em {monthLabel(chosen)} ainda. Dê o play em algo e volte aqui.
        </p>
      ) : (
        <>
          <section className="mt-8 rounded-3xl bg-gradient-to-br from-brand-600 to-brand-900 p-6 sm:p-8">
            <p className="text-label-md uppercase tracking-wider text-white/75">Tempo assistido em {monthLabel(chosen)}</p>
            <p data-testid="retro-total" className="font-display mt-2 text-headline-lg text-white sm:text-display-hero">
              {formatWatchTime(total)}
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3 text-white">
              {(
                [
                  ['Filmes', byKind('movie'), Film],
                  ['Séries', byKind('series'), Layers],
                  ['Ao vivo', byKind('live'), Tv],
                ] as const
              ).map(([label, seconds, Icon]) => (
                <div key={label} className="rounded-2xl bg-black/20 p-3">
                  <Icon className="h-5 w-5 text-white/75" />
                  <p className="mt-2 text-label-md text-white/75">{label}</p>
                  <p className="text-body-md font-semibold">{formatWatchTime(seconds)}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Highlight title="Série mais maratonada" item={topSeries} onOpen={open} />
            <Highlight title="Filme que mais te prendeu" item={topMovie} onOpen={open} />
            <div className="rounded-3xl border border-outline-soft bg-surface-low p-5">
              <p className="text-label-md uppercase tracking-wider text-on-surface-muted">Gênero favorito</p>
              <p data-testid="retro-genero" className="font-display mt-3 text-headline-sm text-white">
                {genre ?? '—'}
              </p>
            </div>
          </div>

          <section className="mt-8">
            <h2 className="font-display flex items-center gap-2 text-headline-sm text-white">
              <Trophy className="h-5 w-5 text-brand-400" /> Seus mais assistidos
            </h2>
            <ol className="mt-3 space-y-2">
              {items.slice(0, 5).map((i, n) => (
                <li key={`${i.kind}-${i.id}`}>
                  <button
                    data-spatial
                    onClick={() => open(i)}
                    className="brand-focus flex w-full items-center gap-4 rounded-2xl bg-surface-low p-3 text-left transition-colors hover:bg-surface-container"
                  >
                    <span className="w-6 text-center font-display text-headline-sm text-on-surface-muted">{n + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-body-md text-white">{displayTitle(i.name)}</span>
                    <span className="shrink-0 text-body-sm text-on-surface-variant">{formatWatchTime(i.seconds)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  )
}

function Highlight({ title, item, onOpen }: { title: string; item: WatchedItem | undefined; onOpen: (i: WatchedItem) => void }) {
  return (
    <div className="rounded-3xl border border-outline-soft bg-surface-low p-5">
      <p className="text-label-md uppercase tracking-wider text-on-surface-muted">{title}</p>
      {item ? (
        <button data-spatial onClick={() => onOpen(item)} className="brand-focus mt-3 flex w-full items-center gap-3 rounded-2xl text-left">
          {item.image ? (
            <img src={item.image} alt="" className="h-20 w-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="h-20 w-14 shrink-0 rounded-lg bg-surface-high" />
          )}
          <span className="min-w-0">
            <span className="line-clamp-2 text-body-md font-semibold text-white">{displayTitle(item.name)}</span>
            <span className="text-body-sm text-on-surface-variant">{formatWatchTime(item.seconds)}</span>
          </span>
        </button>
      ) : (
        <p className="font-display mt-3 text-headline-sm text-white">—</p>
      )}
    </div>
  )
}

/** A categoria do provedor com mais tempo de filme e serie ("Ação", "Comédia"...): o mais perto de genero que todo
 * provedor tem (a mesma escolha do "Recomendado pra você"). */
function useFavoriteGenre(items: WatchedItem[]): string | null {
  const movies = useMovieCatalog()
  const series = useSeriesCatalog()
  return useMemo(() => {
    const names = new Map([...movies.categories, ...series.categories].map((c) => [c.categoryId, cleanCategoryName(c.categoryName)]))
    const movieCat = new Map(flattenGroups(movies.groups).map((m) => [m.streamId, m.categoryId]))
    const seriesCat = new Map(flattenGroups(series.groups).map((s) => [s.seriesId, s.categoryId]))
    const time = new Map<string, number>()
    for (const i of items) {
      const cat = i.kind === 'movie' ? movieCat.get(i.id) : i.kind === 'series' ? seriesCat.get(i.id) : undefined
      const name = cat ? names.get(cat) : undefined
      if (name) time.set(name, (time.get(name) ?? 0) + i.seconds)
    }
    return [...time.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }, [items, movies.categories, movies.groups, series.categories, series.groups])
}
