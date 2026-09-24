import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { XtreamClient } from '../lib/xtream'
import { useAuthStore } from '../store/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  const [baseUrl, setBaseUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const normalizedUrl = baseUrl.trim().replace(/\/+$/, '')
      const client = new XtreamClient({ baseUrl: normalizedUrl, username: username.trim(), password })
      const { user, server } = await client.login()

      const expiredByDate = user.expDate && Number(user.expDate) > 0 && Number(user.expDate) * 1000 < Date.now()
      const warning =
        user.status !== 'Active' || expiredByDate
          ? `Conta com status "${user.status}"${expiredByDate ? ' e assinatura vencida' : ''}. O conteúdo pode não carregar corretamente.`
          : null

      setSession({ baseUrl: normalizedUrl, username: username.trim(), password }, user, server, warning)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao conectar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#06070c] px-4">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[32rem] w-[32rem] animate-[pulse_9s_ease-in-out_infinite] rounded-full bg-brand-600/25 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] animate-[pulse_11s_ease-in-out_infinite] rounded-full bg-brand-400/20 blur-[110px]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />

      <form
        onSubmit={handleSubmit}
        className="glass-panel glow-border relative z-10 w-full max-w-md rounded-2xl p-8 shadow-2xl"
      >
        <h1 className="font-display neon-text mb-1 bg-gradient-to-br from-brand-200 via-brand-400 to-brand-600 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
          PedreiraFlix
        </h1>
        <p className="mb-7 text-sm text-zinc-400">Entre com os dados do seu servidor IPTV</p>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Endereço do servidor
            </label>
            <input
              type="text"
              required
              placeholder="http://seuservidor.com:8080"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="brand-focus w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 transition-colors focus:border-brand-500/60"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Usuário
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="brand-focus w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 transition-colors focus:border-brand-500/60"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="brand-focus w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 transition-colors focus:border-brand-500/60"
            />
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-500/20 bg-rose-950/40 px-3.5 py-2.5 text-sm text-rose-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="glow-border-strong mt-7 w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-3 text-sm font-bold tracking-wide text-white transition-all duration-200 hover:brightness-110 hover:saturate-150 disabled:opacity-50 disabled:hover:brightness-100"
        >
          {loading ? 'Conectando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
