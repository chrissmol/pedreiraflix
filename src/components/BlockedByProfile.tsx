import { useNavigate } from 'react-router-dom'
import { Shield } from './icons'

/** Shown when a direct link/bookmark/continue-watching entry points at content hidden from a kids
 * profile (the catalog lists themselves already filter it out — this only guards direct navigation). */
export default function BlockedByProfile() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container"><Shield className="h-8 w-8 text-on-surface-variant" /></span>
      <p className="font-display text-headline-md text-white">Conteúdo bloqueado para este perfil</p>
      <p className="max-w-sm text-body-md text-on-surface-variant">
        Esse título está numa categoria oculta para perfis infantis. Troque de perfil para assistir.
      </p>
      <button
        onClick={() => navigate('/')}
        className="btn-primary mt-2"
      >
        Voltar ao início
      </button>
    </div>
  )
}
