import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { isInstalledApp, isTv } from '../lib/device'
import { useAuthStore } from '../store/auth'
import { useActiveProfile } from '../store/profiles'

// Suporte (menu da conta): os amigos do Christian contam o que esta acontecendo sem precisar mandar mensagem por fora.
// Vai para /api/feedback (worker/index.js), que guarda no KV FEEDBACK junto com perfil, aparelho e a pagina de onde veio.
const tipos = ['Problema', 'Sugestão', 'Outro'] as const

export default function SupportPage() {
  const from = (useLocation().state as { from?: string } | null)?.from
  const profile = useActiveProfile()
  const username = useAuthStore((s) => s.user?.username)
  const [tipo, setTipo] = useState<(typeof tipos)[number]>('Problema')
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<'editando' | 'enviando' | 'enviado' | 'erro'>('editando')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!texto.trim()) return
    setEstado('enviando')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tipo,
          texto: texto.trim(),
          perfil: profile?.name,
          conta: username,
          aparelho: isTv ? 'TV' : isInstalledApp ? 'App instalado' : 'Navegador',
          userAgent: navigator.userAgent,
          pagina: from || location.pathname,
        }),
      })
      setEstado(res.ok ? 'enviado' : 'erro')
    } catch {
      setEstado('erro')
    }
  }

  if (estado === 'enviado') {
    return (
      <div className="min-h-screen px-4 pb-16 pt-[calc(6rem+env(safe-area-inset-top))] sm:px-10">
        <h1 className="font-display text-headline-md text-white sm:text-headline-lg">Recebido, valeu!</h1>
        <p className="mb-6 mt-2 max-w-2xl text-body-md text-on-surface-variant">O Christian vai ler e ver o que dá para fazer.</p>
        <button
          autoFocus
          className="btn-secondary"
          onClick={() => {
            setTexto('')
            setEstado('editando')
          }}
        >
          Enviar outro
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 pb-16 pt-[calc(6rem+env(safe-area-inset-top))] sm:px-10">
      <h1 className="font-display text-headline-md text-white sm:text-headline-lg">Suporte</h1>
      <p className="mb-6 mt-2 max-w-2xl text-body-md text-on-surface-variant">
        Algo não funcionou ou tem uma ideia? Conte aqui o que aconteceu. O nome do perfil, o usuário da conta, o aparelho e a tela em que você estava vão juntos, e a mensagem é apagada depois de 180 dias.
      </p>
      <form onSubmit={enviar} className="max-w-2xl space-y-4">
        <div role="group" aria-label="Tipo" className="flex flex-wrap gap-2">
          {tipos.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tipo === t}
              onClick={() => setTipo(t)}
              className={tipo === t ? 'btn-primary' : 'btn-secondary'}
            >
              {t}
            </button>
          ))}
        </div>
        <label htmlFor="feedback-texto" className="sr-only">
          O que está acontecendo?
        </label>
        <textarea
          id="feedback-texto"
          required
          maxLength={2000}
          rows={6}
          placeholder="O que está acontecendo?"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className="brand-focus w-full rounded-xl border border-outline-soft bg-surface-container p-3.5 text-body-md text-white placeholder-on-surface-muted focus:border-brand-500/60"
        />
        {estado === 'erro' && (
          <p role="alert" className="text-body-sm text-live">
            Não deu para enviar agora. Confira a internet e tente de novo.
          </p>
        )}
        <button type="submit" disabled={estado === 'enviando' || !texto.trim()} className="btn-primary">
          {estado === 'enviando' ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
      {/* Atribuicao exigida pelos termos da API do TMDB (logo + aviso de nao endosso). */}
      <footer className="mt-12 flex max-w-2xl items-center gap-3 border-t border-outline-soft pt-6 text-body-sm text-on-surface-muted">
        <img src="/tmdb.svg" alt="TMDB" className="h-8 w-8 shrink-0" />
        <p>Sinopses, gêneros e imagens extras vêm do TMDB. Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.</p>
      </footer>
      {/* Fora da TV: la a seta para baixo saia do campo de texto direto para este link, pulando o Enviar.
          Na TV a pagina continua linkada na tela de login. */}
      {!isTv && (
        <a href="/sobre/privacidade.html" className="mt-4 inline-block text-body-sm text-on-surface-variant underline hover:text-white">
          Privacidade e termos de uso
        </a>
      )}
    </div>
  )
}
