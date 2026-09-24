import type { ComponentType } from 'react'
import { NavLink } from 'react-router-dom'
import { Film, Home, Layers, Tv } from './icons'

const links: { to: string; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { to: '/', label: 'Início', Icon: Home },
  { to: '/live', label: 'Canais', Icon: Tv },
  { to: '/movies', label: 'Filmes', Icon: Film },
  { to: '/series', label: 'Séries', Icon: Layers },
]

export default function MobileNav() {
  return (
    <nav className="glass-panel fixed inset-x-0 bottom-0 z-50 flex justify-around border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] sm:hidden">
      {links.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:bg-white/5 ${
              isActive ? 'text-brand-300' : 'text-zinc-500'
            }`
          }
        >
          <Icon className="h-6 w-6" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
