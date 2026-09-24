import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Play, Plus, Trash } from '../components/icons'
import { useActiveAccountId, useActiveProfile, useProfiles, useProfilesStore } from '../store/profiles'

const COLORS = ['#0f7bff', '#e0479e', '#f5a623', '#22c55e', '#a855f7', '#ef4444']
const MAX_PROFILES = 6

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
            className={`group relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
              p.id === activeProfile?.id ? 'border-brand-400/50 bg-brand-500/10' : 'border-white/[0.06] bg-zinc-900/60'
            }`}
          >
            <button
              onClick={() => {
                setActiveProfile(accId, p.id)
                navigate('/')
              }}
              className="flex flex-col items-center gap-2"
              aria-label={`Entrar como ${p.name}`}
            >
              <span
                className="glow-border flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
                style={{ background: p.color }}
              >
                {p.id === activeProfile?.id ? <Check className="h-7 w-7" /> : p.name[0]?.toUpperCase()}
              </span>
              {renamingId === p.id ? null : (
                <span className="max-w-full truncate text-sm font-medium text-white">{p.name}</span>
              )}
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
              <div className="flex gap-3 text-xs text-zinc-500 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => {
                    setRenamingId(p.id)
                    setRenameValue(p.name)
                  }}
                  className="hover:text-white"
                >
                  Renomear
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
    </div>
  )
}
