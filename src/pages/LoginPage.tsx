import { type ChangeEvent, type FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Pencil, Trash, User } from '../components/icons'
import { signIn, signInM3u, signInSavedAccount } from '../lib/session'
import { type SavedAccount, useAccountsStore } from '../store/accounts'
import { useAuthStore } from '../store/auth'

function accountLabel(account: SavedAccount): string {
  if (account.label) return account.label
  return account.credentials.type === 'xtream' ? account.credentials.username : 'Playlist M3U'
}

function accountSubtitle(account: SavedAccount): string {
  const creds = account.credentials
  if (creds.type === 'xtream') return `${account.label ? `${creds.username} · ` : ''}${hostLabel(creds.baseUrl)}`
  return creds.source === 'url' ? hostLabel(creds.url) : creds.fileName
}

const inputClass =
  'brand-focus w-full rounded-xl border border-outline-soft bg-surface-container px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 transition-colors focus:border-brand-500/60'

function hostLabel(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

type LoginMethod = 'xtream' | 'm3u-url' | 'm3u-file'

const methods: { id: LoginMethod; label: string }[] = [
  { id: 'm3u-url', label: 'Link M3U' },
  { id: 'm3u-file', label: 'Arquivo M3U' },
  { id: 'xtream', label: 'Usuário/senha' },
]

export default function LoginPage() {
  const navigate = useNavigate()
  const hasSession = useAuthStore((s) => Boolean(s.credentials))
  const accounts = useAccountsStore((s) => s.accounts)
  const removeAccount = useAccountsStore((s) => s.removeAccount)
  const renameAccount = useAccountsStore((s) => s.renameAccount)
  const last = accounts[0]
  const lastXtream = last?.credentials.type === 'xtream' ? last.credentials : undefined
  // Prefilled with the last account, so even the "type it again" path is just one tap on Entrar.
  const [baseUrl, setBaseUrl] = useState(lastXtream?.baseUrl ?? '')
  const [username, setUsername] = useState(lastXtream?.username ?? '')
  const [password, setPassword] = useState(lastXtream?.password ?? '')
  const [m3uUrl, setM3uUrl] = useState('')
  const [m3uFile, setM3uFile] = useState<File | null>(null)
  const [epgUrl, setEpgUrl] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [showForm, setShowForm] = useState(accounts.length === 0)
  const [method, setMethod] = useState<LoginMethod>('xtream')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

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
    if (method === 'xtream') {
      run('form', () => signIn({ baseUrl, username, password }, remember, name))
    } else if (method === 'm3u-url') {
      run('form', () => signInM3u({ kind: 'url', url: m3uUrl, epgUrl }, remember, name))
    } else if (m3uFile) {
      run('form', () => signInM3u({ kind: 'file', file: m3uFile, epgUrl }, remember, name))
    }
  }

  function enterSaved(account: SavedAccount) {
    run(account.id, () => signInSavedAccount(account))
  }

  function saveRename(id: string) {
    if (renameValue.trim()) renameAccount(id, renameValue.trim())
    setRenamingId(null)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#06070c] px-4 py-10">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[32rem] w-[32rem] animate-[pulse_9s_ease-in-out_infinite] rounded-full bg-brand-600/12 blur-[110px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[28rem] w-[28rem] animate-[pulse_11s_ease-in-out_infinite] rounded-full bg-brand-400/10 blur-[110px]" />
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
            {accounts.map((account) =>
              renamingId === account.id ? (
                <form
                  key={account.id}
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveRename(account.id)
                  }}
                  className="flex items-center gap-2 rounded-xl border border-brand-500/40 bg-surface-container px-3.5 py-2"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white">
                    <User className="h-5 w-5" />
                  </span>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => saveRename(account.id)}
                    placeholder={accountLabel(account)}
                    maxLength={30}
                    className="brand-focus min-w-0 flex-1 rounded-lg border border-outline-soft bg-surface-container px-2.5 py-1.5 text-sm text-white"
                  />
                </form>
              ) : (
                <div key={account.id} className="flex items-stretch gap-2">
                  <button
                    onClick={() => enterSaved(account)}
                    disabled={busyId !== null}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-outline-soft bg-surface-container px-3.5 py-3 text-left transition-colors hover:border-brand-500/50 hover:bg-surface-high active:bg-surface-high disabled:opacity-60"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-white">
                      <User className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{accountLabel(account)}</span>
                      <span className="block truncate text-xs text-zinc-400">{accountSubtitle(account)}</span>
                    </span>
                    {/* "Entrar" is purely decorative — the whole row is already the tap target — so it's
                        the first thing to go on a narrow phone, where it was crowding the account name
                        itself down to one truncated letter. "Conectando..." stays at every width: that's
                        real loading feedback, not decoration. */}
                    <span className="hidden shrink-0 text-xs font-semibold text-brand-300 sm:inline">
                      {busyId === account.id ? 'Conectando...' : 'Entrar'}
                    </span>
                    {busyId === account.id && (
                      <span className="shrink-0 text-xs font-semibold text-brand-300 sm:hidden">Conectando...</span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setRenameValue(account.label ?? '')
                      setRenamingId(account.id)
                    }}
                    aria-label={`Renomear conta ${accountLabel(account)}`}
                    title="Renomear"
                    className="shrink-0 rounded-xl border border-outline-soft bg-surface-container px-2.5 text-zinc-500 transition-colors hover:border-brand-500/40 hover:text-white sm:px-3"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeAccount(account.id)}
                    aria-label={`Esquecer conta ${accountLabel(account)}`}
                    title="Esquecer esta conta"
                    className="shrink-0 rounded-xl border border-outline-soft bg-surface-container px-2.5 text-zinc-500 transition-colors hover:border-rose-500/40 hover:text-rose-400 sm:px-3"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </div>
              ),
            )}
            <button
              onClick={() => {
                setBaseUrl('')
                setUsername('')
                setPassword('')
                setM3uUrl('')
                setM3uFile(null)
                setName('')
                setShowForm(true)
              }}
              className="mt-2 w-full rounded-xl border border-dashed border-outline-strong py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-brand-500/50 hover:text-white"
            >
              + Usar outra conta
            </button>
          </div>
        )}

        {showForm && (
          // Real name/autocomplete attributes let the browser's password manager offer to save and autofill these.
          <form onSubmit={handleSubmit} autoComplete="on">
            <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-outline-soft bg-surface-container p-1">
              {methods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${
                    method === m.id ? 'bg-brand-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {method === 'xtream' && (
                <>
                  <div>
                    <label htmlFor="server" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
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
                    <label htmlFor="username" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
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
                    <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
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
                </>
              )}

              {method === 'm3u-url' && (
                <div>
                  <label htmlFor="m3u-url" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Link da playlist M3U
                  </label>
                  <input
                    id="m3u-url"
                    name="m3u-url"
                    type="text"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    placeholder="http://seuprovedor.com/playlist.m3u"
                    value={m3uUrl}
                    onChange={(e) => setM3uUrl(e.target.value)}
                    className={inputClass}
                  />
                </div>
              )}

              {method === 'm3u-file' && (
                <div>
                  <label htmlFor="m3u-file" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Arquivo M3U do aparelho
                  </label>
                  <input
                    id="m3u-file"
                    name="m3u-file"
                    type="file"
                    accept=".m3u,.m3u8,audio/x-mpegurl,application/x-mpegurl"
                    required
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setM3uFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3.5 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-500"
                  />
                </div>
              )}

              {/* Most playlists carry tvg-id on every channel but declare no url-tvg on the header, so the
                  guide has to come from somewhere. Blank is the normal case: the playlist's own url-tvg
                  wins when it has one. */}
              {method !== 'xtream' && (
                <div>
                  <label htmlFor="epg-url" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Link do guia (EPG) <span className="font-normal normal-case tracking-normal text-zinc-500">— opcional</span>
                  </label>
                  <input
                    id="epg-url"
                    name="epg-url"
                    type="text"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="http://seuprovedor.com/guia.xml"
                    value={epgUrl}
                    onChange={(e) => setEpgUrl(e.target.value)}
                    className={inputClass}
                  />
                  <p className="mt-1.5 text-xs text-zinc-500">
                    Arquivo XMLTV (.xml ou .xml.gz). Deixe em branco se a playlist já trouxer o guia.
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="account-name" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Nome (opcional)
                </label>
                <input
                  id="account-name"
                  name="account-name"
                  type="text"
                  autoComplete="off"
                  maxLength={30}
                  placeholder="ex: Conta principal, TV da sala..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 accent-brand-500"
                />
                Lembrar esses dados neste aparelho
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
