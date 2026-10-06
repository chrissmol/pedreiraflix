/** Navegação por setas verticais entre blocos de conteúdo — o que um controle remoto de TV faz, e que o
 * navegador sozinho não oferece (Tab é uma fila única, não uma grade).
 *
 * De propósito só age quando o foco já está num elemento navegável do catálogo. Com o foco no corpo da
 * página, ↑/↓ seguem rolando a página como em qualquer site — hospedar isso globalmente sem essa guarda
 * quebraria a rolagem por teclado no desktop, que funciona hoje.
 *
 * O alvo é o elemento visível mais próximo na direção pedida, preferindo quem está alinhado na
 * horizontal: descer de um pôster leva ao pôster logo abaixo, não ao primeiro da fileira seguinte. */
const SELECTOR = '[data-spatial]'

function center(el: Element) {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r }
}

export function moveFocusVertically(direction: 'up' | 'down'): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !active.closest(SELECTOR)) return false

  const current = center(active)
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR)).filter((el) => {
    if (el === active || el.contains(active)) return false
    const { y, rect } = center(el)
    if (rect.width === 0 || rect.height === 0) return false
    // Precisa estar claramente acima/abaixo, não apenas deslocado por um pixel na mesma linha.
    const delta = y - current.y
    return direction === 'down' ? delta > 8 : delta < -8
  })
  if (candidates.length === 0) return false

  const best = candidates.reduce((winner, el) => {
    const a = center(el)
    const b = center(winner)
    // Distância vertical manda; a horizontal só desempata, para a coluna ser preservada ao descer.
    const scoreA = Math.abs(a.y - current.y) + Math.abs(a.x - current.x) * 0.5
    const scoreB = Math.abs(b.y - current.y) + Math.abs(b.x - current.x) * 0.5
    return scoreA < scoreB ? el : winner
  })

  best.focus()
  best.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  return true
}
