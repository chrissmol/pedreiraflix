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
    if (toque && el.matches('button, a, input') && (r.width < 32 || r.height < 32)) out.push(`alvo pequeno para o dedo: "${nome(el)}" ${Math.round(r.width)}x${Math.round(r.height)}px`)
  }
  const cab = document.querySelector('header')?.getBoundingClientRect()
  for (const h of document.querySelectorAll('h1, h2')) {
    if (!cab || !visivel(h)) continue
    const r = h.getBoundingClientRect()
    if (r.top < cab.bottom - 4 && r.bottom > cab.top && document.querySelector('#main-content')?.scrollTop === 0) out.push(`titulo "${nome(h)}" por baixo do cabecalho`)
  }
  for (const el of document.querySelectorAll('h1, h2, h3, button, a, p, span')) {
    if (!visivel(el) || el.children.length) continue
    const t = el.textContent.trim()
    if (/\[[A-Z0-9 +]{1,8}\]|[★⚽]\s*[A-ZÀ-Ú]{3,}|\((\d{4})\)\s*\(\1\)/.test(t)) out.push(`enfeite do provedor aparecendo: "${t.slice(0, 50)}"`)
  }
  return [...new Set(out)].slice(0, 15)
}
