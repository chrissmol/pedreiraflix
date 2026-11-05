import { Link } from 'react-router-dom'
import { Home } from '../components/icons'

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-display text-display-hero text-white/20" aria-hidden="true">404</p>
      <h1 className="font-display text-headline-md text-white">Página não encontrada</h1>
      <p className="max-w-md text-body-md text-on-surface-variant">Esse endereço não existe no PedreiraFlix. Volte para o início e continue de lá.</p>
      <Link to="/" replace className="brand-focus flex items-center gap-2 rounded-full bg-brand-fill px-5 py-2 text-label-md font-semibold text-white transition-transform hover:scale-105">
        <Home className="h-4 w-4" /> Voltar ao Início
      </Link>
    </div>
  )
}
