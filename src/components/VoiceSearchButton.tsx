import { useEffect, useState } from 'react'
import { Mic } from './icons'
import { ouvir, vozDisponivel } from '../lib/voz'

/** Microfone ao lado do campo de busca: fala o nome e a busca acontece. Some onde o aparelho nao consegue ouvir. */
export default function VoiceSearchButton({ onResult, className = '' }: { onResult: (text: string) => void; className?: string }) {
  const [ok, setOk] = useState(false)
  const [listening, setListening] = useState(false)
  useEffect(() => {
    let cancelled = false
    vozDisponivel().then((v) => !cancelled && setOk(v))
    return () => {
      cancelled = true
    }
  }, [])
  if (!ok) return null
  return (
    <button
      type="button"
      aria-label={listening ? 'Ouvindo…' : 'Buscar por voz'}
      title={listening ? 'Ouvindo…' : 'Buscar por voz'}
      aria-pressed={listening}
      disabled={listening}
      onClick={async () => {
        setListening(true)
        const text = await ouvir()
        setListening(false)
        if (text) onResult(text)
      }}
      className={`brand-focus flex items-center justify-center rounded-full transition-colors ${listening ? 'animate-pulse bg-brand-500/20 text-brand-300' : 'text-on-surface-muted hover:text-white'} ${className}`}
    >
      <Mic className="h-5 w-5" />
    </button>
  )
}
