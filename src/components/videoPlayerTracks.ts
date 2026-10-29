export type Setter<T> = React.Dispatch<React.SetStateAction<T>>

export interface AudioTrack {
  id: number
  name: string
  lang?: string
}

export interface SubtitleTrack {
  id: number
  name: string
  lang?: string
}

/** Como o idioma preferido e guardado e comparado: o codigo da faixa ("por"), senao o nome ("Português"). */
export const trackKey = (t: { name: string; lang?: string }) => (t.lang || t.name).toLowerCase()

// AudioTrackList so existe no Safari; o lib.dom do TypeScript nao a declara.
export interface NativeAudioTrackList extends EventTarget {
  readonly length: number
  [index: number]: { label: string; language: string; enabled: boolean }
}

// Atraso (s) atras do ponto ao vivo a partir do qual o "Rápido" do HLS nativo pula de volta.
export const NATIVE_FAST_MAX_LAG = 6
export const NATIVE_STALL_MS = 15_000
export const LIVE_AUTO_RETRY_MS = 20_000

export function nativeSubtitleTracks(video: HTMLVideoElement | null) {
  return Array.from(video?.textTracks ?? []).filter((t) => t.kind === 'subtitles' || t.kind === 'captions')
}
