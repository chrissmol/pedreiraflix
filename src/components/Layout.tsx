import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { isTv } from '../lib/device'
import { moveFocusTv, moveFocusVertically } from '../lib/spatialNav'
import MobileNav from './MobileNav'
import TopNav from './TopNav'
import UpdatePrompt from './UpdatePrompt'
import OfflineBanner from './OfflineBanner'

// Per-history-entry scroll offsets. Deliberately module scope, not a store: this is throwaway UI state
// for the current page session (a reload starts a fresh history anyway), not something to persist.
const scrollOffsets = new Map<string, number>()

export default function Layout() {
  // Altura medida, nao `dvh`: no iPhone com o app na tela de inicio o WebKit calcula `100dvh` menor que a
  // area realmente visivel, e como o menu flutuante e ancorado no fim deste shell ele nascia no meio da
  // tela, com conteudo passando por baixo (foi o que o video mostrou). `innerHeight` e medido de fato, e
  // de proposito nao e `visualViewport.height`: esse encolhe quando o teclado abre, o que faria o menu
  // pular para cima enquanto se digita na busca.
  //
  // E no iPhone instalado nem `innerHeight` serve: com a barra de status `black-translucent` ele vem menor
  // que a tela (some a altura da barra de status), deixando uma faixa preta embaixo e o menu alto (print do
  // Christian de 08/10). Instalado (`navigator.standalone`, so existe no iOS) nao ha barra do navegador, entao
  // a altura do app e a da tela inteira; o iOS nao troca `screen.width/height` ao girar, dai o min/max.
  useEffect(() => {
    const appHeight = () => {
      if (!(navigator as Navigator & { standalone?: boolean }).standalone) return window.innerHeight
      const landscape = window.matchMedia('(orientation: landscape)').matches
      return landscape ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height)
    }
    const apply = () => document.documentElement.style.setProperty('--app-h', `${appHeight()}px`)
    apply()
    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)
    return () => {
      window.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', apply)
    }
  }, [])

  const sessionWarning = useAuthStore((s) => s.sessionWarning)
  const dismissWarning = useAuthStore((s) => s.dismissWarning)
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  // The router keeps the old scroll offset, so a new page would open halfway down. `body` itself never
  // scrolls (see index.css) — `<main>` below is the actual scrollable element now, so that's what gets
  // reset, not `window`.
  //
  // Except on Back/Forward: every native app (and every browser, for normal page scrolling) returns you
  // to where you were in the list, instead of to the top. React Router reports that as navigationType
  // 'POP', and each history entry gets its own `key`, which is what the saved offset is stored under.
  // Setas verticais movem o foco entre fileiras/cartoes quando ele ja esta no catalogo — o gesto de um
  // controle remoto de TV, e util tambem para quem navega so de teclado no desktop. Fora do catalogo as
  // setas seguem rolando a pagina normalmente (ver lib/spatialNav).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      if (isTv) {
        const dirs: Record<string, 'up' | 'down' | 'left' | 'right'> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
        const dir = dirs[e.key]
        if (!dir) return
        // Digitando num campo (busca), esquerda/direita movem o cursor do texto.
        const typing = document.activeElement instanceof HTMLInputElement && (dir === 'left' || dir === 'right')
        if (!typing && moveFocusTv(dir)) e.preventDefault()
        return
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      if (moveFocusVertically(e.key === 'ArrowUp' ? 'up' : 'down')) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const navigationType = useNavigationType()
  const { key } = useLocation()
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    const target = navigationType === 'POP' ? (scrollOffsets.get(key) ?? 0) : 0
    main.scrollTo(0, target)

    // The page we came back to re-renders from scratch and its rows arrive one category at a time, so at
    // this point it is usually still too short to scroll that far and the line above silently clamps to 0.
    // Re-applied every frame until it sticks, with a deadline, and stopped at the first real user scroll
    // so it never fights the person.
    //
    // Deliberately not a ResizeObserver: `<main>` itself never changes size, and the only other thing to
    // observe is whatever child exists right now — which, while the route's chunk is still loading, is
    // the Suspense fallback. React swaps that node out for the real page, leaving the observer watching a
    // detached element that will never resize again. That is exactly what made this fail on CI (slow
    // enough to render the fallback first) while passing locally.
    // Enquanto a restauracao rola a pagina, o que se grava NAO pode ser a posicao intermediaria: o
    // proprio scrollTo dispara `scroll`, e gravar ali substituia a posicao guardada (400) pelo valor
    // ainda baixo do meio do caminho (0). Qualquer re-execucao do efeito depois disso — StrictMode em
    // dev, ou uma troca de chave — lia esse 0 e a lista voltava ao topo.
    let restoring = false
    let frame = 0
    if (target > 0 && main.scrollTop < target) {
      // Generoso de proposito: o catalogo chega categoria a categoria e numa maquina carregada a pagina
      // demora alguns segundos para voltar a ter altura. Ainda assim limitado, e qualquer rolagem do
      // usuario encerra antes.
      const deadline = Date.now() + 10_000
      const stop = () => {
        cancelAnimationFrame(frame)
        frame = 0
        restoring = false
        main.removeEventListener('wheel', stop)
        main.removeEventListener('touchstart', stop)
      }
      const tick = () => {
        if (main.scrollTop >= target || Date.now() > deadline) return stop()
        main.scrollTo(0, target)
        frame = requestAnimationFrame(tick)
      }
      restoring = true
      frame = requestAnimationFrame(tick)
      main.addEventListener('wheel', stop, { passive: true, once: true })
      main.addEventListener('touchstart', stop, { passive: true, once: true })
    }

    // Recorded as it scrolls, not on the way out: the app has a single Suspense boundary (App.tsx), so
    // navigating to a lazy route unmounts this whole subtree first — by cleanup time `<main>` is already
    // detached from the document and every detached element reports scrollTop 0.
    const remember = () => {
      if (restoring) return
      // Nem todo `scroll` e do usuario. Ao sair desta rota, o Suspense troca o conteudo pelo fallback
      // antes do desmonte: a area encolhe, o navegador grampeia scrollTop para o novo maximo e dispara
      // `scroll`. Gravar isso substituia a posicao real (400) por 0, e era exatamente o que fazia a lista
      // voltar ao topo. Um grampeamento assim se reconhece por estar no fim de uma area que encolheu
      // abaixo do que ja estava guardado; rolar ate o topo de proposito nao casa com isso.
      const max = main.scrollHeight - main.clientHeight
      if (main.scrollTop === max && max < (scrollOffsets.get(key) ?? 0)) return
      scrollOffsets.set(key, main.scrollTop)
    }
    main.addEventListener('scroll', remember, { passive: true })

    return () => {
      if (frame) cancelAnimationFrame(frame)
      main.removeEventListener('scroll', remember)
      // Belt and braces: a `scroll` event can still be pending when a click navigates away, so the
      // listener above may never have run for the last position. Reading here covers that, and is
      // skipped when the element is already detached (every detached element reports scrollTop 0).
      if (main.isConnected && main.scrollTop > 0) remember()
    }
  }, [pathname, navigationType, key])

  return (
    // `h-dvh` (dynamic viewport height), not `min-h-screen`/`100vh`: this outer frame is sized to the
    // real visible viewport and never scrolls itself — `<main>` is the one scrollable element on the
    // page (see the index.css comment on `html, body { overflow: hidden }` for why). It's also the
    // `position: relative` anchor every overlay in here (`TopNav`, `MobileNav`, the session-warning
    // banner) positions itself against with `absolute`, not `fixed` — see the comment on `TopNav`'s
    // header and `MobileNav`'s nav for why `fixed` specifically was still wrong on an iOS PWA even after
    // `body` stopped scrolling.
    <div className="relative h-[var(--app-h,100dvh)] overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Off-screen until focused (Tab from the very top of the page) — lets keyboard users jump past
          the header/nav straight to the page content instead of tabbing through every nav link first. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-[calc(0.75rem+env(safe-area-inset-top))] focus:z-[100] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <TopNav />
      {sessionWarning && (
        <div className="absolute inset-x-0 top-14 z-40 flex items-center justify-between gap-3 bg-rating/95 px-4 py-2 text-label-md text-black sm:top-16">
          <span>{sessionWarning}</span>
          <button onClick={dismissWarning} className="shrink-0 rounded px-2 py-0.5 hover:bg-black/10">
            ✕
          </button>
        </div>
      )}
      <main
        id="main-content"
        ref={mainRef}
        className="h-full overflow-y-auto overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0"
      >
        <Outlet />
      </main>
      <MobileNav />
      {/* In Layout, not App: it anchors against this shell like the header and nav do, and the watch
          screen (outside Layout) deliberately stays free of chrome while something is playing. */}
      <UpdatePrompt />
      <OfflineBanner />
    </div>
  )
}
