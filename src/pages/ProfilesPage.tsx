import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, Lock, Plus, Settings, Shield, Trash, Unlock } from '../components/icons'
import ConfirmDialog from '../components/ConfirmDialog'
import PinPrompt from '../components/PinPrompt'
import { useAppLockStore } from '../store/appLock'
import { type Profile, useActiveAccountId, useActiveProfile, useProfiles, useProfilesStore } from '../store/profiles'

const COLORS = ['#0f7bff', '#e0479e', '#f5a623', '#22c55e', '#a855f7', '#ef4444']
const MAX_PROFILES = 6

function AppPinSettings() {
  const pin = useAppLockStore((s) => s.pin)
  const setPin = useAppLockStore((s) => s.setPin)
  const [pinInput, setPinInput] = useState('')

  return (
    <div className="mb-8 max-w-md rounded-2xl border border-outline-soft bg-surface-low p-4 text-body-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-label-md text-white">
          {pin ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          PIN do app {pin ? 'ativo' : 'desativado'}
        </span>
        {pin && (
          <button onClick={() => setPin(null)} className="rounded-full px-2 py-1 text-live hover:bg-live/10">
            Remover
          </button>
        )}
      </div>
      <p className="mt-1 text-body-sm text-on-surface-variant">Pede um PIN de 4 dígitos toda vez que o app é aberto, antes de escolher o perfil.</p>
      {!pin && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (pinInput.length === 4) {
              setPin(pinInput)
              setPinInput('')
            }
          }}
          className="mt-3 flex gap-2"
        >
          <input
            inputMode="numeric"
            placeholder="0000"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="brand-focus h-10 w-20 rounded-full border border-outline-soft bg-surface-container px-3 text-center tracking-widest text-white"
          />
          <button
            type="submit"
            disabled={pinInput.length !== 4}
            className="btn-primary h-10 px-4 text-body-sm sm:px-4"
          >
            Definir
          </button>
        </form>
      )}
    </div>
  )
}

function ProfileSettings({ accId, profile, onClose }: { accId: string; profile: Profile; onClose: () => void }) {
  const setKids = useProfilesStore((s) => s.setKids)
  const setPin = useProfilesStore((s) => s.setPin)
  const [pinInput, setPinInput] = useState('')

  return (
    <div className="w-full rounded-2xl border border-outline-soft bg-surface-lowest p-3 text-left text-body-sm">
      <label className="mb-3 flex cursor-pointer items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-label-md text-white">
          <Shield className="h-3.5 w-3.5" /> Perfil infantil
        </span>
        <input
          type="checkbox"
          checked={Boolean(profile.isKids)}
          onChange={(e) => setKids(accId, profile.id, e.target.checked)}
          className="h-4 w-4 accent-brand-500"
        />
      </label>
      <p className="mb-3 text-body-sm text-on-surface-variant">Oculta categorias de conteúdo adulto em todo o app para este perfil.</p>

      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-label-md text-white">
          {profile.pin ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          {profile.pin ? 'PIN ativo' : 'Sem PIN'}
        </span>
        {profile.pin && (
          <button onClick={() => setPin(accId, profile.id, null)} className="rounded-full px-2 py-1 text-live hover:bg-live/10">
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
          className="mt-3 flex gap-2"
        >
          <input
            inputMode="numeric"
            placeholder="0000"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="brand-focus h-10 w-20 rounded-full border border-outline-soft bg-surface-container px-3 text-center tracking-widest text-white"
          />
          <button
            type="submit"
            disabled={pinInput.length !== 4}
            className="btn-primary h-10 px-4 text-body-sm sm:px-4"
          >
            Definir
          </button>
        </form>
      )}

      <button onClick={onClose} className="mt-3 w-full rounded-full py-2 text-center text-label-md text-on-surface-variant hover:bg-surface-high hover:text-white">
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
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)

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
    <div className="min-h-screen px-4 pt-[calc(6rem+env(safe-area-inset-top))] sm:px-10">
      <h1 className="font-display mb-1 text-headline-md text-white sm:text-headline-lg">Perfis</h1>
      <p className="mb-8 max-w-lg text-body-md text-on-surface-variant">
        Cada perfil tem sua própria lista, continuar assistindo e histórico — todos usam a mesma assinatura.
      </p>

      <AppPinSettings />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {profiles.map((p) => (
          <div
            key={p.id}
            data-testid={`profile-card-${p.id}`}
            className={`group relative flex flex-col items-center gap-3 rounded-2xl border p-5 transition-colors ${
              p.id === activeProfile?.id
                ? 'border-brand-500/50 bg-surface-container shadow-[0_0_30px_-12px_rgba(15,123,255,0.5)]'
                : 'border-outline-soft bg-surface-low hover:border-outline-strong hover:bg-surface-container'
            }`}
          >
            {settingsId === p.id ? (
              <ProfileSettings accId={accId} profile={p} onClose={() => setSettingsId(null)} />
            ) : (
              <>
                <button onClick={() => enterProfile(p)} className="flex flex-col items-center gap-2" aria-label={`Entrar como ${p.name}`}>
                  <span className="relative">
                    <span
                      className="flex h-20 w-20 items-center justify-center rounded-full text-headline-lg text-white shadow-[0_12px_28px_-10px_rgba(0,0,0,0.8)]"
                      style={{ background: p.color }}
                    >
                      {p.id === activeProfile?.id ? <Check className="h-7 w-7" /> : p.name[0]?.toUpperCase()}
                    </span>
                    {p.isKids && (
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface-container text-done ring-2 ring-surface" title="Perfil infantil">
                        <Shield className="h-3 w-3" />
                      </span>
                    )}
                    {p.pin && (
                      <span className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface-container text-on-surface-variant ring-2 ring-surface" title="Perfil com PIN">
                        <Lock className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                  {renamingId === p.id ? null : <span className="max-w-full truncate text-label-md text-white">{p.name}</span>}
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
                      className="brand-focus h-10 w-full min-w-0 rounded-full border border-outline-soft bg-surface-container px-3 text-center text-body-md text-white"
                    />
                  </form>
                ) : (
                  // Always visible on touch (no hover to reveal them there); fades in on mouse hover otherwise.
                  <div className="flex gap-1 text-body-sm text-on-surface-variant">
                    <button
                      onClick={() => {
                        setRenamingId(p.id)
                        setRenameValue(p.name)
                      }}
                      className="flex min-h-11 items-center rounded-full px-3 hover:bg-surface-high hover:text-white"
                    >
                      Renomear
                    </button>
                    <button onClick={() => setSettingsId(p.id)} className="flex min-h-11 items-center gap-1 rounded-full px-3 hover:bg-surface-high hover:text-white">
                      <Settings className="h-3 w-3" /> Ajustes
                    </button>
                    {profiles.length > 1 && (
                      <button onClick={() => setDeleteTarget(p)} className="flex min-h-11 items-center gap-1 rounded-full px-3 hover:bg-live/10 hover:text-live">
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
              className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-outline-strong bg-surface-low p-5"
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
                className="brand-focus h-10 w-full rounded-full border border-outline-soft bg-surface-container px-3 text-center text-body-md text-white"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="btn-primary h-10 px-4 text-body-sm sm:px-4"
                >
                  Criar
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="btn-secondary h-10 px-4 text-body-sm sm:px-4"
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
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-outline-strong p-5 text-label-md text-on-surface-variant transition-colors hover:border-brand-500/50 hover:bg-surface-low hover:text-white"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-outline-strong">
                <Plus className="h-7 w-7" />
              </span>
              Adicionar perfil
            </button>
          ))}
      </div>

      <button
        onClick={() => navigate('/')}
        className="btn-secondary mt-10"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar
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

      {deleteTarget && (
        <ConfirmDialog
          message={`Excluir o perfil "${deleteTarget.name}"? A lista e o histórico dele serão perdidos.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            removeProfile(accId, deleteTarget.id)
            setDeleteTarget(null)
          }}
        />
      )}
    </div>
  )
}
