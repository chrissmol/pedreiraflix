import { useState } from 'react'
import { useXtream } from '../hooks/useXtream'
import { XtreamClient } from '../lib/xtream'

// Diagnostico de conexao (menu da conta): roda as mesmas chamadas que o app faz e mostra o que ESTE aparelho recebe,
// linha por linha. Existe porque o app do Windows do Christian nao carregava canais nem baixava e nao havia como ver
// por que (09/10) — o resultado da tela da para mandar por print.
interface Linha {
  nome: string
  ok: boolean
  detalhe: string
}

const resumo = (r: { status: number; type: string; ms: number; bytes: number }) => `HTTP ${r.status} · ${r.type.split(';')[0] || 'sem tipo'} · ${r.ms} ms · ${r.bytes} bytes`
const pagina = (text: string, type: string) => /^\s*</.test(text) || type.includes('text/html')

export default function DiagnosticPage() {
  const client = useXtream()
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [rodando, setRodando] = useState(false)

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
    const passo = async (nome: string, fn: () => Promise<{ ok: boolean; detalhe: string }>) => {
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

    await passo('Servidor do app', async () => {
      const res = await fetch('/api/xtream')
      const text = await res.text()
      return { ok: res.status === 400, detalhe: `HTTP ${res.status} · ${text.slice(0, 80)}` }
    })
    await passo('Login no provedor', async () => {
      const r = await client.probe(null)
      const d = json(r.text)
      return { ok: r.status === 200 && !!d?.user_info, detalhe: `${resumo(r)}${pagina(r.text, r.type) ? ` · PÁGINA: ${r.text.slice(0, 80)}` : ''}` }
    })
    // O limite de telas do provedor: quando esta cheio ele recusa video (HTTP 403) e o app mostra "sua conta ja esta
    // tocando em outro aparelho" — mesmo sem ninguem assistindo, porque conexoes abandonadas contam por alguns
    // minutos (relato do Christian, 09/10: nenhum canal carregava e o download falhava).
    await passo('Telas em uso no provedor', async () => {
      const r = await client.probe(null)
      const u = json(r.text)?.user_info
      if (!u) return { ok: false, detalhe: 'Sem os dados da conta (veja a linha acima).' }
      const ativas = Number(u.active_cons)
      const max = Number(u.max_connections)
      const cheio = Number.isFinite(ativas) && Number.isFinite(max) && max > 0 && ativas >= max
      const vence = u.exp_date && Number(u.exp_date) > 0 ? new Date(Number(u.exp_date) * 1000).toLocaleDateString('pt-BR') : 'sem data'
      return {
        ok: !cheio && String(u.status) === 'Active',
        detalhe: `${ativas} de ${max} telas em uso · conta ${u.status} · vence ${vence}${cheio ? ' · LIMITE CHEIO: o provedor recusa vídeo (HTTP 403) até uma conexão liberar. Feche o app em todos os aparelhos e espere alguns minutos.' : ''}`,
      }
    })
    let canalCat: string | null = null
    await passo('Categorias de canais', async () => {
      const r = await client.probe('get_live_categories')
      const d = json(r.text)
      if (Array.isArray(d) && d[0]) canalCat = String(d[0].category_id)
      return { ok: r.status === 200 && Array.isArray(d), detalhe: `${resumo(r)} · ${Array.isArray(d) ? `${d.length} categorias` : `PÁGINA: ${r.text.slice(0, 80)}`}` }
    })
    if (canalCat) {
      await passo('Canais da primeira categoria', async () => {
        const r = await client.probe('get_live_streams', { category_id: canalCat! })
        const d = json(r.text)
        return { ok: r.status === 200 && Array.isArray(d), detalhe: `${resumo(r)} · ${Array.isArray(d) ? `${d.length} canais` : `PÁGINA: ${r.text.slice(0, 80)}`}` }
      })
    }
    let vodCat: string | null = null
    await passo('Categorias de filmes', async () => {
      const r = await client.probe('get_vod_categories')
      const d = json(r.text)
      if (Array.isArray(d) && d[0]) vodCat = String(d[0].category_id)
      return { ok: r.status === 200 && Array.isArray(d), detalhe: `${resumo(r)} · ${Array.isArray(d) ? `${d.length} categorias` : `PÁGINA: ${r.text.slice(0, 80)}`}` }
    })
    if (vodCat) {
      let filme: { id: number; ext: string } | null = null
      await passo('Filmes da primeira categoria', async () => {
        const r = await client.probe('get_vod_streams', { category_id: vodCat! })
        const d = json(r.text)
        if (Array.isArray(d) && d[0]) filme = { id: Number(d[0].stream_id), ext: String(d[0].container_extension || 'mp4') }
        return { ok: r.status === 200 && Array.isArray(d), detalhe: `${resumo(r)} · ${Array.isArray(d) ? `${d.length} filmes` : `PÁGINA: ${r.text.slice(0, 80)}`}` }
      })
      if (filme) {
        const f = filme as { id: number; ext: string }
        await passo('Início de um filme (o pedido do download)', async () => {
          const r = await client.probeStream('movie', f.id, f.ext)
          const video = (r.status === 206 || r.status === 200) && !pagina(r.text, r.type)
          return { ok: video, detalhe: `HTTP ${r.status} · ${r.type.split(';')[0] || 'sem tipo'} · ${r.range ? `${r.range} · ` : ''}${r.ms} ms · ${r.bytes} bytes${video ? '' : ` · NÃO É VÍDEO: ${r.text.slice(0, 80)}`}` }
        })
      }
    }
    setRodando(false)
  }

  return (
    <div className="min-h-screen px-4 pb-16 pt-[calc(6rem+env(safe-area-inset-top))] sm:px-10">
      <h1 className="font-display text-headline-md text-white sm:text-headline-lg">Diagnóstico de conexão</h1>
      <p className="mb-6 mt-2 max-w-2xl text-body-md text-on-surface-variant">
        Roda as mesmas chamadas que o app faz e mostra o que este aparelho recebe do servidor e do provedor. Se algo não
        carrega ou não baixa, rode e mande uma captura desta tela.
      </p>
      <button onClick={rodar} disabled={rodando} className="btn-primary mb-6">
        {rodando ? 'Testando...' : linhas.length ? 'Testar de novo' : 'Testar agora'}
      </button>
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
