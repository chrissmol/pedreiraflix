import { Capacitor, registerPlugin } from '@capacitor/core'

// Busca por voz. No APK (celular e TV) o plugin "Voz" do APK 1.6 abre o reconhecedor do aparelho; no navegador
// (Chrome, Edge, Safari) e o reconhecimento de voz do proprio navegador. No app do Windows (WebView2) a API existe mas
// nao funciona, e num APK antigo nao ha plugin: nesses o microfone nem aparece.
interface VozPlugin {
  disponivel(): Promise<{ ok: boolean }>
  ouvir(): Promise<{ texto: string | null }>
}
const nativo = Capacitor.isPluginAvailable('Voz') ? registerPlugin<VozPlugin>('Voz') : null

interface Reconhecedor {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}
type ReconhecedorCtor = new () => Reconhecedor
const w = window as unknown as { SpeechRecognition?: ReconhecedorCtor; webkitSpeechRecognition?: ReconhecedorCtor }
const Navegador = /PedreiraFlixDesktop/.test(navigator.userAgent) || Capacitor.isNativePlatform() ? undefined : (w.SpeechRecognition ?? w.webkitSpeechRecognition)

/** Se este aparelho consegue ouvir. */
export async function vozDisponivel(): Promise<boolean> {
  if (nativo) return nativo.disponivel().then((r) => r.ok).catch(() => false)
  return !!Navegador
}

/** Ouve uma frase e devolve o texto; cancelado, sem fala ou sem permissao: null. */
export function ouvir(): Promise<string | null> {
  if (nativo) return nativo.ouvir().then((r) => r.texto?.trim() || null).catch(() => null)
  if (!Navegador) return Promise.resolve(null)
  return new Promise((resolve) => {
    const rec = new Navegador()
    let texto: string | null = null
    rec.lang = 'pt-BR'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      texto = e.results[0]?.[0]?.transcript?.trim() || null
    }
    rec.onerror = () => {}
    rec.onend = () => resolve(texto)
    try {
      rec.start()
    } catch {
      resolve(null)
    }
  })
}
