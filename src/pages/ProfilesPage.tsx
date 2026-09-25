import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Lock, Play, Plus, Settings, Shield, Trash, Unlock } from '../components/icons'
import PinPrompt from '../components/PinPrompt'
import { type Profile, useActiveAccountId, useActiveProfile, useProfiles, useProfilesStore } from '../store/profiles'

const COLORS = ['#0f7bff', '#e0479e', '#f5a623', '#22c55e', '#a855f7', '#ef4444']
const MAX_PROFILES = 6

function ProfileSettings({ accId, profile, onClose }: { accId: string; profile: Profile; onClose: () => void }) {
  const setKids = useProfilesStore((s) => s.setKids)
  const setPin = useProfilesStore((s) => s.setPin)
  const [pinInput, setPinInput] = useState('')

  return (
    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-left text-xs">
      <label className="mb-3 flex cursor-pointer items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-zinc-300">
          <Shield className="h-3.5 w-3.5" /> Perfil infantil
        </span>
        <input
          type="checkbox"
          checked={Boolean(profile.isKids)}
          onChange={(e) => setKids(accId, profile.id, e.target.checked)}
          className="h-4 w-4 accent-brand-500"
        />
      </label>
      <p className="mb-3 text-[11px] leading-snug text-zinc-600">Oculta categorias de conteúdo adulto em todo o app para este perfil.</p>

      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-zinc-300">
          {profile.pin ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          {profile.pin ? 'PIN ativo' : 'Sem PIN'}
        </span>
        {profile.pin && (
          <button onClick={() => setPin(accId, profile.id, null)} className="text-rose-400 hover:text-rose-300">
            Remover
          </button>
        )}
      </div>
      {!profile.pin && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (pinInput.length === 4) {
              setPin(accId, profile.id, pinInput)
              setPinInput('')
            }
          }}
          className="mt-2 flex gap-1.5"
        >
          <input
            inputMode="numeric"
            placeholder="0000"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="brand-focus w-16 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-center tracking-widest text-white"
          />
          <button
            type="submit"
            disabled={pinInput.length !== 4}
            className="rounded-lg bg-brand-600 px-2.5 py-1 font-semibold text-white disabled:opacity-40"
          >
            Definir
          </button>
        </form>
      )}

      <button onClick={onClose} className="mt-3 w-full text-center text-zinc-500 hover:text-white">
        Fechar
      </button>
    </div>
  )
}

export default function ProfilesPage() {
  const navigate = useNavigate()
  const accId = useActiveAccountId()
  const profiles = useProfiles()
  const activeProfile = useActiveProfile()
  const addProfile = useProfilesStore((s) => s.addProfile)
  const removeProfile = useProfilesStore((s) => s.removeProfile)
  const renameProfile = useProfilesStore((s) => s.renameProfile)
  const setActiveProfile = useProfilesStore((s) => s.setActiveProfile)

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[profiles.length % COLORS.length])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [pinTarget, setPinTarget] = useState<Profile | null>(null)

  if (!accId) return null

  function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !accId) return
    addProfile(accId, name.trim(), color)
    setName('')
    setAdding(false)
  }

  function handleRename(profileId: string) {
    if (renameValue.trim() && accId) renameProfile(accId, profileId, renameValue.trim())
    setRenamingId(null)
  }

  function enterProfile(p: Profile) {
    if (p.pin && p.id !== activeProfile?.id) {
      setPinTarget(p)
      return
    }
    setActiveProfile(accId!, p.id)
    navigate('/')
  }

  return (
    <div className="min-h-screen px-4 pt-24 sm:px-10">
      <h1 className="font-display mb-1 text-2xl font-bold text-white">Perfis</h1>
      <p className="mb-8 max-w-lg text-sm text-zinc-400">
        Cada perfil tem sua própria lista, continuar assistindo e histórico — todos usam a mesma assinatura.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {profiles.map((p) => (
          <div
            key={p.id}
            data-testid={`profile-card-${p.id}`}
            className={`group relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
              p.id === activeProfile?.id ? 'border-brand-400/50 bg-brand-500/10' : 'border-white/[0.06] bg-zinc-900/60'
            }`}
          >
            {settingsId === p.id ? (
              <ProfileSettings accId={accId} profile={p} onClose={() => setSettingsId(null)} />
            ) : (
              <>
                <button onClick={() => enterProfile(p)} className="flex flex-col items-center gap-2" aria-label={`Entrar como ${p.name}`}>
                  <span className="relative">
                    <span
                      className="glow-border flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
                      style={{ background: p.color }}
                    >
                      {p.id === activeProfile?.id ? <Check className="h-7 w-7" /> : p.name[0]?.toUpperCase()}
                    </span>
                    {p.isKids && (
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-emerald-400 ring-2 ring-zinc-900" title="Perfil infantil">
                        <Shield className="h-3 w-3" />
                      </span>
                    )}
                    {p.pin && (
                      <span className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-zinc-400 ring-2 ring-zinc-900" title="Perfil com PIN">
                        <Lock className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                  {renamingId === p.id ? null : <span className="max-w-full truncate text-sm font-medium text-white">{p.name}</span>}
                </button>

                {renamingId === p.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleRename(p.id)
                    }}
                    className="flex w-full items-center gap-1"
                  >
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRename(p.id)}
                      className="brand-focus w-full min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/70 px-2 py-1 text-center text-sm text-white"
                    />
                  </form>
                ) : (
                  // Always visible on touch (no hover to reveal them there); fades in on mouse hover otherwise.
                  <div className="flex gap-3 text-xs text-zinc-500 opacity-100 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100">
                    <button
                      onClick={() => {
                        setRenamingId(p.id)
                        setRenameValue(p.name)
                      }}
                      className="hover:text-white"
                    >
                      Renomear
                    </button>
                    <button onClick={() => setSettingsId(p.id)} className="flex items-center gap-1 hover:text-white">
                      <Settings className="h-3 w-3" /> Ajustes
                    </button>
                    {profiles.length > 1 && (
                      <button
                        onClick={() => {
                          if (confirm(`Excluir o perfil "${p.name}"? A lista e o histórico dele serão perdidos.`)) {
                            removeProfile(accId, p.id)
                          }
                        }}
                        className="flex items-center gap-1 hover:text-rose-400"
                      >
                        <Trash className="h-3 w-3" /> Excluir
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {profiles.length < MAX_PROFILES &&
          (adding ? (
            <form
              onSubmit={handleAdd}
              className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-700 p-4"
            >
              <div className="flex flex-wrap justify-center gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Cor ${c}`}
                    className={`h-6 w-6 rounded-full transition-transform ${color === c ? 'scale-110 ring-2 ring-white' : ''}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do perfil"
                maxLength={20}
                className="brand-focus w-full rounded-lg border border-zinc-800 bg-zinc-900/70 px-2 py-1.5 text-center text-sm text-white"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-gradient-to-r from-brand-500 to-brand-700 px-3 py-1.5 text-xs font-bold text-white"
                >
                  Criar
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => {
                setColor(COLORS[profiles.length % COLORS.length])
                setAdding(true)
              }}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 p-4 text-zinc-500 transition-colors hover:border-brand-500/50 hover:text-white"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-zinc-700">
                <Plus className="h-7 w-7" />
              </span>
              Adicionar perfil
            </button>
          ))}
      </div>

      <button
        onClick={() => navigate('/')}
        className="mt-10 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-brand-500/40 hover:bg-zinc-800"
      >
        <Play className="h-4 w-4" /> Voltar
      </button>

      {pinTarget && (
        <PinPrompt
          profile={pinTarget}
          onCancel={() => setPinTarget(null)}
          onSuccess={() => {
            setActiveProfile(accId, pinTarget.id)
            setPinTarget(null)
            navigate('/')
          }}
        />
      )}
    </div>
  )
}
