import { useEffect, useRef, useState } from 'react'
import type { LiveChannel } from '../types'

const WAIT_MS = 1500

/** O canal com esse numero: o `num` do provedor; se a lista nao traz numero nenhum, a posicao dela (1 = o primeiro). */
export function channelByNumber(channels: LiveChannel[], n: number): LiveChannel | undefined {
  if (channels.some((c) => c.num)) return channels.find((c) => c.num === n)
  return n >= 1 ? channels[n - 1] : undefined
}

/** Digitar o numero do canal no controle da TV ou no teclado: os digitos se juntam e, 1,5 s depois do ultimo, abre o
 * canal. Devolve o que ja foi digitado (para mostrar na tela) e se o ultimo numero nao existe. Ignora digitos num
 * campo de texto. */
export function useChannelNumber(channels: LiveChannel[], onPick: (channel: LiveChannel) => void, enabled = true) {
  const [typed, setTyped] = useState('')
  const [missing, setMissing] = useState<string | null>(null)
  const typedRef = useRef('')
  const pickRef = useRef(onPick)
  useEffect(() => {
    pickRef.current = onPick
  })

  useEffect(() => {
    if (!enabled || channels.length === 0) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let missingTimer: ReturnType<typeof setTimeout> | undefined
    function onKey(e: KeyboardEvent) {
      if (!/^[0-9]$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      e.preventDefault()
      typedRef.current = (typedRef.current + e.key).slice(-5)
      setTyped(typedRef.current)
      setMissing(null)
      clearTimeout(timer)
      timer = setTimeout(() => {
        const value = typedRef.current
        typedRef.current = ''
        setTyped('')
        const channel = channelByNumber(channels, Number(value))
        if (channel) pickRef.current(channel)
        else {
          setMissing(value)
          clearTimeout(missingTimer)
          missingTimer = setTimeout(() => setMissing(null), 2500)
        }
      }, WAIT_MS)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(timer)
      clearTimeout(missingTimer)
    }
  }, [channels, enabled])

  return { typed, missing }
}
