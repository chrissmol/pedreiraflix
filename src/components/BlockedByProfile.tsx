import { useNavigate } from 'react-router-dom'
import { Shield } from './icons'

/** Shown when a direct link/bookmark/continue-watching entry points at content hidden from a kids
 * profile (the catalog lists themselves already filter it out — this only guards direct navigation). */
export default function BlockedByProfile() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Shield className="h-12 w-12 text-zinc-500" />
      <p className="text-lg font-semibold text-white">Conteúdo bloqueado para este perfil</p>
      <p className="max-w-sm text-sm text-zinc-400">
        Esse título está numa categoria oculta para perfis infantis. Troque de perfil para assistir.
      </p>
      <button
        onClick={() => navigate('/')}
        className="mt-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-brand-500/40 hover:bg-zinc-800"
      >
        Voltar ao início
      </button>
    </div>
  )
}
