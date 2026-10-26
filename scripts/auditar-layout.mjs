// Checagens de layout de uma tela, rodadas dentro da pagina (page.evaluate): algo saindo da tela, rolagem para o
// lado, titulo por baixo do cabecalho, enfeite do provedor e, em tela de toque, barra de rolagem e alvo pequeno.
// Usado pelo estressar-apk e pelo estressar-web.
export function auditarLayout({ toque }) {
  const out = []
  const W = innerWidth
  const visivel = (el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    // > 2px: o link "Pular para o conteudo" (sr-only) fica com 1x1 de proposito ate receber foco.
    return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
  }
  // Dentro de fileira que rola para o lado, ficar fora da tela e normal.
  const emRolagemLateral = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth) return true
    }
    return false
  }
  const nome = (el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40)
  const main = document.getElementById('main-content')
  if (document.documentElement.scrollWidth > W + 1 || (main && main.scrollWidth > main.clientWidth + 1)) out.push('a pagina rola para o lado')
  if (toque && main && main.offsetWidth - main.clientWidth > 0) out.push(`barra de rolagem vertical visivel (${main.offsetWidth - main.clientWidth}px) numa tela de toque`)
  for (const el of document.querySelectorAll('header *, nav *, h1, h2, button, a, input')) {
    if (!visivel(el) || emRolagemLateral(el)) continue
    const r = el.getBoundingClientRect()
    if (r.right > W + 1 || r.left < -1) out.push(`"${nome(el)}" sai da tela (${Math.round(r.left)}..${Math.round(r.right)} de ${W}px)`)
    // Checkbox dentro de um <label> grande: o dedo acerta a linha inteira.
    const alvo = el.matches('input') && el.closest('label') ? el.closest('label').getBoundingClientRect() : r
    if (toque && el.matches('button, a, input') && (alvo.width < 32 || alvo.height < 32)) out.push(`alvo pequeno para o dedo: "${nome(el)}" ${Math.round(r.width)}x${Math.round(r.height)}px`)
  }
  const cab = document.querySelector('header')?.getBoundingClientRect()
  for (const h of document.querySelectorAll('h1, h2')) {
    if (!cab || !visivel(h)) continue
    const r = h.getBoundingClientRect()
    if (r.top < cab.bottom - 4 && r.bottom > cab.top && r.left < cab.right && r.right > cab.left && document.querySelector('#main-content')?.scrollTop === 0) out.push(`titulo "${nome(h)}" por baixo do cabecalho`)
  }
  for (const el of document.querySelectorAll('h1, h2, h3, button, a, p, span')) {
    if (!visivel(el) || el.children.length) continue
    const t = el.textContent.trim()
    if (/\[[A-Z0-9 +]{1,8}\]|[★⚽]\s*[A-ZÀ-Ú]{3,}|\((\d{4})\)\s*\(\1\)/.test(t)) out.push(`enfeite do provedor aparecendo: "${t.slice(0, 50)}"`)
  }
  // Texto cortado no meio, sem reticencias: o elemento (ou um pai com overflow hidden, ex.: whitespace-nowrap num
  // cartao) esconde o que sobra sem avisar que tem mais. So conta o corte que aparece na tela: borda de corte
  // dentro da janela e nao escondida atras de coluna fixa (guia rolado para o lado).
  const naTela = (box, dono) => {
    const x = box.right - 2
    const y = box.top + box.height / 2
    if (box.left < 0 || x > W || y < 0 || y > innerHeight) return false
    const topo = document.elementFromPoint(x, y)
    return !!topo && (dono.contains(topo) || topo.contains(dono))
  }
  for (const el of document.querySelectorAll('h1, h2, h3, h4, p, span, a, button, div')) {
    if (!visivel(el) || [...el.childNodes].every((n) => n.nodeType !== 3 || !n.textContent.trim())) continue
    const cs = getComputedStyle(el)
    if (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' || el.scrollWidth <= el.clientWidth + 1) continue
    let corte = cs.overflowX !== 'visible' ? el : null
    for (let p = el.parentElement; !corte && p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (/auto|scroll/.test(ox)) break
      if (/hidden|clip/.test(ox)) corte = p
    }
    if (!corte) continue
    const box = corte.getBoundingClientRect()
    if (el.getBoundingClientRect().left + el.scrollWidth > box.right + 1 && naTela(box, corte)) out.push(`texto cortado sem reticencias: "${nome(el)}"`)
  }
  // Alvo coberto: no centro de um botao/link visivel quem aparece e outro elemento (sem contar filhos dele).
  for (const el of document.querySelectorAll('button, a, input, [role="button"]')) {
    if (!visivel(el) || emRolagemLateral(el)) continue
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    if (x < 0 || y < 0 || x > W || y > innerHeight) continue
    const topo = document.elementFromPoint(x, y)
    // Conteudo rolando por baixo do cabecalho/barra fixa e normal; e quem cobre e clicavel (cursor de mao) leva o
    // clique para a mesma linha (padrao da lista de episodios).
    const fixo = (n) => {
      for (; n; n = n.parentElement) if (/fixed|sticky/.test(getComputedStyle(n).position)) return true
      return false
    }
    // Menu/dialogo aberto e barras fora do conteudo (cabecalho, navegacao de baixo) cobrem o conteudo de proposito.
    const sobreposto = topo?.closest('[role="dialog"], [role="menu"], [aria-modal="true"]') || (main?.contains(el) && !main.contains(topo))
    if (topo && !el.contains(topo) && !topo.contains(el) && !(fixo(topo) && !fixo(el)) && !sobreposto && getComputedStyle(topo).cursor !== 'pointer') {
      out.push(`"${nome(el)}" esta coberto por "${nome(topo)}"`)
    }
  }
  return [...new Set(out)].slice(0, 25)
}
