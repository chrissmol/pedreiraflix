import { Capacitor, registerPlugin } from '@capacitor/core'
import { isTv } from './device'
import { proxyImage } from './xtream'
import type { WatchProgress } from '../store/library'

// Ponte para o plugin "ContinuarTv" do APK 1.5 (android/.../ContinuarTvPlugin.java): a fileira "Continuar assistindo"
// da tela inicial do Google TV. Fora do APK, no celular ou num APK antigo, nao existe e nada acontece.
interface ContinuarTvPlugin {
  atualizar(opts: { itens: ItemTv[] }): Promise<void>
  pendente(): Promise<{ path: string | null }>
}
interface ItemTv {
  id: string
  titulo: string
  path: string
  imagem: string
  quando: number
  posicaoMs: number
  duracaoMs: number
  episodio: boolean
}
export const continuarTv = isTv && Capacitor.isPluginAvailable('ContinuarTv') ? registerPlugin<ContinuarTvPlugin>('ContinuarTv') : null

const MAX_ITENS = 10

/** O mesmo endereco que o "Continuar assistindo" do Inicio abre. */
export function watchPath(p: WatchProgress): string {
  return `/watch/${p.kind}/${p.id}?ext=${p.ext || 'mp4'}&name=${encodeURIComponent(p.name)}&image=${encodeURIComponent(p.image || '')}${
    p.seriesId ? `&seriesId=${p.seriesId}` : ''
  }`
}

export function itensTv(items: WatchProgress[], origin: string): ItemTv[] {
  return [...items]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_ITENS)
    .map((p) => {
      const img = proxyImage(p.image)
      return {
        id: `${p.kind}-${p.id}`,
        titulo: p.name,
        path: watchPath(p),
        // A tela inicial busca o poster sozinha: endereco completo e pelo proxy (o do provedor pode ser http).
        imagem: img ? new URL(img, origin).href : '',
        quando: p.updatedAt,
        posicaoMs: Math.round(p.positionSeconds * 1000),
        duracaoMs: Math.round(p.durationSeconds * 1000),
        episodio: p.kind === 'series',
      }
    })
}
