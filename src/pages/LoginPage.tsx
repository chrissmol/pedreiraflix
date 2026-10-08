import { type ChangeEvent, type FormEvent, type ReactNode, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Calendar, Eye, EyeOff, FileArrowDown, ListIcon, Lock, Pencil, Shield, Trash, Tv, User } from '../components/icons'
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

// Campos no padrao do Stitch: icone a esquerda, 48px de altura, cantos de 12px.
const inputClass =
  'brand-focus h-12 w-full rounded-xl border border-outline-soft bg-surface-container pl-11 pr-3.5 text-body-md text-white placeholder-on-surface-muted transition-colors focus:border-brand-500/60'

function Field({ id, label, hint, icon, children }: { id: string; label: string; hint?: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-label-md text-white">
          {label}
        </label>
        {hint && <span className="text-label-badge uppercase tracking-wider text-on-surface-muted">{hint}</span>}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-on-surface-muted">
          {icon}
        </span>
        {children}
      </div>
    </div>
  )
}

function hostLabel(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

type LoginMethod = 'xtream' | 'm3u-url' | 'm3u-file'

// `short` cabe nas tres abas de um celular de 390px; o nome completo segue no aria-label.
const methods: { id: LoginMethod; label: string; short: string; icon: ReactNode }[] = [
  { id: 'xtream', label: 'Usuário/senha', short: 'Usuário', icon: <User className="h-4 w-4" /> },
  { id: 'm3u-url', label: 'Link M3U', short: 'Link M3U', icon: <ListIcon className="h-4 w-4" /> },
  { id: 'm3u-file', label: 'Arquivo M3U', short: 'Arquivo', icon: <FileArrowDown className="h-4 w-4" /> },
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

  const choosing = accounts.length > 0 && !showForm

  return (
    // Rolavel por conta propria: o body do app nao rola (index.css) e o login fica fora do Layout, entao numa tela
    // baixa o "Entrar" ficava inalcancavel (APK no Motorola, 08/10). No celular o login e compacto para caber sem rolar.
    <div className="flex h-full flex-col items-center overflow-y-auto bg-surface px-4 pb-8 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:justify-[safe_center] sm:pb-10 sm:pt-10">
      <span className="neon-text font-display mb-4 bg-gradient-to-br from-brand-200 via-brand-400 to-brand-600 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent sm:mb-6">
        PedreiraFlix
      </span>

      <div className="w-full max-w-xl rounded-3xl border border-outline-soft bg-surface-lowest p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)] sm:px-10 sm:py-8">
        <div className="mb-5 text-center sm:mb-6">
          <h1 className="font-display text-headline-md text-white sm:text-headline-lg">
            {choosing ? 'Escolha uma conta salva' : 'Conecte sua conta ou lista'}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-body-md text-on-surface-variant">
            {choosing
              ? 'Toque na conta para entrar.'
              : 'Use os dados que o seu provedor de IPTV enviou para carregar canais, filmes e séries.'}
          </p>
        </div>

        {choosing && (
          <div className="space-y-3" data-testid="saved-accounts">
            {accounts.map((account) =>
              renamingId === account.id ? (
                <form
                  key={account.id}
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveRename(account.id)
                  }}
                  className="flex items-center gap-3 rounded-2xl border border-brand-500/40 bg-surface-container px-4 py-3"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
                    <User className="h-5 w-5" />
                  </span>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => saveRename(account.id)}
                    placeholder={accountLabel(account)}
                    maxLength={30}
                    className="brand-focus h-10 min-w-0 flex-1 rounded-xl border border-outline-soft bg-surface-high px-3 text-body-md text-white"
                  />
                </form>
              ) : (
                <div key={account.id} className="flex items-stretch gap-2">
                  <button
                    onClick={() => enterSaved(account)}
                    disabled={busyId !== null}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-outline-soft bg-surface-container px-4 py-3 text-left transition-colors hover:border-outline-strong hover:bg-surface-high active:bg-surface-high disabled:opacity-60"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
                      <User className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-label-md text-white">{accountLabel(account)}</span>
                      <span className="block truncate text-body-sm text-on-surface-variant">{accountSubtitle(account)}</span>
                    </span>
                    {/* "Entrar" is purely decorative — the whole row is already the tap target — so it's
                        the first thing to go on a narrow phone, where it was crowding the account name
                        itself down to one truncated letter. "Conectando..." stays at every width: that's
                        real loading feedback, not decoration. */}
                    <span className="hidden shrink-0 text-label-md text-brand-400 sm:inline">
                      {busyId === account.id ? 'Conectando...' : 'Entrar'}
                    </span>
                    {busyId === account.id && (
                      <span className="shrink-0 text-label-md text-brand-400 sm:hidden">Conectando...</span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setRenameValue(account.label ?? '')
                      setRenamingId(account.id)
                    }}
                    aria-label={`Renomear conta ${accountLabel(account)}`}
                    title="Renomear"
                    className="shrink-0 rounded-2xl border border-outline-soft bg-surface-container px-3 text-on-surface-muted transition-colors hover:border-outline-strong hover:text-white sm:px-3.5"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => removeAccount(account.id)}
                    aria-label={`Esquecer conta ${accountLabel(account)}`}
                    title="Esquecer esta conta"
                    className="shrink-0 rounded-2xl border border-outline-soft bg-surface-container px-3 text-on-surface-muted transition-colors hover:border-live/40 hover:text-live sm:px-3.5"
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
              className="mt-2 h-12 w-full rounded-full border border-dashed border-outline-strong text-label-md text-on-surface-variant transition-colors hover:border-brand-500/50 hover:text-white"
            >
              + Usar outra conta
            </button>
          </div>
        )}

        {showForm && (
          // Real name/autocomplete attributes let the browser's password manager offer to save and autofill these.
          <form onSubmit={handleSubmit} autoComplete="on">
            <div className="mb-5 grid grid-cols-3 gap-1 rounded-full sm:mb-6 border border-outline-soft bg-surface-container p-1">
              {methods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  aria-label={m.label}
                  className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 py-2.5 text-body-sm font-semibold transition-colors ${
                    method === m.id
                      ? 'bg-brand-500 text-white shadow-[0_0_20px_-4px_rgba(15,123,255,0.6)]'
                      : 'text-on-surface-variant hover:text-white'
                  }`}
                >
                  <span className="hidden sm:inline">{m.icon}</span>
                  <span className="sm:hidden">{m.short}</span>
                  <span className="hidden sm:inline">{m.label}</span>
                </button>
              ))}
            </div>

            <div className="space-y-4 sm:space-y-5">
              {method === 'xtream' && (
                <>
                  <Field id="server" label="Endereço do servidor" hint="http ou https" icon={<Tv className="h-5 w-5" />}>
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
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
                    <Field id="username" label="Usuário" icon={<User className="h-5 w-5" />}>
                      <input
                        id="username"
                        name="username"
                        type="text"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        required
                        placeholder="Seu usuário"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <Field id="password" label="Senha" icon={<Lock className="h-5 w-5" />}>
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
                        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-on-surface-muted hover:text-white"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </Field>
                  </div>
                </>
              )}

              {method === 'm3u-url' && (
                <Field id="m3u-url" label="Link da playlist M3U" icon={<ListIcon className="h-5 w-5" />}>
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
                </Field>
              )}

              {method === 'm3u-file' && (
                <div>
                  <label htmlFor="m3u-file" className="mb-2 block text-label-md text-white">
                    Arquivo M3U do aparelho
                  </label>
                  <input
                    id="m3u-file"
                    name="m3u-file"
                    type="file"
                    accept=".m3u,.m3u8,audio/x-mpegurl,application/x-mpegurl"
                    required
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setM3uFile(e.target.files?.[0] ?? null)}
                    className="block w-full rounded-xl border border-dashed border-outline-strong bg-surface-container p-3 text-body-sm text-on-surface-variant file:mr-3 file:rounded-full file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-body-sm file:font-semibold file:text-white hover:file:bg-brand-400"
                  />
                </div>
              )}

              {/* Most playlists carry tvg-id on every channel but declare no url-tvg on the header, so the
                  guide has to come from somewhere. Blank is the normal case: the playlist's own url-tvg
                  wins when it has one. */}
              {method !== 'xtream' && (
                <div>
                  <Field id="epg-url" label="Link do guia (EPG)" hint="Opcional" icon={<Calendar className="h-5 w-5" />}>
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
                  </Field>
                  <p className="mt-2 text-body-sm text-on-surface-muted">
                    Arquivo XMLTV (.xml ou .xml.gz). Deixe em branco se a playlist já trouxer o guia.
                  </p>
                </div>
              )}

              <Field id="account-name" label="Nome (opcional)" icon={<Pencil className="h-5 w-5" />}>
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
              </Field>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-outline-soft bg-surface-container p-3 sm:p-4">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-brand-500"
                />
                <span>
                  <span className="block text-label-md text-white">Lembrar esses dados neste aparelho</span>
                  <span className="hidden text-body-sm text-on-surface-variant sm:block">
                    Ficam salvos só aqui, para entrar com um toque da próxima vez.
                  </span>
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={busyId !== null}
              className="btn-primary mt-5 w-full text-body-lg sm:mt-6"
            >
              {busyId === 'form' ? 'Conectando...' : 'Entrar'}
            </button>
            {accounts.length > 0 && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="mt-3 w-full py-2 text-label-md text-on-surface-variant hover:text-white"
              >
                Voltar às contas salvas
              </button>
            )}
          </form>
        )}

        {error && (
          <p role="alert" className="mt-5 rounded-2xl border border-live/30 bg-live/10 px-4 py-3 text-body-md text-red-200">
            {error}
          </p>
        )}

        {/* Texto honesto de proposito: o do Stitch dizia que as credenciais nunca passam por servidor
            nenhum, o que e falso — o proxy do Worker existe justamente para o video tocar no navegador. */}
        <div className="mt-8 flex gap-3 rounded-2xl bg-surface-container p-4">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
          <p className="text-body-sm text-on-surface-variant">
            <span className="block text-label-md text-white">O PedreiraFlix é só o player</span>
            Não hospeda nenhum conteúdo: toca o que o seu provedor já entrega. Os dados de acesso só ficam salvos
            neste aparelho.
          </p>
        </div>
      </div>
    </div>
  )
}
