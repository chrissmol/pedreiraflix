import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Início' },
  { to: '/live', label: 'Canais' },
  { to: '/movies', label: 'Filmes' },
  { to: '/series', label: 'Séries' },
]

export default function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-around border-t border-zinc-800 bg-zinc-950/95 py-2 sm:hidden">
      {links.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          end={l.to === '/'}
          className={({ isActive }) =>
            `px-3 py-1 text-xs font-medium ${isActive ? 'text-white' : 'text-zinc-500'}`
          }
        >
          {l.label}
        </NavLink>
      ))}
    </nav>
  )
}
