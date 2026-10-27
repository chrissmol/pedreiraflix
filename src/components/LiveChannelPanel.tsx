import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from './icons'
import { cleanCategoryName } from '../lib/channelGroups'
import { displayTitle } from '../lib/displayTitle'
import type { Category, LiveChannel } from '../types'

interface LiveChannelPanelProps {
  categories: Category[]
  channels: LiveChannel[]
  currentId: number
  onPick: (channel: LiveChannel) => void
  onClose: () => void
}

/** Lista de canais por cima do video no ao vivo (como o TiviMate): uma categoria por vez, para nao desenhar
 * milhares de canais de uma vez na TV. Cima/baixo andam na lista, esquerda/direita trocam de categoria, OK abre,
 * Voltar/Esc fecha. As teclas sao pegas antes do player, senao as setas tambem zapeariam o canal. */
export default function LiveChannelPanel({ categories, channels, currentId, onPick, onClose }: LiveChannelPanelProps) {
  const withChannels = useMemo(
    () => categories.filter((c) => channels.some((ch) => ch.categoryId === c.categoryId)),
    [categories, channels],
  )
  const currentCategory = channels.find((c) => c.streamId === currentId)?.categoryId
  const [index, setIndex] = useState(() => Math.max(0, withChannels.findIndex((c) => c.categoryId === currentCategory)))
  const category = withChannels[index]
  const list = useMemo(() => channels.filter((c) => c.categoryId === category?.categoryId), [channels, category])
  const listRef = useRef<HTMLUListElement>(null)

  // Foco no canal que esta passando (ou no primeiro da categoria nova), para o OK do controle ja ter onde cair.
  useEffect(() => {
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>('button')
    if (!items?.length) return
    const current = Array.from(items).find((b) => b.dataset.id === String(currentId))
    ;(current ?? items[0]).focus()
    ;(current ?? items[0]).scrollIntoView({ block: 'center' })
  }, [list, currentId])

  useEffect(() => {
    const step = (delta: number) => setIndex((i) => (i + delta + withChannels.length) % withChannels.length)
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') onClose()
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
      else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        const at = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = items[Math.min(items.length - 1, Math.max(0, at + (e.key === 'ArrowUp' ? -1 : 1)))]
        next?.focus()
        next?.scrollIntoView({ block: 'nearest' })
      } else if (e.key === 'Enter' && document.activeElement instanceof HTMLButtonElement && listRef.current?.contains(document.activeElement)) {
        document.activeElement.click() // o player tambem escuta o OK e cancelaria o clique do botao
      } else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [withChannels.length, onClose])

  return (
    <div className="absolute inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Lista de canais">
      <div className="flex h-full w-[85%] max-w-sm flex-col bg-black/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="flex items-center gap-1 border-b border-white/10 p-2">
          <button onClick={() => setIndex((i) => (i - 1 + withChannels.length) % withChannels.length)} aria-label="Categoria anterior" className="player-btn h-11 w-11 shrink-0" tabIndex={-1}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className="min-w-0 flex-1 truncate text-center text-body-md font-semibold text-white">{category ? cleanCategoryName(category.categoryName) : 'Canais'}</p>
          <button onClick={() => setIndex((i) => (i + 1) % withChannels.length)} aria-label="Próxima categoria" className="player-btn h-11 w-11 shrink-0" tabIndex={-1}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {list.map((ch) => (
            <li key={ch.streamId}>
              <button
                data-id={ch.streamId}
                onClick={() => onPick(ch)}
                aria-current={ch.streamId === currentId || undefined}
                className={`brand-focus flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-body-md focus:bg-white/15 ${
                  ch.streamId === currentId ? 'text-brand-300' : 'text-white'
                }`}
              >
                {ch.streamIcon && <img src={ch.streamIcon} alt="" loading="lazy" className="h-8 w-8 shrink-0 object-contain" />}
                <span className="min-w-0 truncate">{displayTitle(ch.name)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {/* Tocar fora da lista fecha (celular/computador). */}
      <button className="flex-1 bg-black/40" aria-label="Fechar lista de canais" onClick={onClose} tabIndex={-1} />
    </div>
  )
}
