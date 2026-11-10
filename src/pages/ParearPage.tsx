import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { lerGrupo } from '../lib/grupo'
import { Tv, User } from '../components/icons'
import { cifrar, formatarCodigo, podeIrParaTv } from '../lib/pareamento'
import { type SavedAccount, useAccountsStore } from '../store/accounts'
import { useAuthStore } from '../store/auth'

const limpar = (raw: string) => raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8)
const rotulo = (a: SavedAccount) => a.label || (a.credentials.type === 'xtream' ? a.credentials.username : 'Playlist M3U')

/** Celular: abre pelo QR da TV (/parear?c=CODIGO) ou pelo menu "Entrar na TV", escolhe a conta e confirma. */
export default function ParearPage() {
  const [params] = useSearchParams()
  const [code, setCode] = useState(limpar(params.get('c') ?? ''))
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const saved = useAccountsStore((s) => s.accounts)
  const active = useAuthStore((s) => s.credentials)
  // Quem entrou sem lembrar a conta tambem pode mandar a que esta aberta agora.
  const accounts = saved.some((a) => active && JSON.stringify(a.credentials) === JSON.stringify(active)) || !active ? saved : [{ id: 'ativa', lastUsedAt: 0, credentials: active }, ...saved]

  async function enviar(account: SavedAccount) {
    if (!podeIrParaTv(account.credentials)) return
    setMsg(null)
    setBusy(account.id)
    try {
      const found = await fetch(`/api/parear?code=${code}`)
      if (found.status === 404) return setMsg({ ok: false, text: 'Código não encontrado ou já expirou. Confira o código na TV.' })
      if (!found.ok) throw new Error()
      const { pub } = (await found.json()) as { pub: string }
      const sealed = await cifrar(pub, { v: 1, creds: account.credentials, label: account.label, grupo: lerGrupo() ?? undefined })
      const res = await fetch('/api/parear/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, ...sealed }) })
      if (res.status === 404) return setMsg({ ok: false, text: 'Este código já foi usado ou expirou. Gere outro na TV.' })
      if (!res.ok) throw new Error()
      setMsg({ ok: true, text: 'Pronto! A TV entra na conta em instantes.' })
    } catch {
      setMsg({ ok: false, text: 'Não deu para falar com a TV agora. Tente de novo.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="flex h-full flex-col items-center overflow-y-auto bg-surface px-4 pb-8 pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <div className="card-panel w-full max-w-md p-6 text-center">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
          <Tv className="h-7 w-7" />
        </span>
        <h1 className="font-display text-headline-sm text-white">Entrar na TV</h1>
        <p className="mb-5 mt-2 text-body-sm text-on-surface-variant">Digite o código que aparece na TV e escolha a conta que ela vai usar. Nada de digitar usuário e senha no controle.</p>
        <input
          value={code.length > 4 ? formatarCodigo(code) : code}
          onChange={(e) => {
            setCode(limpar(e.target.value))
            setMsg(null)
          }}
          aria-label="Código da TV"
          placeholder="XXXX-XXXX"
          autoCapitalize="characters"
          autoCorrect="off"
          className="brand-focus h-12 w-full rounded-2xl border border-outline-soft bg-surface-container px-4 text-center font-mono text-body-lg tracking-widest text-white"
        />
        <div className="mt-5 space-y-2 text-left">
          {accounts.length === 0 && (
            <p className="text-center text-body-sm text-on-surface-variant">
              Nenhuma conta neste aparelho. <Link to="/login" className="text-brand-400 underline">Entre primeiro</Link> e volte aqui.
            </p>
          )}
          {accounts.map((a) => (
            <button
              key={a.id}
              disabled={code.length !== 8 || busy !== null || !podeIrParaTv(a.credentials)}
              onClick={() => void enviar(a)}
              className="flex w-full items-center gap-3 rounded-2xl border border-outline-soft bg-surface-container px-4 py-3 text-left disabled:opacity-50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-fill text-white"><User className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-label-md text-white">{rotulo(a)}</span>
                <span className="block text-body-sm text-on-surface-variant">{podeIrParaTv(a.credentials) ? (busy === a.id ? 'Enviando…' : 'Enviar para a TV') : 'Playlist de arquivo não vai para a TV'}</span>
              </span>
            </button>
          ))}
        </div>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-4 text-body-sm ${msg.ok ? 'text-brand-400' : 'text-live'}`}>{msg.text}</p>}
      </div>
    </main>
  )
}
