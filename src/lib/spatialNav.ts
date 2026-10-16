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

// --- TV: as quatro setas andam por tudo que e clicavel (cabecalho, filtros, botoes, posteres) -----------------
// No computador continua so o vertical acima: la as setas tambem rolam a pagina e o Tab existe. Na TV o controle
// remoto so tem setas e OK, entao a primeira seta ja da o foco (nada comeca focado) e da para chegar em tudo.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [data-spatial]'

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight * 3) return false
  const cs = getComputedStyle(el)
  return cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[aria-hidden="true"], .sr-only')
}

export function moveFocusTv(direction: 'up' | 'down' | 'left' | 'right'): boolean {
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible)
  const active = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  if (!active || !all.includes(active)) {
    // Primeira seta: o primeiro item do conteudo (nao o logo do cabecalho).
    const first = all.find((el) => el.closest('#main-content') && el.getBoundingClientRect().top >= 0) ?? all[0]
    first?.focus()
    first?.scrollIntoView({ block: 'center', inline: 'nearest' })
    return !!first
  }
  // Menu lateral e a borda esquerda: dali para a esquerda nao ha nada (sem isso caia no avatar, mais a esquerda).
  if (direction === 'left' && active.closest('header')) return true
  const from = center(active)
  const horizontal = direction === 'left' || direction === 'right'
  const sign = direction === 'down' || direction === 'right' ? 1 : -1
  let best: HTMLElement | null = null
  let bestScore = Infinity
  // O menu lateral fica ao lado do conteudo: do conteudo so se entra nele pela esquerda (subir/descer no fim da pagina
  // nao cai no menu) e do menu a direita sempre vai para o conteudo (nao para a busca, que fica no proprio menu).
  const fromContent = !!active.closest('#main-content')
  const inMenu = !!active.closest('header')
  for (const el of all) {
    if (el === active || el.contains(active) || active.contains(el)) continue
    if (el.closest('header') && (inMenu ? horizontal : fromContent && !horizontal)) continue
    const to = center(el)
    const main = (horizontal ? to.x - from.x : to.y - from.y) * sign
    if (main <= 8) continue // so quem esta de fato naquela direcao
    const cross = Math.abs(horizontal ? to.y - from.y : to.x - from.x)
    const score = main + cross * 2 // alinhado vence: andar para o lado fica na mesma linha
    if (score < bestScore) {
      best = el
      bestScore = score
    }
  }
  if (!best) return false
  // Do conteudo para o menu lateral (TopNav na TV): cai na secao aberta, nao no item do menu mais perto na altura.
  if (horizontal && fromContent && best.closest('header')) {
    best = document.querySelector<HTMLElement>('header [aria-current="page"]') ?? best
  }
  best.focus()
  best.scrollIntoView({ block: 'center', inline: 'nearest' })
  return true
}
