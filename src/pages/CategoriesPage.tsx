import { useEffect, useMemo, useState } from 'react'
import ErrorCard from '../components/ErrorCard'
import { ChevronDown, ChevronUp, Eye, EyeOff } from '../components/icons'
import { friendlyCatalogError } from '../hooks/useCatalog'
import { useXtream } from '../hooks/useXtream'
import { cached } from '../lib/cache'
import { arrangeCategories } from '../lib/categoryPrefs'
import { isAdultCategoryName } from '../lib/parentalControl'
import { matchesQuery } from '../lib/search'
import { useActiveAccountId, useActiveProfile, useProfilesStore } from '../store/profiles'
import type { Category } from '../types'

const KINDS = [
  { kind: 'live', label: 'Canais' },
  { kind: 'movie', label: 'Filmes' },
  { kind: 'series', label: 'Séries' },
] as const
type Kind = (typeof KINDS)[number]['kind']

/** Organizar categorias (menu da conta): cada perfil esconde e reordena as categorias de Canais, Filmes e Series,
 * como o "Manage groups" do TiviMate. Subir/Descer em botoes, e nao arrastar, para funcionar com as setas da TV. */
export default function CategoriesPage() {
  const client = useXtream()
  const accId = useActiveAccountId()
  const profile = useActiveProfile()
  const setCategoryPrefs = useProfilesStore((s) => s.setCategoryPrefs)
  const [kind, setKind] = useState<Kind>('live')
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!client) return
    let cancelled = false
    // oxlint-disable-next-line react/set-state-in-effect -- trocar de aba comeca um carregamento novo.
    setCategories(null)
    setError(null)
    const loaders = { live: () => client.getLiveCategories(), movie: () => client.getVodCategories(), series: () => client.getSeriesCategories() }
    cached(`${kind}:categories`, loaders[kind])
      .then((list) => !cancelled && setCategories(list))
      .catch((err) => !cancelled && setError(friendlyCatalogError(err)))
    return () => {
      cancelled = true
    }
  }, [client, kind])

  const hidden = useMemo(() => profile?.hiddenCategories ?? [], [profile?.hiddenCategories])
  const order = useMemo(() => profile?.categoryOrder ?? [], [profile?.categoryOrder])
  // Todas, inclusive as escondidas, na ordem do perfil. Perfil infantil nem ve as adultas aqui.
  const arranged = useMemo(() => {
    const allowed = (categories ?? []).filter((c) => !profile?.isKids || !isAdultCategoryName(c.categoryName))
    return arrangeCategories(kind, allowed, [], order)
  }, [categories, profile?.isKids, kind, order])
  const shown = query.trim() ? arranged.filter((c) => matchesQuery(c.categoryName, query)) : arranged

  if (!accId || !profile) return null
  const keyOf = (c: Category) => `${kind}:${c.categoryId}`
  const save = (prefs: { hiddenCategories?: string[]; categoryOrder?: string[] }) => setCategoryPrefs(accId, profile.id, prefs)

  function toggle(c: Category) {
    const key = keyOf(c)
    save({ hiddenCategories: hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key] })
  }

  function move(c: Category, step: -1 | 1) {
    const keys = arranged.map(keyOf)
    const from = keys.indexOf(keyOf(c))
    const to = from + step
    if (to < 0 || to >= keys.length) return
    ;[keys[from], keys[to]] = [keys[to], keys[from]]
    // A ordem dos outros tipos fica como estava; so a deste tipo e reescrita inteira.
    save({ categoryOrder: [...order.filter((k) => !k.startsWith(`${kind}:`)), ...keys] })
    // O React move o item na lista; devolver o foco ao mesmo botao deixa apertar Subir varias vezes (setas da TV).
    // Na ponta esse botao fica desativado, entao o foco vai para o outro.
    const atEdge = to === 0 || to === keys.length - 1
    const id = `cat-${(step < 0) !== atEdge ? 'up' : 'down'}-${c.categoryId}`
    requestAnimationFrame(() => document.getElementById(id)?.focus())
  }

  function reset() {
    const prefix = `${kind}:`
    save({ hiddenCategories: hidden.filter((k) => !k.startsWith(prefix)), categoryOrder: order.filter((k) => !k.startsWith(prefix)) })
  }

  return (
    <div className="min-h-screen px-4 pb-16 pt-[calc(6rem+env(safe-area-inset-top))] sm:px-10">
      <h1 className="font-display text-headline-md text-white sm:text-headline-lg">Organizar categorias</h1>
      <p className="mt-2 max-w-2xl text-body-md text-on-surface-variant">
        Esconda o que {profile.name} não assiste e suba o que mais usa. Vale só para este perfil.
      </p>

      <div className="mt-6 flex flex-wrap gap-2" role="tablist">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            role="tab"
            aria-selected={kind === k.kind}
            onClick={() => {
              setKind(k.kind)
              setQuery('')
            }}
            className={kind === k.kind ? 'btn-primary' : 'btn-secondary'}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex max-w-2xl flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Procurar categoria"
          aria-label="Procurar categoria"
          className="brand-focus h-11 min-w-0 flex-1 rounded-full border border-outline-soft bg-surface-container px-4 text-body-md text-white placeholder-on-surface-muted transition-colors focus:border-brand-500/60"
        />
        <button onClick={reset} className="btn-secondary">
          Restaurar padrão
        </button>
      </div>

      {error && (
        <ErrorCard message={error} className="mt-6 max-w-2xl" />
      )}
      {!categories && !error && <p className="mt-6 text-body-md text-on-surface-variant">Carregando categorias…</p>}

      <ul className="mt-4 max-w-2xl divide-y divide-outline-soft">
        {shown.map((c) => {
          const isHidden = hidden.includes(keyOf(c))
          const index = arranged.indexOf(c)
          return (
            <li key={c.categoryId} className="flex items-center gap-2 py-2">
              <span className={`min-w-0 flex-1 truncate text-body-md ${isHidden ? 'text-on-surface-variant line-through' : 'text-white'}`}>
                {c.categoryName}
              </span>
              <button
                onClick={() => toggle(c)}
                aria-pressed={!isHidden}
                aria-label={`${isHidden ? 'Mostrar' : 'Esconder'} ${c.categoryName}`}
                title={isHidden ? 'Mostrar' : 'Esconder'}
                className="btn-icon"
              >
                {isHidden ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
              <button
                id={`cat-up-${c.categoryId}`}
                onClick={() => move(c, -1)}
                disabled={index === 0}
                aria-label={`Subir ${c.categoryName}`}
                title="Subir"
                className="btn-icon disabled:opacity-30"
              >
                <ChevronUp className="h-5 w-5" />
              </button>
              <button
                id={`cat-down-${c.categoryId}`}
                onClick={() => move(c, 1)}
                disabled={index === arranged.length - 1}
                aria-label={`Descer ${c.categoryName}`}
                title="Descer"
                className="btn-icon disabled:opacity-30"
              >
                <ChevronDown className="h-5 w-5" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
