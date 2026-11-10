import qrcode from 'qrcode-generator'
import { useEffect, useMemo, useRef, useState } from 'react'
import { decifrar, formatarCodigo, novoPar, type PareamentoCifrado, type PareamentoPayload, temCripto } from '../lib/pareamento'

/** TV: mostra o QR e o codigo curto, pergunta ao Worker ate o celular confirmar e entrega a conta ja aberta.
 * Sem WebCrypto (navegador de TV antigo) ou sem rede some, e a pessoa digita como sempre. */
export default function ParearTv({ onDone }: { onDone: (p: PareamentoPayload) => void }) {
  const [par, setPar] = useState<{ code: string; expiresAt: number } | null>(null)
  const [round, setRound] = useState(0) // sobe quando expira: pede um codigo novo sozinho
  const [off, setOff] = useState(!temCripto())
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })

  useEffect(() => {
    if (off) return
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    ;(async () => {
      try {
        const keys = await novoPar()
        const res = await fetch('/api/parear', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pub: keys.pub }) })
        if (!res.ok) throw new Error()
        const s = (await res.json()) as { userCode: string; deviceCode: string; expiresIn: number; interval: number }
        if (stop) return
        setPar({ code: s.userCode, expiresAt: Date.now() + s.expiresIn * 1000 })
        const ask = async () => {
          if (stop) return
          const r = await fetch('/api/parear/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceCode: s.deviceCode }) })
          if (stop) return
          if (r.status === 410) return setRound((n) => n + 1)
          if (r.status === 200) return done.current(await decifrar(keys.priv, (await r.json()) as PareamentoCifrado))
          // 202: ainda nao; 429 ou rede caindo: espera um pouco mais e tenta de novo
          timer = setTimeout(() => ask().catch(() => (timer = setTimeout(ask, s.interval * 2000))), s.interval * (r.status === 429 ? 3000 : 1000))
        }
        timer = setTimeout(() => ask().catch(() => (timer = setTimeout(ask, s.interval * 2000))), s.interval * 1000)
      } catch {
        if (!stop) setOff(true)
      }
    })()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [round, off])

  const svg = useMemo(() => {
    if (!par) return ''
    const qr = qrcode(0, 'M')
    qr.addData(`${location.origin}/parear?c=${par.code}`)
    qr.make()
    return qr.createSvgTag({ scalable: true, margin: 2 })
  }, [par])

  if (off || !par) return null
  return (
    <section aria-label="Entrar com o celular" className="mb-5 flex items-center gap-5 rounded-2xl border border-outline-soft bg-surface-container p-4 text-left">
      <div data-testid="parear-qr" className="h-32 w-32 shrink-0 rounded-xl bg-white p-1" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="min-w-0">
        <h2 className="font-display text-headline-sm text-white">Entrar com o celular</h2>
        <p className="mt-1 text-body-sm text-on-surface-variant">Aponte a câmera para o QR, ou no PedreiraFlix do celular abra o menu da conta, toque em Entrar na TV e digite:</p>
        <p data-testid="parear-codigo" className="mt-2 font-mono text-headline-sm tracking-widest text-brand-400">{formatarCodigo(par.code)}</p>
      </div>
    </section>
  )
}
