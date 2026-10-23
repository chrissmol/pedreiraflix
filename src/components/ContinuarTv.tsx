import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { continuarTv as plugin, itensTv } from '../lib/continuarTv'
import { progressFor, useLibraryStore } from '../store/library'
import { useActiveProfileId } from '../store/profiles'

export default function ContinuarTv() {
  const navigate = useNavigate()
  const profileId = useActiveProfileId()
  const progressRecord = useLibraryStore((s) => s.progress)
  const itens = useMemo(() => itensTv(progressFor(progressRecord, profileId), location.origin), [progressRecord, profileId])

  // App aberto por um item da fileira: vai direto para o video.
  useEffect(() => {
    plugin?.pendente().then(({ path }) => path && navigate(path, { replace: true })).catch(() => {})
  }, [navigate])

  // O progresso muda a cada poucos segundos durante o video: so manda depois de 5 s parado.
  const chave = JSON.stringify(itens)
  useEffect(() => {
    const tv = plugin
    if (!tv) return
    const t = setTimeout(() => tv.atualizar({ itens: JSON.parse(chave) }).catch(() => {}), 5000)
    return () => clearTimeout(t)
  }, [chave])
  return null
}
