import { type FormEvent, useState } from 'react'
import { joinRoom, leaveRoom, newCode, normalizeCode, useJunto } from '../lib/junto'

/** Criar ou entrar numa sala do "Assistir junto". Quem cria passa o codigo; quem entra digita e passa a ver o mesmo
 * titulo, no mesmo ponto, com play e pausa valendo para todos. */
export default function JuntoPage() {
  const code = useJunto((s) => s.code)
  const people = useJunto((s) => s.people)
  const connected = useJunto((s) => s.connected)
  const [typed, setTyped] = useState('')

  function enter(e: FormEvent) {
    e.preventDefault()
    const c = normalizeCode(typed)
    if (c.length === 6) joinRoom(c)
  }

  return (
    <div className="mx-auto min-h-screen max-w-xl px-4 pb-16 pt-[calc(6rem+env(safe-area-inset-top))] sm:px-10">
      <h1 className="font-display text-headline-md text-white sm:text-headline-lg">Assistir junto</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Duas ou mais pessoas, cada uma no seu aparelho, vendo o mesmo filme ou série ao mesmo tempo. Play, pausa e avançar
        valem para todo mundo. Funciona entre quem usa o mesmo provedor.
      </p>

      {code ? (
        <section className="mt-8 rounded-3xl border border-outline-soft bg-surface-low p-6 text-center">
          <p className="text-label-md uppercase tracking-wider text-on-surface-muted">Código da sala</p>
          <p data-testid="junto-codigo" className="font-display mt-2 text-display-hero tracking-[0.2em] text-white">
            {code}
          </p>
          <p className="mt-2 text-body-md text-on-surface-variant">
            {!connected ? 'Conectando…' : people <= 1 ? 'Esperando alguém entrar com este código.' : `${people} pessoas na sala.`}
          </p>
          <p className="mt-4 text-body-sm text-on-surface-variant">
            Abra um filme ou episódio e dê o play: quem estiver na sala vai junto. Para entrar, a outra pessoa abre o menu
            da conta, toca em Assistir junto e digita o código.
          </p>
          <button onClick={leaveRoom} className="btn-secondary mt-6">
            Sair da sala
          </button>
        </section>
      ) : (
        <>
          <button onClick={() => joinRoom(newCode())} className="btn-primary mt-8 w-full justify-center">
            Criar uma sala
          </button>
          <form onSubmit={enter} className="mt-8 rounded-3xl border border-outline-soft bg-surface-low p-6">
            <label htmlFor="junto-codigo" className="text-label-md text-white">
              Entrar com um código
            </label>
            <div className="mt-3 flex gap-2">
              <input
                id="junto-codigo"
                value={typed}
                onChange={(e) => setTyped(normalizeCode(e.target.value))}
                placeholder="ABC123"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="brand-focus h-12 min-w-0 flex-1 rounded-full border border-outline-soft bg-surface-container px-5 text-center font-display text-headline-sm uppercase tracking-[0.2em] text-white placeholder:text-on-surface-muted"
              />
              <button type="submit" disabled={normalizeCode(typed).length !== 6} className="btn-primary h-12">
                Entrar
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
