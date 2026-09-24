import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Trash, User } from '../components/icons'
import { signIn } from '../lib/session'
import { type SavedAccount, useAccountsStore } from '../store/accounts'
import { useAuthStore } from '../store/auth'

const inputClass =
  'brand-focus w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 transition-colors focus:border-brand-500/60'

function hostLabel(baseUrl: string): string {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl
  }
}

export default function LoginPage() {
  const navigate = useNavigate()
  const hasSession = useAuthStore((s) => Boolean(s.credentials))
  const accounts = useAccountsStore((s) => s.accounts)
  const removeAccount = useAccountsStore((s) => s.removeAccount)
  const last = accounts[0]
  // Prefilled with the last account, so even the "type it again" path is just one tap on Entrar.
  const [baseUrl, setBaseUrl] = useState(last?.baseUrl ?? '')
  const [username, setUsername] = useState(last?.username ?? '')
  const [password, setPassword] = useState(last?.password ?? '')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [showForm, setShowForm] = useState(accounts.length === 0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (hasSession && !busyId) return <Navigate to="/" replace />

  async function run(id: string, action: () => Promise<void>) {
    setError(null)
    setBusyId(id)
    try {
      await action()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao conectar')
      setBusyId(null)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    run('form', () => signIn({ baseUrl, username, password }, remember))
  }

  function enterSaved(account: SavedAccount) {
    run(account.id, () => signIn(account))
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#06070c] px-4 py-10">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[32rem] w-[32rem] animate-[pulse_9s_ease-in-out_infinite] rounded-full bg-brand-600/25 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] animate-[pulse_11s_ease-in-out_infinite] rounded-full bg-brand-400/20 blur-[110px]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />

      <div className="glass-panel glow-border relative z-10 w-full max-w-md rounded-2xl p-6 shadow-2xl sm:p-8">
        <h1 className="font-display neon-text mb-1 bg-gradient-to-br from-brand-200 via-brand-400 to-brand-600 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
          PedreiraFlix
        </h1>
        <p className="mb-6 text-sm text-zinc-400">
          {accounts.length > 0 && !showForm ? 'Escolha uma conta salva' : 'Entre com os dados do seu servidor IPTV'}
        </p>

        {accounts.length > 0 && !showForm && (
          <div className="space-y-2" data-testid="saved-accounts">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-stretch gap-2">
                <button
                  onClick={() => enterSaved(account)}
                  disabled={busyId !== null}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-3 text-left transition-colors hover:border-brand-500/50 hover:bg-zinc-800 active:bg-zinc-800 disabled:opacity-60"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white">
                    <User className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-white">{account.username}</span>
                    <span className="block truncate text-xs text-zinc-500">{hostLabel(account.baseUrl)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-brand-300">
                    {busyId === account.id ? 'Conectando...' : 'Entrar'}
                  </span>
                </button>
                <button
                  onClick={() => removeAccount(account.id)}
                  aria-label={`Esquecer conta ${account.username}`}
                  title="Esquecer esta conta"
                  className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 text-zinc-500 transition-colors hover:border-rose-500/40 hover:text-rose-400"
                >
                  <Trash className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                setBaseUrl('')
                setUsername('')
                setPassword('')
                setShowForm(true)
              }}
              className="mt-2 w-full rounded-xl border border-dashed border-zinc-700 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-brand-500/50 hover:text-white"
            >
              + Usar outra conta
            </button>
          </div>
        )}

        {showForm && (
          // Real name/autocomplete attributes let the browser's password manager offer to save and autofill these.
          <form onSubmit={handleSubmit} autoComplete="on">
            <div className="space-y-4">
              <div>
                <label htmlFor="server" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Endereço do servidor
                </label>
                <input
                  id="server"
                  name="server"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  placeholder="http://seuservidor.com:8080"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="username" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Usuário
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Senha
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-zinc-500 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 accent-brand-500"
                />
                Lembrar servidor, usuário e senha neste aparelho
              </label>
            </div>

            <button
              type="submit"
              disabled={busyId !== null}
              className="glow-border-strong mt-6 w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-700 py-3 text-sm font-bold tracking-wide text-white transition-all duration-200 hover:brightness-110 hover:saturate-150 disabled:opacity-50 disabled:hover:brightness-100"
            >
              {busyId === 'form' ? 'Conectando...' : 'Entrar'}
            </button>
            {accounts.length > 0 && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="mt-3 w-full py-2 text-sm text-zinc-400 hover:text-white"
              >
                Voltar às contas salvas
              </button>
            )}
          </form>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-500/20 bg-rose-950/40 px-3.5 py-2.5 text-sm text-rose-300">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
