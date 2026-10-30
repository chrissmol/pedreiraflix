import { useEffect, useState, type ReactNode } from 'react'
import { Lock } from './icons'

// Alguns navegadores (TV Samsung/Tizen) nao guardam o cookie do codigo e o app voltava a pedir sem fim: o hash que o
// Worker devolve fica tambem no localStorage e vai em x-grupo nas chamadas a /api (o Worker aceita cookie ou header).
const CHAVE = 'pf_grupo'
function lerToken() {
  try {
    return localStorage.getItem(CHAVE)
  } catch {
    return null
  }
}
const fetchOriginal = window.fetch.bind(window)
window.fetch = (input, init) => {
  const token = lerToken()
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!token || !url.startsWith('/api/')) return fetchOriginal(input, init)
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
  headers.set('x-grupo', token)
  return fetchOriginal(input, { ...init, headers })
}

/** Codigo do grupo (secret GROUP_CODE no Worker): sem ele o proxy recusa o aparelho. Pergunta uma vez; o Worker grava
 * um cookie e o app recarrega para refazer as chamadas que ja tinham sido recusadas. Sem internet, ou num Worker sem
 * o secret, nao aparece. Enquanto pede, o app fica fora da tela: so com o overlay, Tab e as setas da TV chegavam ao login
 * por baixo. */
export default function GroupCodeGate({ children }: { children: ReactNode }) {
  const [needed, setNeeded] = useState(false)
  const [value, setValue] = useState('')
  const [estado, setEstado] = useState<'editando' | 'enviando' | 'errado' | 'erro'>('editando')

  useEffect(() => {
    fetch('/api/grupo')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setNeeded(!!s?.required && !s.ok))
      .catch(() => {})
  }, [])

  if (!needed) return children

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEstado('enviando')
    try {
      const res = await fetch('/api/grupo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ codigo: value }),
      })
      if (res.ok) {
        try {
          localStorage.setItem(CHAVE, (await res.json()).token)
        } catch {
          // sem localStorage fica so o cookie
        }
        location.reload()
      }
      else setEstado(res.status === 403 ? 'errado' : 'erro')
    } catch {
      setEstado('erro')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4">
      <form onSubmit={enviar} className="card-panel w-full max-w-sm p-6 text-center sm:p-8">
        <span style={{ width: 56, height: 56, overflow: 'hidden' }} className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/15 text-brand-400"><Lock className="h-7 w-7" /></span>
        <h1 className="font-display text-headline-sm text-white">Código do grupo</h1>
        <p className="mb-5 mt-2 text-body-sm text-on-surface-variant">O PedreiraFlix é só para o grupo. Digite o código que o Christian passou; é só uma vez neste aparelho.</p>
        <input
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setEstado('editando')
          }}
          aria-label="Código do grupo"
          autoCapitalize="none"
          autoCorrect="off"
          className={`brand-focus h-12 w-full rounded-2xl border bg-surface-container px-4 text-center text-body-lg text-white ${
            estado === 'errado' ? 'border-live/60' : 'border-outline-soft'
          }`}
        />
        {estado === 'errado' && <p role="alert" className="mt-2 text-body-sm text-live">Código errado</p>}
        {estado === 'erro' && <p role="alert" className="mt-2 text-body-sm text-live">Não deu para conferir agora. Tente de novo.</p>}
        <button type="submit" disabled={!value.trim() || estado === 'enviando'} className="btn-primary mt-5 w-full">
          {estado === 'enviando' ? 'Conferindo…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
