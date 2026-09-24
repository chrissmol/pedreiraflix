import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { Search } from './icons'

const links = [
  { to: '/', label: 'Início' },
  { to: '/live', label: 'Canais' },
  { to: '/movies', label: 'Filmes' },
  { to: '/series', label: 'Séries' },
]

export default function TopNav() {
  const [scrolled, setScrolled] = useState(false)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)

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
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 flex items-center gap-6 border-0 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] transition-all duration-300 sm:px-10 ${
        scrolled
          ? 'glass-panel shadow-[0_8px_30px_-12px_rgba(15,123,255,0.35)]'
          : 'bg-transparent'
      }`}
    >
      <span className="neon-text font-display bg-gradient-to-br from-brand-200 via-brand-400 to-brand-600 bg-clip-text text-xl font-extrabold tracking-tight text-transparent sm:text-2xl">
        PedreiraFlix
      </span>

      <nav className="hidden gap-1 text-sm font-medium text-zinc-400 sm:flex">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) =>
              `rounded-md px-3 py-1.5 transition-colors ${
                isActive ? 'bg-brand-500/12 text-white' : 'hover:text-white'
              }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>

      <form onSubmit={handleSearch} className="group ml-auto flex items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-brand-400" />
          <input
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar..."
            className="brand-focus w-32 rounded-full border border-zinc-800 bg-zinc-900/70 py-1.5 pl-8 pr-3 text-sm text-white transition-all duration-300 placeholder:text-zinc-500 focus:w-56 focus:border-brand-500/60 sm:w-44 sm:focus:w-64"
          />
        </div>
      </form>

      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Conta"
          className="glow-border flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-bold text-white transition-transform hover:scale-105"
        >
          {user?.username?.[0]?.toUpperCase() ?? '?'}
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-2 w-48 rounded-xl border border-zinc-800 bg-zinc-900/95 p-2 text-sm shadow-2xl backdrop-blur-xl">
            <p className="truncate px-2 py-1.5 text-zinc-400">{user?.username}</p>
            <button
              onClick={logout}
              className="mt-1 w-full rounded-lg px-2 py-2.5 text-left text-rose-400 transition-colors hover:bg-rose-500/10 active:bg-rose-500/10"
            >
              Sair
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
