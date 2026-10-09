import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isTv } from '../lib/device'
import { Download } from './icons'

/** Sem internet o app abre normalmente (telas e catalogo guardados), mas nada avisava — e o que da para assistir
 * e o que foi baixado. Mesmo cartao do aviso de nova versao (UpdatePrompt). Pedido do Christian, 08/10. */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(() => !navigator.onLine)
  const { pathname } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (!offline) return null
  const showLink = !isTv && pathname !== '/downloads'
  return (
    <div
      role="status"
      className="card-panel absolute inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex items-center gap-3 rounded-2xl px-4 py-3 md:inset-x-auto md:right-6 md:bottom-6 md:w-96"
    >
      <span className="flex-1 text-label-md text-white">
        Sem internet
        {!isTv && <span className="block text-body-sm text-on-surface-variant">Seus downloads continuam disponíveis.</span>}
      </span>
      {showLink && (
        <button onClick={() => navigate('/downloads')} className="btn-primary h-10 px-4 sm:px-4">
          <Download className="h-4 w-4" /> Ver downloads
        </button>
      )}
    </div>
  )
}
