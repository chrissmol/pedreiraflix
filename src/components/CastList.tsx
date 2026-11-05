import { useState } from 'react'
import { proxyImage } from '../lib/xtream'
import type { TmdbInfo } from '../lib/tmdb'
import { ChevronDown } from './icons'

type Person = NonNullable<TmdbInfo['cast']>[number]

const SHOWN = 8

// O provedor manda tudo num texto so ("A, B,C"), as vezes com dezenas de nomes: vira lista de nomes sem foto.
const fromText = (text: string | null | undefined): Person[] =>
  [...new Set((text ?? '').split(/[,;/]/).map((n) => n.trim()).filter(Boolean))].map((name) => ({ name, character: null, photo: null }))

function Card({ person }: { person: Person }) {
  const [failed, setFailed] = useState(false)
  const photo = failed ? null : proxyImage(person.photo)
  return (
    <li className="flex min-w-0 items-center gap-3">
      {photo ? (
        <img src={photo} alt="" loading="lazy" onError={() => setFailed(true)} className="h-12 w-12 shrink-0 rounded-full bg-surface-high object-cover" />
      ) : (
        <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-high text-label-md font-semibold text-on-surface-muted">
          {person.name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-body-sm font-semibold text-white">{person.name}</span>
        {person.character && <span className="block truncate text-label-badge text-on-surface-muted">{person.character}</span>}
      </span>
    </li>
  )
}

/** Elenco das paginas de filme e serie: os primeiros em cartoes com foto e personagem, o resto abre sob demanda.
 * Usa o elenco do TMDB; sem ele, os nomes que o provedor mandou. */
export default function CastList({ people, fallback }: { people?: Person[]; fallback?: string | null }) {
  const [open, setOpen] = useState(false)
  const all = people?.length ? people : fromText(fallback)
  if (!all.length) return null
  const rest = all.slice(SHOWN)
  const grid = 'grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4'
  return (
    <section aria-label="Elenco" className="mt-5 max-w-2xl">
      <h2 className="mb-3 text-label-badge uppercase tracking-wider text-on-surface-muted">Elenco</h2>
      <ul className={grid}>
        {all.slice(0, SHOWN).map((p, i) => (
          <Card key={`${p.name}-${i}`} person={p} />
        ))}
      </ul>
      {rest.length > 0 && (
        <>
          {/* grid-rows 0fr -> 1fr anima a altura; invisible (so depois de fechar) e inert tiram os nomes escondidos do foco e do leitor de tela. */}
          <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
            <div className={`overflow-hidden transition-[visibility] duration-0 ${open ? 'visible' : 'invisible delay-300'}`} inert={!open}>
              <ul id="elenco-completo" className={`${grid} pt-3`}>
                {rest.map((p, i) => (
                  <Card key={`${p.name}-${i}`} person={p} />
                ))}
              </ul>
            </div>
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="elenco-completo"
            onClick={() => setOpen((o) => !o)}
            className="mt-1 inline-flex min-h-11 items-center gap-1 text-label-md font-semibold text-white hover:text-brand-400"
          >
            {open ? 'Ver menos' : `Ver elenco completo (${all.length})`}
            <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
          </button>
        </>
      )}
    </section>
  )
}
