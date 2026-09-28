import type { ComponentType } from 'react'
import { NavLink } from 'react-router-dom'
import { Film, Home, Layers, Tv } from './icons'

const links: { to: string; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { to: '/', label: 'Início', Icon: Home },
  { to: '/live', label: 'Canais', Icon: Tv },
  { to: '/movies', label: 'Filmes', Icon: Film },
  { to: '/series', label: 'Séries', Icon: Layers },
]

// Floating pill (Netflix-style) instead of an edge-to-edge bar pinned with `bottom-0`. Christian hit the
// same bug in a previous project: a bar glued to the physical screen edge is exactly what iOS/Android PWA
// chrome (home-indicator area, on-screen keyboard, browser UI showing/hiding) tends to misplace or clip.
// Floating it — inset from every edge, its own rounded shape — takes it out of that edge case entirely.
export default function MobileNav() {
  return (
    <nav
      className="glass-panel glow-border fixed inset-x-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 flex justify-around rounded-full p-1.5 sm:hidden"
    >
      {links.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-2 text-[10px] font-medium transition-colors ${
              isActive ? 'bg-white/10 text-white' : 'text-zinc-500 active:bg-white/5'
            }`
          }
        >
          <Icon className="h-5 w-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
