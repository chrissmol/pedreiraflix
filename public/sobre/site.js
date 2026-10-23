// Endereços de download. Preencha quando os arquivos estiverem publicados (ex.: GitHub Releases ou Drive).
// Vazio = o botão mostra "Em breve" e não leva a lugar nenhum.
const DOWNLOADS = {
  apk: '',
  windows: '',
}

for (const a of document.querySelectorAll('[data-dl]')) {
  const url = DOWNLOADS[a.dataset.dl]
  if (url) a.href = url
  else {
    a.textContent = 'Em breve'
    a.classList.add('off')
    a.removeAttribute('href')
    a.setAttribute('aria-disabled', 'true')
  }
}
for (const p of document.querySelectorAll('[data-dl-text]')) {
  const url = DOWNLOADS[p.dataset.dlText]
  if (url) p.textContent = url
}

// Entrada suave ao rolar, para baixo e para cima; sem JS ou com "reduzir movimento" tudo já aparece.
const itens = document.querySelectorAll('.reveal')
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('anim')
  const io = new IntersectionObserver((es) => {
    for (const e of es) e.target.classList.toggle('in', e.isIntersecting)
  }, { threshold: 0.15, rootMargin: '0px 0px -5% 0px' })
  itens.forEach((el, i) => { el.style.transitionDelay = `${(i % 3) * 80}ms`; io.observe(el) })
}
