import { useState } from 'react'
import { useXtream } from '../hooks/useXtream'
import { XtreamClient } from '../lib/xtream'
import ConfirmDialog from '../components/ConfirmDialog'
import { clearAllCaches } from '../lib/cache'
import { isTv } from '../lib/device'
import { routeToStereo } from '../components/useVideoPlayerEffects'

// Diagnostico de conexao (menu da conta): roda as mesmas chamadas que o app faz e mostra o que ESTE aparelho recebe,
// linha por linha. Existe porque o app do Windows do Christian nao carregava canais nem baixava e nao havia como ver
// por que (09/10) — o resultado da tela da para mandar por print.
declare global {
  interface Window {
    __DIAG_GAP_MS__?: number
  }
}

interface Linha {
  nome: string
  ok: boolean
  detalhe: string
}

const resumo = (r: { status: number; type: string; ms: number; bytes: number; retryAfter?: string | null }) =>
  `HTTP ${r.status} · ${r.type.split(';')[0] || 'sem tipo'} · ${r.ms} ms · ${r.bytes} bytes${
    r.status === 429 ? ` · O PROVEDOR ESTÁ LIMITANDO OS PEDIDOS (muitos acessos)${r.retryAfter ? `, espere ${r.retryAfter}s` : ''}` : ''
  }`
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const pagina = (text: string, type: string) => /^\s*</.test(text) || type.includes('text/html')

export default function DiagnosticPage() {
  const client = useXtream()
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [rodando, setRodando] = useState(false)
  const [limpar, setLimpar] = useState(false)

  async function rodar() {
    if (!(client instanceof XtreamClient)) {
      setLinhas([{ nome: 'Conta', ok: false, detalhe: 'O diagnóstico vale para contas usuário/senha (Xtream).' }])
      return
    }
    setRodando(true)
    const out: Linha[] = []
    const add = (l: Linha) => {
      out.push(l)
      setLinhas([...out])
    }
    // Espaca os pedidos ao provedor (1,3 s): este teste nao pode provocar o limite que esta tentando medir.
    let primeiro = true
    const passo = async (nome: string, fn: () => Promise<{ ok: boolean; detalhe: string }>, aoProvedor = true) => {
      if (aoProvedor) {
        if (!primeiro) await sleep(window.__DIAG_GAP_MS__ ?? 1300)
        primeiro = false
      }
      try {
        add({ nome, ...(await fn()) })
      } catch (err) {
        add({ nome, ok: false, detalhe: `Sem resposta: ${err instanceof Error ? err.message : String(err)}` })
      }
    }
    const json = (text: string) => {
      try {
        return JSON.parse(text)
      } catch {
        return null
      }
    }

    await passo(
      'Servidor do app',
      async () => {
        const res = await fetch('/api/xtream')
        const text = await res.text()
        return { ok: res.status === 400, detalhe: `HTTP ${res.status} · ${text.slice(0, 80)}` }
      },
      false,
    )
    let loginText = ''
    await passo('Login no provedor', async () => {
      const r = await client.probe(null)
      loginText = r.text
      const d = json(r.text)
      return { ok: r.status === 200 && !!d?.user_info, detalhe: `${resumo(r)}${pagina(r.text, r.type) && r.status !== 429 ? ` · PÁGINA: ${r.text.slice(0, 80)}` : ''}` }
    })
    // O limite de telas do provedor: quando esta cheio ele recusa video (HTTP 403) e o app mostra "sua conta ja esta
    // tocando em outro aparelho" — mesmo sem ninguem assistindo, porque conexoes abandonadas contam por alguns
    // minutos (relato do Christian, 09/10: nenhum canal carregava e o download falhava).
    await passo('Telas em uso no provedor', async () => {
      const u = json(loginText)?.user_info
      if (!u) return { ok: false, detalhe: 'Sem os dados da conta (veja a linha acima).' }
      const ativas = Number(u.active_cons)
      const max = Number(u.max_connections)
      const cheio = Number.isFinite(ativas) && Number.isFinite(max) && max > 0 && ativas >= max
      const vence = u.exp_date && Number(u.exp_date) > 0 ? new Date(Number(u.exp_date) * 1000).toLocaleDateString('pt-BR') : 'sem data'
      return {
        ok: !cheio && String(u.status) === 'Active',
        detalhe: `${ativas} de ${max} telas em uso · conta ${u.status} · vence ${vence}${cheio ? ' · LIMITE CHEIO: o provedor recusa vídeo (HTTP 403) até uma conexão liberar. Feche o app em todos os aparelhos e espere alguns minutos.' : ''}`,
      }
    }, false)
    let canalCat: string | null = null
    let canalIds: number[] = []
    await passo('Categorias de canais', async () => {
      const r = await client.probe('get_live_categories')
      const d = json(r.text)
      if (Array.isArray(d) && d[0]) canalCat = String(d[0].category_id)
      return { ok: r.status === 200 && Array.isArray(d), detalhe: `${resumo(r)} · ${Array.isArray(d) ? `${d.length} categorias` : (r.status === 429 ? 'sem dados (limite do provedor)' : `PÁGINA: ${r.text.slice(0, 80)}`)}` }
    })
    if (canalCat) {
      await passo('Canais da primeira categoria', async () => {
        const r = await client.probe('get_live_streams', { category_id: canalCat! })
        const d = json(r.text)
        if (Array.isArray(d)) canalIds = d.slice(0, 3).map((c) => Number(c.stream_id))
        return { ok: r.status === 200 && Array.isArray(d), detalhe: `${resumo(r)} · ${Array.isArray(d) ? `${d.length} canais` : (r.status === 429 ? 'sem dados (limite do provedor)' : `PÁGINA: ${r.text.slice(0, 80)}`)}` }
      })
    }
    if (canalIds.length) {
      // O que o Christian viu em 09/10: canal que chega como aviso de bloqueio (lista fechada) ou recusado (403/404).
      // O provedor bloqueia canal por canal (Record bloqueado com Globo e Sportv ao vivo no mesmo minuto), entao um
      // canal so nao diz nada: testa ate 3 e so acusa erro se nenhum abrir (21/10: o 1o canal veio bloqueado).
      await passo('Início de um canal ao vivo (a lista do canal)', async () => {
        const res: { ok: boolean; detalhe: string }[] = []
        for (const [i, id] of canalIds.entries()) {
          if (i) await sleep(window.__DIAG_GAP_MS__ ?? 1300)
          try {
            const r = await client.probeLive(id)
            const onde = r.host ? ` · via ${r.host}` : ''
            if (r.status !== 200) {
              const motivo = r.status === 403 ? 'RECUSADO (telas cheias, bloqueio do provedor ou do Cloudflare)' : r.status === 404 ? 'NÃO ENCONTRADO' : 'ERRO'
              res.push({ ok: false, detalhe: `HTTP ${r.status} · ${motivo} · ${r.ms} ms · ${r.text.slice(0, 80)}` })
            } else if (r.closed || r.segments === 0) {
              res.push({ ok: false, detalhe: `HTTP 200 · BLOQUEADO: o provedor mandou um aviso no lugar do canal (${r.segments} trecho${r.segments === 1 ? '' : 's'}, lista fechada)${onde} · ${r.ms} ms` })
            } else {
              res.push({ ok: true, detalhe: `HTTP 200 · ao vivo · ${r.segments} trechos${onde} · ${r.ms} ms` })
            }
          } catch (err) {
            res.push({ ok: false, detalhe: `Sem resposta: ${err instanceof Error ? err.message : String(err)}` })
          }
        }
        const vivos = res.filter((r) => r.ok).length
        const lista = res.map((r, i) => `Canal ${i + 1}: ${r.detalhe}`).join(' | ')
        if (res.length === 1) return res[0]
        if (vivos === res.length) return { ok: true, detalhe: `${vivos} de ${res.length} canais ao vivo · ${lista}` }
        if (vivos) return { ok: true, detalhe: `${vivos} de ${res.length} canais ao vivo · os outros o provedor bloqueou só naquele canal (não é a conta nem o app) · ${lista}` }
        return { ok: false, detalhe: `Nenhum dos ${res.length} canais abriu · ${lista}` }
      })
    }
    let vodCat: string | null = null
    await passo('Categorias de filmes', async () => {
      const r = await client.probe('get_vod_categories')
      const d = json(r.text)
      if (Array.isArray(d) && d[0]) vodCat = String(d[0].category_id)
      return { ok: r.status === 200 && Array.isArray(d), detalhe: `${resumo(r)} · ${Array.isArray(d) ? `${d.length} categorias` : (r.status === 429 ? 'sem dados (limite do provedor)' : `PÁGINA: ${r.text.slice(0, 80)}`)}` }
    })
    if (vodCat) {
      let filme: { id: number; ext: string } | null = null
      await passo('Filmes da primeira categoria', async () => {
        const r = await client.probe('get_vod_streams', { category_id: vodCat! })
        const d = json(r.text)
        if (Array.isArray(d) && d[0]) filme = { id: Number(d[0].stream_id), ext: String(d[0].container_extension || 'mp4') }
        return { ok: r.status === 200 && Array.isArray(d), detalhe: `${resumo(r)} · ${Array.isArray(d) ? `${d.length} filmes` : (r.status === 429 ? 'sem dados (limite do provedor)' : `PÁGINA: ${r.text.slice(0, 80)}`)}` }
      })
      if (filme) {
        const f = filme as { id: number; ext: string }
        await passo('Início de um filme (o pedido do download)', async () => {
          const r = await client.probeStream('movie', f.id, f.ext)
          const video = (r.status === 206 || r.status === 200) && !pagina(r.text, r.type)
          return { ok: video, detalhe: `HTTP ${r.status} · ${r.type.split(';')[0] || 'sem tipo'} · ${r.range ? `${r.range} · ` : ''}${r.ms} ms · ${r.bytes} bytes${video ? '' : ` · NÃO É VÍDEO: ${r.text.slice(0, 80)}`}` }
        })
        // Canais do audio que o painel informa (ex.: ac3 6 canais = 5.1, a voz fica no canal central).
        await passo('Áudio de um filme', async () => {
          const r = await client.probe('get_vod_info', { vod_id: String(f.id) })
          const a = json(r.text)?.info?.audio as { codec_name?: string; channels?: number; channel_layout?: string } | undefined
          return { ok: r.status === 200, detalhe: a ? `${a.codec_name ?? '?'} · ${a.channels ?? '?'} canais${a.channel_layout ? ` (${a.channel_layout})` : ''}` : 'o provedor não informa' }
        })
      }
    }
    setRodando(false)
  }

  return (
    <div className="min-h-screen px-4 pb-16 pt-[calc(6rem+env(safe-area-inset-top))] sm:px-10">
      <h1 className="font-display text-headline-md text-white sm:text-headline-lg">{isTv ? 'Ajustes' : 'Diagnóstico de conexão'}</h1>
      <p className="mb-6 mt-2 max-w-2xl text-body-md text-on-surface-variant">
        Roda as mesmas chamadas que o app faz e mostra o que este aparelho recebe do servidor e do provedor. Se algo não
        carrega ou não baixa, rode e mande uma captura desta tela.
      </p>
      <div className="mb-6 flex flex-wrap gap-3">
        <button onClick={rodar} disabled={rodando} className="btn-primary">
          {rodando ? 'Testando…' : linhas.length ? 'Testar de novo' : 'Testar agora'}
        </button>
        {/* TV: o "Limpar cache" saiu do menu da conta e mora aqui, em Ajustes (TopNav.tsx). */}
        {isTv && (
          <button onClick={() => setLimpar(true)} className="btn-secondary">
            Limpar cache
          </button>
        )}
      </div>
      {limpar && (
        <ConfirmDialog
          message="Limpar o catálogo salvo e o cache do app? Não apaga login, perfis, favoritos nem downloads. O app recarrega em seguida."
          confirmLabel="Limpar"
          onCancel={() => setLimpar(false)}
          onConfirm={async () => {
            await clearAllCaches()
            window.location.reload()
          }}
        />
      )}
      <TesteDeSom />
      <ul className="max-w-3xl space-y-2" aria-live="polite">
        {linhas.map((l) => (
          <li key={l.nome} className="rounded-2xl border border-outline-soft bg-surface-low px-4 py-3 text-body-sm">
            <p className={`text-label-md ${l.ok ? 'text-done' : 'text-live'}`}>
              {l.ok ? '✓' : '✗'} {l.nome}
            </p>
            <p className="mt-0.5 break-words text-on-surface-variant">{l.detalhe}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Teste de som 5.1: musica nos lados e voz so no canal central, como nos filmes. Se a voz some no "Normal" e
// volta no "Com mistura", o aparelho descarta o canal central e misturar no player resolve.
function TesteDeSom() {
  const [tocando, setTocando] = useState<HTMLAudioElement | null>(null)
  const [aviso, setAviso] = useState('')
  async function tocar(codec: 'aac' | 'ac3', misturar: boolean) {
    tocando?.pause()
    // Elemento novo a cada toque: depois de ligado no Web Audio, o som dele nao volta para a saida normal.
    const el = new Audio(`/teste-som/voz-centro-5.1-${codec}.mp4`)
    setTocando(el)
    try {
      await el.play()
      setAviso(misturar && !(await routeToStereo(el)) ? 'A mistura não ligou neste aparelho.' : '')
    } catch {
      setAviso(`Este aparelho não toca ${codec.toUpperCase()}.`)
    }
  }
  return (
    <section className="mb-6 max-w-3xl rounded-2xl border border-outline-soft bg-surface-low px-4 py-3">
      <h2 className="text-label-md text-white">Teste de som (voz dos atores)</h2>
      <p className="mt-1 text-body-sm text-on-surface-variant">
        Toca 8 segundos com música nos lados e uma voz só no canal central. Você ouve a voz em cada botão?
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => tocar('aac', false)} className="chip">AAC normal</button>
        <button onClick={() => tocar('aac', true)} className="chip">AAC com mistura</button>
        <button onClick={() => tocar('ac3', false)} className="chip">AC3 normal</button>
        <button onClick={() => tocar('ac3', true)} className="chip">AC3 com mistura</button>
      </div>
      {aviso && <p className="mt-2 text-body-sm text-live">{aviso}</p>}
    </section>
  )
}
