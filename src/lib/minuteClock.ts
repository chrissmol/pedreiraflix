import { useSyncExternalStore } from 'react'

// Um relogio de 1 minuto para a tela inteira. Antes cada card de canal ao vivo criava o proprio setInterval
// (centenas numa lista longa); agora ha um so, que nasce com o primeiro card e morre com o ultimo.
let now = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    now = Date.now() // volta de uma pausa longa: nao mostra a hora de quando o ultimo card saiu da tela
    timer = setInterval(() => {
      now = Date.now()
      listeners.forEach((l) => l())
    }, 60_000)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) clearInterval(timer)
  }
}

const noSubscribe = () => () => {}

/** "Agora", atualizado a cada minuto. `active = false` nao assina o relogio (card sem programa nao precisa). */
export function useMinuteClock(active = true): number {
  return useSyncExternalStore(
    active ? subscribe : noSubscribe,
    () => now,
    () => now,
  )
}

/** So para teste: quantos cards estao assinando o relogio agora. */
export const clockListenerCount = () => listeners.size
