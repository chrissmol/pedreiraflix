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
  // Ate 3 telas acima ou abaixo: so "abaixo" deixava o foco preso ao subir depressa (a rolagem suave ainda nao tinha
  // trazido a linha de cima para a tela).
  if (r.width < 2 || r.height < 2 || r.bottom < -innerHeight * 3 || r.top > innerHeight * 3) return false
  const cs = getComputedStyle(el)
  return cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[aria-hidden="true"], .sr-only')
}

// Grupos de foco, como nos apps de streaming: uma fileira (Row.tsx marca o rolador com data-row) ou uma coluna/lista
// (data-nav-group) conta como um bloco so para quem vem de fora, e ao entrar o foco volta para o item em que estava da
// ultima vez (na fileira nunca visitada, o primeiro cartao). Antes o alvo era "o cartao mais perto na tela": com fileiras
// roladas em pontos diferentes, ou com a rolagem suave ainda no meio do caminho, descer ou subir mudava de coluna sozinho.
const GROUP = '[data-row], [data-nav-group]'
const remembered = new WeakMap<Element, HTMLElement>()

function enterGroup(group: Element, from: DOMRect, direction: 'up' | 'down' | 'left' | 'right'): HTMLElement | null {
  const kept = remembered.get(group)
  if (kept && group.contains(kept) && visible(kept)) return kept
  const items = Array.from(group.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.tabIndex >= 0 && visible(el))
  if (group.matches('[data-row]')) return items[0] ?? null
  // Vindo do lado: a lista de canais (data-enter-first) cai no PRIMEIRO item (antes caia no mais perto da altura da categoria,
  // que era o segundo canal) e a lista de categorias (data-enter-selected) na categoria aberta. Outros grupos, como a coluna
  // de botoes do player, seguem pelo item na altura de onde se veio.
  if (direction === 'right' && group.matches('[data-enter-first]')) return items[0] ?? null
  if (direction === 'left' && group.matches('[data-enter-selected]')) return items.find((el) => el.matches('[aria-pressed="true"], [aria-current]')) ?? items[0] ?? null
  // Lista: o item na altura de onde se veio.
  const y = from.top + from.height / 2
  return items.reduce<HTMLElement | null>((best, el) => (!best || Math.abs(center(el).y - y) < Math.abs(center(best).y - y) ? el : best), null)
}

// Ultimo item do conteudo que tinha o foco antes de ir para o menu lateral: Direita no menu volta para ele (como na Netflix),
// em vez de cair no cartao que estiver mais perto da altura do item do menu (que mandava de volta ao topo da tela).
let lastContent: HTMLElement | null = null

export function moveFocusTv(direction: 'up' | 'down' | 'left' | 'right', skip?: Element | null): boolean {
  // Painel aberto (Filtros): as setas andam so dentro dele, nao pelo catalogo escondido atras.
  const modal = document.querySelector('[aria-modal="true"]')
  const all = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.tabIndex >= 0 && visible(el) && (!modal || modal.contains(el)))
  const active = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
  const first = () => all.find((el) => el.closest('#main-content') && el.getBoundingClientRect().top >= 0) ?? all[0]
  const go = (el: HTMLElement | null | undefined) => {
    el?.focus()
    el?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    return !!el
  }
  // Primeira seta: o primeiro item do conteudo (nao o logo do cabecalho).
  if (!active || !all.includes(active)) return go(first())
  const own = active.closest(GROUP)
  if (own) remembered.set(own, active)
  const horizontal = direction === 'left' || direction === 'right'
  // O menu lateral fica ao lado do conteudo: do conteudo so se entra nele pela esquerda (subir/descer no fim da pagina
  // nao cai no menu), dentro dele so se anda na vertical e a direita volta para onde se estava no conteudo.
  const fromContent = !!active.closest('#main-content')
  const inMenu = !!active.closest('header')
  if (inMenu && direction === 'left') return true // borda esquerda: dali para a esquerda nao ha nada
  if (inMenu && direction === 'right') return go(lastContent && all.includes(lastContent) ? lastContent : all.find((el) => el.closest('#main-content')))

  // Geometria pelas bordas, nao pelos centros: so conta quem esta inteiro adiante na direcao pedida (a folga de 8px cobre
  // o cartao focado, que cresce um pouco), a distancia e o vao entre as bordas e quem esta na mesma linha/coluna vence.
  const from = active.getBoundingClientRect()
  const sign = direction === 'down' || direction === 'right' ? 1 : -1
  const seen = new Set<Element>()
  let best: Element | null = null
  let bestScore = Infinity
  for (const el of all) {
    if (el === active || el === skip || el.contains(active) || active.contains(el)) continue
    const inHeader = !!el.closest('header')
    if (fromContent ? inHeader : inMenu && !inHeader) continue
    const group = el.closest(GROUP)
    const target = group && group !== own ? group : el
    if (seen.has(target)) continue
    seen.add(target)
    const to = target.getBoundingClientRect()
    let main = horizontal ? (sign > 0 ? to.left - from.right : from.left - to.right) : sign > 0 ? to.top - from.bottom : from.top - to.bottom
    // Bordas que se sobrepoem (quadros do mosaico encostados, o microfone dentro do campo de busca): vale o centro.
    const overlap = horizontal ? to.left < from.right && to.right > from.left : to.top < from.bottom && to.bottom > from.top
    if (main < -8 && overlap) {
      const entre = (horizontal ? to.left + to.width / 2 - from.left - from.width / 2 : to.top + to.height / 2 - from.top - from.height / 2) * sign
      // So vale se o alvo avanca de verdade naquela direcao (quadro vizinho encostado) ou esta todo dentro do atual
      // (o microfone dentro do campo de busca). Sem isso, um botao atras de um quadro grande "parecia" estar ao lado.
      const avanca = (horizontal ? (sign > 0 ? to.right - from.right : from.left - to.left) : sign > 0 ? to.bottom - from.bottom : from.top - to.top) > 8
      const dentro = to.left >= from.left && to.right <= from.right && to.top >= from.top && to.bottom <= from.bottom
      // Com folga de 8px: o cartao focado cresce (scale 1.07) e encostava 4px na barra de cima, e com a fonte do CI
      // um botao da barra "parecia" vizinho de lado. Sobrepor de verdade nos dois eixos, nao so o respingo do foco.
      const cruzado = horizontal ? to.top < from.bottom - 8 && to.bottom > from.top + 8 : to.left < from.right - 8 && to.right > from.left + 8
      main = entre > 8 && cruzado && (avanca || dentro) ? entre : -9 // sem sobrepor tambem no outro eixo, seria um salto diagonal
    }
    if (main < -8) continue
    const cross = Math.max(0, horizontal ? Math.max(to.top - from.bottom, from.top - to.bottom) : Math.max(to.left - from.right, from.left - to.right))
    // Para o lado so vale a mesma linha: no fim da linha a seta nao faz nada, em vez de cair na linha de baixo ou de cima.
    // Um grupo ao lado (lista de categorias ao lado dos canais) vale em qualquer altura.
    if (horizontal && target === el && cross > from.height) continue
    const off = horizontal ? to.top + to.height / 2 - (from.top + from.height / 2) : to.left + to.width / 2 - (from.left + from.width / 2)
    const score = Math.max(0, main) + cross * 3 + Math.abs(off) * 0.01
    if (score < bestScore) {
      best = target
      bestScore = score
    }
  }
  if (!best) {
    // Do conteudo para o menu lateral (TopNav na TV): cai na secao aberta, e o menu lembra de onde se saiu.
    if (direction !== 'left' || !fromContent) return false
    const menu = document.querySelector<HTMLElement>('header [aria-current="page"]') ?? all.find((el) => el.closest('header'))
    if (menu) lastContent = active
    return go(menu)
  }
  return go(best instanceof HTMLElement && all.includes(best) ? best : enterGroup(best, from, direction))
}

// Entrar no conteudo depois de OK no menu, numa categoria ou numa pagina nova: o foco vai sozinho para o primeiro item,
// sem o "OK e depois seta para a direita". Espera a tela assentar (150 ms sem mudar o DOM ou 1,2 s, vigiando ate 8 s: filmes e canais
// chegam aos poucos) e desiste se a pessoa apertar uma seta antes. `selector` escolhe o alvo (senao, o 1o item do conteudo).
let cancelEnter = () => {}
export function tvEnter(selector?: string) {
  cancelEnter()
  const main = document.getElementById('main-content')
  if (!main) return
  const deadline = Date.now() + 8000
  let timer = 0
  let late = 0
  let focused = false // depois de dado, segue de olho: a tela ainda pode trocar os cartoes (catalogo chegando) e levar o foco embora
  const stop = () => {
    clearTimeout(timer)
    clearTimeout(late)
    observer.disconnect()
    window.removeEventListener('keydown', onKey, true)
  }
  const onKey = (e: KeyboardEvent) => e.key.startsWith('Arrow') && stop()
  const settle = () => {
    const active = document.activeElement
    const editing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
    const lost = !active || active === document.body
    if (focused) return Date.now() > deadline ? stop() : lost ? tryFocus() : undefined
    // Sem seletor (troca de pagina): quem ja tem foco na pagina (campo da busca, autoFocus) nao e tirado de la.
    if (editing || (!selector && !lost && main.contains(active))) return stop()
    tryFocus()
  }
  const tryFocus = () => {
    const pool = Array.from((selector ? document : main).querySelectorAll<HTMLElement>(selector ?? FOCUSABLE))
    const el = pool.find((e) => e.tabIndex >= 0 && visible(e) && !e.closest('header') && (selector || e.getBoundingClientRect().top >= 0))
    if (el) {
      el.focus()
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      focused = true
    } else if (Date.now() >= deadline) stop()
  }
  const arm = () => {
    clearTimeout(timer)
    timer = window.setTimeout(settle, 150)
  }
  const observer = new MutationObserver(arm)
  observer.observe(main, { childList: true, subtree: true })
  window.addEventListener('keydown', onKey, true)
  cancelEnter = stop
  late = window.setTimeout(settle, 1200) // tela que nao para de mudar (catalogo chegando) tambem recebe o foco
  arm()
  window.setTimeout(() => cancelEnter === stop && stop(), 8200)
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
  // OK num item marcado com data-tv-enter (categoria, filtro): o foco vai para o primeiro resultado.
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-tv-enter]') : null
    if (t) tvEnter(t.getAttribute('data-tv-enter') || undefined)
  }, true) // captura: paineis que chamam stopPropagation no clique (Filtros) nao chegam ao document
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
