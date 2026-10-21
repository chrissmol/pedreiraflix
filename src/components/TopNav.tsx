import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useDialogA11y } from '../hooks/useDialogA11y'
import { clearAllCaches } from '../lib/cache'
import { connectionStatus, refreshSession } from '../lib/session'
import { useAuthStore } from '../store/auth'
import { type Profile, useActiveAccountId, useActiveProfile, useActiveProfileId, useProfiles, useProfilesStore } from '../store/profiles'
import ConfirmDialog from './ConfirmDialog'
import { Download, Info, Plus, RefreshCw, Search, Settings, User, X } from './icons'
import LoadingRing from './LoadingRing'
import PinPrompt from './PinPrompt'
import SearchSuggestions from './SearchSuggestions'
import { isTv } from '../lib/device'
import { loadRecentSearches, saveRecentSearch } from '../lib/search'
import { installApp, useInstallPrompt } from '../lib/installPrompt'

const links = [
  { to: '/', label: 'Início' },
  { to: '/live', label: 'Canais' },
  { to: '/movies', label: 'Filmes' },
  { to: '/series', label: 'Séries' },
  { to: '/times', label: 'Times' },
]

export default function TopNav() {
  const [query, setQuery] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuPanelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLFormElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)
  const isXtream = useAuthStore((s) => s.credentials?.type === 'xtream')
  const connections = isXtream ? connectionStatus(user) : null
  const accId = useActiveAccountId()
  const activeProfile = useActiveProfile()
  const profiles = useProfiles()
  const setActiveProfile = useProfilesStore((s) => s.setActiveProfile)
  const [pinTarget, setPinTarget] = useState<Profile | null>(null)
  const [confirmClearCache, setConfirmClearCache] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)
  const canInstall = useInstallPrompt((s) => s.event !== null)
  const profileId = useActiveProfileId()
  const [recent, setRecent] = useState<string[]>([])

  // Na pagina de busca o campo mostra o que esta sendo buscado (voltar, recarregar ou abrir um link /search?q=...).
  const urlQuery = location.pathname === '/search' ? new URLSearchParams(location.search).get('q') ?? '' : null
  const [syncedUrlQuery, setSyncedUrlQuery] = useState<string | null | undefined>(undefined)
  if (urlQuery !== syncedUrlQuery) {
    setSyncedUrlQuery(urlQuery)
    if (urlQuery !== null) setQuery(urlQuery)
  }

  function switchTo(p: Profile) {
    if (p.pin) {
      setPinTarget(p)
      setMenuOpen(false)
      return
    }
    if (accId) setActiveProfile(accId, p.id)
    setMenuOpen(false)
  }

  useDialogA11y(menuPanelRef, menuOpen, () => setMenuOpen(false))

  // O numero de telas muda toda hora (outro aparelho liga ou desliga), entao abre o menu e atualiza.
  useEffect(() => {
    if (menuOpen) refreshSession(20_000)
  }, [menuOpen])

  // Tap outside closes the account menu (there is no hover on touch screens).
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  useEffect(() => {
    if (!suggestionsOpen) return
    const close = (e: PointerEvent) => {
      if (!searchRef.current?.contains(e.target as Node)) setSuggestionsOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [suggestionsOpen])

  function openSuggestions() {
    setRecent(loadRecentSearches(profileId))
    setSuggestionsOpen(true)
  }

  function searchFor(raw: string) {
    const q = raw.trim()
    if (!q) return
    saveRecentSearch(profileId, q)
    setQuery(q)
    setSuggestionsOpen(false)
    searchInputRef.current?.blur()
    navigate(`/search?q=${encodeURIComponent(q)}`, { replace: location.pathname === '/search' })
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    searchFor(query)
  }

  // Setas percorrem as sugestoes e Esc fecha a lista (no computador; a TV usa a pagina de busca).
  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault() // o Chrome apagaria o texto de um campo type=search; o Esc so fecha a lista
      setSuggestionsOpen(false)
      searchInputRef.current?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = Array.from(searchRef.current?.querySelectorAll<HTMLElement>('[data-suggestion]') ?? [])
    if (items.length === 0) return
    e.preventDefault()
    const next = items.indexOf(document.activeElement as HTMLElement) + (e.key === 'ArrowDown' ? 1 : -1)
    if (next < 0) searchInputRef.current?.focus()
    else items[Math.min(next, items.length - 1)].focus()
  }

  return (
    <header
      // `max(0.75rem, env(...))` was an earlier approach, but iOS Safari has a known history of not
      // recalculating `env()` inside `max()`/`min()` reliably — it can get stuck at the plain 0.75rem
      // fallback and never pick up the real notch/Dynamic Island inset, leaving the header's own content
      // (search box, account avatar) rendered right under the status bar. Plain addition avoids that.
      //
      // `absolute`, not `fixed`: iOS has a separate, still-open WebKit bug where `position: fixed`
      // combined with `dvh`/viewport units in a home-screen-installed (`display: standalone`) PWA can be
      // positioned against a taller-than-real viewport height, landing noticeably above where it should
      // — which is exactly the bug Christian hit here. `Layout.tsx`'s shell is already sized correctly to
      // the real screen via `h-dvh` and is `position: relative`, so anchoring against that shell with
      // `absolute` sidesteps the whole fixed-vs-viewport-unit computation this bug lives in — it only
      // needs ordinary box layout, which iOS gets right.
      //
      // Largura inteira de proposito, sem as margens laterais da Dynamic Island: em paisagem a ilha fica no
      // meio da altura da tela, nunca na altura do cabecalho, e com as margens o conteudo do cabecalho nao
      // cabia e empurrava o avatar para fora da tela (video de 08/10, depois do #77).
      //
      // Sombra fixa de cima para baixo, sempre igual: antes o fundo alternava entre transparente e uma faixa de
      // vidro escura conforme a rolagem passava de 10px, com transicao de 300ms — sobre um destaque claro isso
      // piscava (video do Christian, 08/10). A sombra deixa o logo e a busca legiveis sobre qualquer imagem.
      //
      // TV: vira um menu lateral fixo (como Netflix e YouTube na TV). Libera a largura que o cabecalho comia, entao
      // as letras podem crescer (index.css), e o controle chega no menu com a seta para a esquerda.
      className={
        isTv
          ? 'absolute inset-y-0 left-0 z-50 flex w-40 flex-col gap-5 border-r border-outline-soft bg-surface-low/95 px-3 py-6'
          : 'absolute inset-x-0 top-0 z-50 flex items-center gap-3 border-0 bg-gradient-to-b from-black/80 via-black/50 to-transparent px-4 pb-6 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:gap-6 sm:px-10'
      }
    >
      <span className="neon-text font-display bg-gradient-to-br from-brand-200 via-brand-400 to-brand-600 bg-clip-text text-xl font-extrabold tracking-tight text-transparent sm:text-2xl">
        PedreiraFlix
      </span>

      {/* Abas no topo so de md (768px) para cima, e a busca larga so de lg (1024px): entre 640 e ~830px o cabecalho
          "de computador" nao cabia e empurrava a busca e o avatar para fora da tela (painel de 654px, 08/10). Abaixo
          de md fica o menu flutuante de baixo (MobileNav), como no celular. */}
      <nav
        className={
          isTv
            ? 'flex flex-col gap-1 text-label-md text-on-surface-variant'
            : 'hidden items-center gap-1 rounded-full border border-outline-soft bg-surface-low/70 p-1 text-label-md text-on-surface-variant backdrop-blur-md md:flex'
        }
      >
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) =>
              `rounded-full px-4 py-1.5 transition-colors ${
                isActive ? 'bg-surface-high text-white shadow-[0_0_24px_-2px_rgba(15,123,255,0.35)]' : 'hover:text-white'
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className={isTv ? 'flex items-center gap-2' : 'ml-auto flex items-center gap-3'}>
      <LoadingRing />
      {/* Celular, tablet e TV: a lupa leva para a pagina de busca, que tem o campo grande com X (o campo do cabecalho no
          celular era um circulo de 40px que abria so 112px). No computador fica o campo com sugestoes. */}
      {isTv ? (
        <NavLink
          to="/search"
          className={({ isActive }) =>
            `flex min-w-0 flex-1 items-center gap-2 rounded-full px-4 py-1.5 text-label-md transition-colors ${isActive ? 'bg-surface-high text-white' : 'text-on-surface-variant hover:text-white'}`
          }
        >
          <Search className="h-4 w-4" /> Buscar
        </NavLink>
      ) : (
        <Link
          to="/search"
          aria-label="Buscar"
          className="brand-focus flex h-10 w-10 items-center justify-center rounded-full border border-outline-soft bg-surface-container text-on-surface-muted lg:hidden"
        >
          <Search className="h-4 w-4" />
        </Link>
      )}
      {!isTv && (
      <form ref={searchRef} role="search" onSubmit={handleSearch} onKeyDown={handleSearchKeyDown} className="group relative hidden items-center lg:flex">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-muted transition-colors group-focus-within:text-brand-400" />
          <input
            ref={searchInputRef}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (!suggestionsOpen) openSuggestions()
            }}
            onFocus={openSuggestions}
            placeholder="Buscar…"
            aria-label="Buscar"
            className="brand-focus h-10 w-44 appearance-none rounded-full border border-outline-soft bg-surface-container pl-8 pr-8 text-body-md text-white transition-[width,border-color] duration-300 placeholder:text-on-surface-muted focus:w-64 focus:border-brand-500/60"
          />
          {query && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => {
                setQuery('')
                searchInputRef.current?.focus()
              }}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-muted hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {suggestionsOpen && (
          <SearchSuggestions
            query={query.trim()}
            recent={recent}
            onNavigate={() => {
              saveRecentSearch(profileId, query)
              setSuggestionsOpen(false)
            }}
            onSearch={searchFor}
          />
        )}
      </form>
      )}
      </div>

      <div ref={menuRef} className={isTv ? 'relative mt-auto' : 'relative'}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Conta"
          style={activeProfile && !isTv ? { background: activeProfile.color } : undefined}
          className={
            isTv
              ? 'flex w-full items-center gap-2 rounded-full p-1 pr-3 text-label-md text-on-surface-variant'
              : 'flex h-10 w-10 items-center justify-center rounded-full bg-brand-fill text-label-md font-bold text-white shadow-[0_0_20px_-4px_rgba(15,123,255,0.6)] transition-transform hover:scale-105'
          }
        >
          {/* TV: a inicial sozinha no pe do menu parecia um "X" de fechar (video do Christian, 19/10); com o nome vira o perfil. */}
          {isTv ? (
            <>
              <span
                style={activeProfile ? { background: activeProfile.color } : undefined}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-fill font-bold text-white"
              >
                {(activeProfile?.name || user?.username)?.[0]?.toUpperCase() ?? '?'}
              </span>
              <span className="truncate">{activeProfile?.name || user?.username}</span>
            </>
          ) : (
            (activeProfile?.name || user?.username)?.[0]?.toUpperCase() ?? '?'
          )}
        </button>
        {menuOpen && (
          <div
            ref={menuPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu da conta"
            className={isTv ? 'menu-panel absolute bottom-full left-0 mb-2 w-64' : 'menu-panel absolute right-0 mt-2 w-64'}
          >
            <p className="truncate px-3 py-2 text-body-sm text-on-surface-variant">
              {activeProfile?.name} <span className="text-on-surface-variant">· {user?.username}</span>
            </p>
            {connections && (
              // "Telas" e quantas pessoas/aparelhos o provedor deixa tocar ao mesmo tempo com este login. Quando
              // enche, o provedor recusa o video (403) — o numero explica isso antes de o filme falhar.
              <div
                data-testid="conexoes"
                className={`mx-1.5 mb-1 rounded-xl px-3 py-2 text-body-sm ${connections.full ? 'bg-live/10 text-red-200' : 'bg-surface-container text-on-surface-variant'}`}
              >
                <p className="flex items-center gap-2 text-label-md text-white">
                  <span className={`h-2 w-2 rounded-full ${connections.full ? 'bg-live' : 'bg-done'}`} />
                  Telas em uso: {connections.active} de {connections.max}
                </p>
                <p className="mt-0.5">
                  {connections.full
                    ? 'Limite cheio: o provedor vai recusar novos vídeos. Feche em outro aparelho ou espere uns minutos.'
                    : 'Inclui este aparelho se estiver tocando.'}
                </p>
              </div>
            )}
            {profiles.length > 1 && (
              <div className="my-1 space-y-0.5">
                {profiles
                  .filter((p) => p.id !== activeProfile?.id)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => switchTo(p)}
                      className="menu-option"
                    >
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-label-badge font-bold text-white"
                        style={{ background: p.color }}
                      >
                        {p.name[0]?.toUpperCase()}
                      </span>
                      <span className="truncate">Entrar como {p.name}</span>
                    </button>
                  ))}
              </div>
            )}
            <button
              onClick={() => {
                setMenuOpen(false)
                navigate('/profiles')
              }}
              className="menu-option"
            >
              <User className="h-4 w-4 text-on-surface-variant" /> Gerenciar perfis
            </button>
            {!isTv && (
              <button
                onClick={() => {
                  setMenuOpen(false)
                  navigate('/downloads')
                }}
                className="menu-option"
              >
                <Download className="h-4 w-4 text-on-surface-variant" /> Downloads
              </button>
            )}
            {canInstall && (
              <button
                onClick={() => {
                  setMenuOpen(false)
                  void installApp()
                }}
                className="menu-option"
              >
                <Plus className="h-4 w-4 text-on-surface-variant" /> Instalar o app
              </button>
            )}
            {/* TV: cache e diagnostico ficam dentro de Ajustes, longe de um OK por engano (video do Christian, 19/10). */}
            {!isTv && (
              <button
                onClick={() => {
                  setMenuOpen(false)
                  setConfirmClearCache(true)
                }}
                className="menu-option"
              >
                <RefreshCw className="h-4 w-4 text-on-surface-variant" /> Limpar cache
              </button>
            )}
            <button
              onClick={() => {
                setMenuOpen(false)
                navigate('/diagnostico')
              }}
              className="menu-option"
            >
              <Settings className="h-4 w-4 text-on-surface-variant" /> {isTv ? 'Ajustes' : 'Diagnóstico'}
            </button>
            <button
              onClick={() => {
                setMenuOpen(false)
                navigate('/suporte', { state: { from: location.pathname + location.search } })
              }}
              className="menu-option"
            >
              <Info className="h-4 w-4 text-on-surface-variant" /> Suporte
            </button>
            <button
              onClick={logout}
              className="menu-option mt-1 text-live hover:bg-live/10 active:bg-live/10"
            >
              Sair
            </button>
          </div>
        )}
      </div>

      {pinTarget && (
        <PinPrompt
          profile={pinTarget}
          onCancel={() => setPinTarget(null)}
          onSuccess={() => {
            if (accId) setActiveProfile(accId, pinTarget.id)
            setPinTarget(null)
          }}
        />
      )}

      {confirmClearCache && (
        <ConfirmDialog
          message={
            clearingCache
              ? 'Limpando…'
              : 'Limpar o catálogo salvo e o cache do app? Não apaga login, perfis, favoritos nem downloads — só o que pode ser rebaixado de novo do provedor. O app recarrega em seguida.'
          }
          confirmLabel="Limpar"
          onCancel={() => setConfirmClearCache(false)}
          onConfirm={async () => {
            setClearingCache(true)
            await clearAllCaches()
            window.location.reload()
          }}
        />
      )}
    </header>
  )
}
