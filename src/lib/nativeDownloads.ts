import { Capacitor, registerPlugin } from '@capacitor/core'

// Ponte para o plugin "Baixador" do APK (android/.../BaixadorPlugin.java): download pelo gerenciador do
// Android, que continua com o app fechado. Fora do APK (navegador, PWA do iPhone) e null e o app segue com o
// download pelo navegador (offlineStore + IndexedDB).
export interface NativeStatus {
  id: number
  state: 'running' | 'done' | 'failed' | 'missing'
  bytes?: number
  total?: number
  uri?: string | null
}
interface BaixadorPlugin {
  start(opts: { url: string; fileName: string; title: string }): Promise<{ id: number }>
  status(opts: { ids: number[] }): Promise<{ downloads: NativeStatus[] }>
  remove(opts: { id: number }): Promise<void>
}

export const nativeDownloads: BaixadorPlugin | null = Capacitor.isPluginAvailable('Baixador') ? registerPlugin<BaixadorPlugin>('Baixador') : null

/** Endereco que o <video> do app consegue tocar para um arquivo baixado pelo Android. */
export const nativeFileSrc = (uri: string) => Capacitor.convertFileSrc(uri)
