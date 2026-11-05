import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isTv } from '../lib/device'
import { useLibraryStore } from '../store/library'
import { useActiveProfile } from '../store/profiles'

// Uma vez por abertura do app (variavel de modulo): voltar para o Inicio depois nao redireciona de novo.
let done = false

/** TV com "Abrir no último canal" ligado no perfil: ao abrir o app, vai direto para o ultimo canal ao vivo. A tela
 * do player ja barra canal adulto/infantil e conta a conexao como qualquer canal aberto. */
export default function OpenLastChannel() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const profile = useActiveProfile()
  const last = useLibraryStore((s) => (profile ? s.recentLive[profile.id]?.[0] : undefined))
  useEffect(() => {
    if (done || !isTv || !profile) return // sem perfil ainda (login/sessao carregando): espera
    done = true
    if (profile.openLastChannel && last && pathname === '/') navigate(`/watch/live/${last}`, { replace: true })
  }, [profile, last, pathname, navigate])
  return null
}
