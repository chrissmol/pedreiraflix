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
  // O menu do topo conta: de la a seta para baixo entra no conteudo (antes nao fazia nada e o foco ficava preso no menu).
  if (!(active instanceof HTMLElement) || !(active.closest(SELECTOR) || active.closest('header nav'))) return false

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
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), [data-spatial]'

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight * 3) return false
  const cs = getComputedStyle(el)
  return cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[aria-hidden="true"], .sr-only')
}

// Fileira (Row.tsx marca o rolador com data-row): cima/baixo vao para o cartao da fileira vizinha que esta na mesma coluna
// da tela, como na Netflix, em vez de cair no que estiver mais perto por acaso. A coluna e lembrada por varias fileiras
// seguidas (passar por uma fileira curta nao faz o foco "escorregar" para a esquerda).
let column: { el: Element; x: number } | null = null
function moveAcrossRows(active: HTMLElement, direction: 'up' | 'down'): boolean {
  const own = active.parentElement
  if (!own?.matches('[data-row]')) return false
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-row]')).filter((r) => r.querySelector(FOCUSABLE) && visible(r))
  const i = rows.indexOf(own)
  const target = rows[i + (direction === 'down' ? 1 : -1)]
  if (i < 0 || !target) return false
  const x = column?.el === active ? column.x : center(active).x
  let best: HTMLElement | null = null
  let gap = Infinity
  for (const el of target.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    const c = center(el).x
    if (c < 0 || c > innerWidth) continue // so cartoes que aparecem na tela
    if (Math.abs(c - x) < gap) {
      best = el
      gap = Math.abs(c - x)
    }
  }
  if (!best) return false
  column = { el: best, x }
  best.focus()
  best.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  return true
}

// Ultimo item do conteudo que tinha o foco antes de ir para o menu lateral: Direita no menu volta para ele (como na Netflix),
// em vez de cair no cartao que estiver mais perto da altura do item do menu (que mandava de volta ao topo da tela).
let lastContent: HTMLElement | null = null

export function moveFocusTv(direction: 'up' | 'down' | 'left' | 'right', skip?: Element | null): boolean {
  // Painel aberto (Filtros): as setas andam so dentro dele, nao pelo catalogo escondido atras.
  const modal = document.querySelector('[aria-modal="true"]')
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => visible(el) && (!modal || modal.contains(el)))
  const active = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  if (!active || !all.includes(active)) {
    // Primeira seta: o primeiro item do conteudo (nao o logo do cabecalho).
    const first = all.find((el) => el.closest('#main-content') && el.getBoundingClientRect().top >= 0) ?? all[0]
    first?.focus()
    first?.scrollIntoView({ block: 'center', inline: 'nearest' })
    return !!first
  }
  if ((direction === 'up' || direction === 'down') && moveAcrossRows(active, direction)) return true
  // Menu lateral e a borda esquerda: dali para a esquerda nao ha nada (sem isso caia no avatar, mais a esquerda).
  if (direction === 'left' && active.closest('header')) return true
  if (direction === 'right' && active.closest('header') && lastContent && lastContent.isConnected && all.includes(lastContent)) {
    lastContent.focus()
    lastContent.scrollIntoView({ block: 'center', inline: 'nearest' })
    return true
  }
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
    if (el === active || el === skip || el.contains(active) || active.contains(el)) continue
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
    lastContent = active
  }
  best.focus()
  best.scrollIntoView({ block: 'center', inline: 'nearest' })
  return true
}

// --- TV: protecoes que so aparecem numa TV de verdade -----------------------------------------------------------
const TEXT_INPUT = /^(text|search|email|password|number|tel|url)$/
function editable(el: unknown): el is HTMLInputElement | HTMLTextAreaElement {
  return (el instanceof HTMLInputElement && TEXT_INPUT.test(el.type)) || el instanceof HTMLTextAreaElement
}

// Controles de TV (Tizen, webOS) as vezes mandam so o keyCode, com `key` vazio ou "Unidentified". Todo o app le `e.key`:
// no capture da janela, completa o `key` antes de qualquer outro tratador ver o evento.
const KEY_BY_CODE: Record<number, string> = {
  37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 13: 'Enter', 10009: 'GoBack', 461: 'GoBack',
  // Botoes de midia e de canal do controle (mesmos codigos na Samsung e na LG; 10xxx so na Samsung).
  415: 'MediaPlay', 19: 'MediaPause', 10252: 'MediaPlayPause', 413: 'MediaStop', 412: 'MediaRewind', 417: 'MediaFastForward',
  427: 'ChannelUp', 428: 'ChannelDown',
}
// Voltar da Samsung (10009) e da LG (461). No Android quem volta e o app nativo (MainActivity), sem tecla para a pagina.
const TV_BACK = [10009, 461]
type Tizen = { tvinputdevice?: { registerKeyBatch?: (keys: string[]) => void }; application?: { getCurrentApplication?: () => { exit: () => void } } }

// Navegador sem `gap` em flex (Chromium < 84, TVs Samsung antigas): botoes e textos ficavam colados. Copia o gap
// calculado para margens dos filhos. shortcut: so olha containers com classe gap-* e nao reage a mudar de classe depois.
function flexGapWorks() {
  const box = document.createElement('div')
  box.style.cssText = 'display:flex;gap:1px;position:absolute;visibility:hidden'
  box.innerHTML = '<i></i><i></i>'
  ;(box.firstChild as HTMLElement).style.width = (box.lastChild as HTMLElement).style.width = '1px'
  document.body.appendChild(box)
  const ok = box.scrollWidth === 3
  box.remove()
  return ok
}

function applyFlexGap(el: HTMLElement) {
  const cs = getComputedStyle(el)
  if (!cs.display.includes('flex')) return
  const gx = parseFloat(cs.columnGap) || 0
  const gy = parseFloat(cs.rowGap) || 0
  if (!gx && !gy) return
  const column = cs.flexDirection.startsWith('column')
  const wrap = cs.flexWrap !== 'nowrap'
  const kids = Array.from(el.children) as HTMLElement[]
  kids.forEach((k, i) => {
    if (wrap) {
      k.style.marginRight = `${gx}px`
      k.style.marginBottom = `${gy}px`
    } else if (i > 0) {
      if (column) k.style.marginTop = `${gy}px`
      else k.style.marginLeft = `${gx}px`
    }
  })
  if (wrap) {
    el.style.marginRight = `-${gx}px`
    el.style.marginBottom = `-${gy}px`
  }
}

function installFlexGap() {
  if (flexGapWorks()) return
  const run = (root: ParentNode) => {
    if (root instanceof HTMLElement && root.matches('[class*="gap-"]')) applyFlexGap(root)
    root.querySelectorAll<HTMLElement>('[class*="gap-"]').forEach(applyFlexGap)
  }
  new MutationObserver((list) => {
    for (const m of list) {
      m.addedNodes.forEach((n) => n instanceof HTMLElement && run(n))
      if (m.target instanceof HTMLElement && m.addedNodes.length && m.target.matches('[class*="gap-"]')) applyFlexGap(m.target)
    }
  }).observe(document.body, { childList: true, subtree: true })
  run(document.body)
}

export function installTvGuards() {
  window.addEventListener(
    'keydown',
    (e) => {
      const key = KEY_BY_CODE[e.keyCode]
      if (key && e.key !== key) Object.defineProperty(e, 'key', { value: key })
    },
    true,
  )
  installFlexGap() // main.tsx e modulo: roda com o <body> ja no DOM
  // Samsung: fora setas, OK e Voltar, a TV so entrega as teclas que o app registra (midia, canal e numeros).
  const tizen = (window as unknown as { tizen?: Tizen }).tizen
  try {
    tizen?.tvinputdevice?.registerKeyBatch?.(['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaRewind', 'MediaFastForward', 'ChannelUp', 'ChannelDown', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
  } catch {
    // tecla que o modelo da TV nao tem: fica sem ela
  }
  // Samsung e LG entregam o Voltar como tecla e esperam que o app resolva. So os paineis tratavam: fora deles o Voltar
  // nao fazia nada e nao dava nem para sair do player. Depois de todo mundo ver a tecla (setTimeout): quem tratou marcou
  // preventDefault; senao vale como Esc (fecha dialogo ou menu aberto) e, se ninguem quis, volta uma tela ou sai do app.
  window.addEventListener('keydown', (e) => {
    if (!TV_BACK.includes(e.keyCode)) return
    setTimeout(() => {
      if (e.defaultPrevented) return
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      if (!(document.activeElement ?? document.body).dispatchEvent(esc)) return
      if (history.state?.idx > 0) history.back()
      else if (tizen?.application?.getCurrentApplication) tizen.application.getCurrentApplication().exit()
      else window.close()
    })
  })
  // Campo de texto so abre o teclado da TV quando se aperta OK nele. Antes, so de passar pela busca com as setas o
  // teclado da tela subia, cobria metade da TV e empurrava a pagina (video do Christian numa TCL, 19/10).
  let reopening = false
  document.addEventListener('focusin', (e) => {
    const el = e.target
    if (reopening || !editable(el) || el.readOnly || 'tvOpen' in el.dataset) return // tvOpen: campo unico da tela (codigo do grupo), ja nasce digitavel
    el.readOnly = true
    el.dataset.tvLock = ''
  })
  document.addEventListener('focusout', (e) => {
    const el = e.target
    if (reopening || !editable(el) || !('tvLock' in el.dataset)) return
    el.readOnly = false
    delete el.dataset.tvLock
  })
  // OK (Enter) ou clique do ponteiro da TV: libera o campo e refaz o foco para o teclado subir. O navegador da Samsung
  // (Tizen) usa um cursor na tela, que clica sem mandar Enter: so com o keydown o campo ficava travado e sem teclado.
  function unlock(el: HTMLInputElement | HTMLTextAreaElement) {
    el.readOnly = false
    delete el.dataset.tvLock
    reopening = true // sai e volta o foco para o teclado abrir agora que o campo e editavel
    el.blur()
    el.focus()
    reopening = false
  }
  document.addEventListener(
    'keydown',
    (e) => {
      const el = e.target
      if (e.key !== 'Enter' || !editable(el) || !('tvLock' in el.dataset)) return
      e.preventDefault() // este OK so libera o campo; nao envia o formulario
      unlock(el)
    },
    true,
  )
  document.addEventListener('click', (e) => {
    const el = e.target
    if (editable(el) && 'tvLock' in el.dataset) unlock(el)
  })

  // A casca do app e o documento nunca rolam (so o <main> rola na vertical), mas o scrollIntoView das fileiras e o
  // teclado da TV conseguem rolar ate o que tem overflow hidden — e a tela inteira ficava deslocada, cortando o menu.
  document.addEventListener(
    'scroll',
    (e) => {
      const active = document.activeElement
      if (editable(active) && !('tvLock' in active.dataset)) return // digitando: o teclado pode precisar empurrar a tela
      const main = document.getElementById('main-content')
      const t = e.target === document ? document.scrollingElement : e.target
      if (!(t instanceof Element)) return
      if (t === main) {
        if (t.scrollLeft) t.scrollLeft = 0
      } else if (t === document.scrollingElement || t === document.body || (main && t.contains(main))) {
        if (t.scrollTop || t.scrollLeft) t.scrollTo(0, 0)
      }
    },
    true,
  )
}
