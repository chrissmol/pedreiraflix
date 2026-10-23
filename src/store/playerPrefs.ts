import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SubtitleSize = 'small' | 'medium' | 'large'
export type SubtitleBackground = 'none' | 'semi' | 'solid'
/** Como a imagem preenche a tela: a mesma trinca que todo player de IPTV oferece. */
export type VideoFit = 'contain' | 'cover' | 'fill'

interface PlayerPrefsState {
  volume: number
  muted: boolean
  setVolumePrefs: (volume: number, muted: boolean) => void
  subtitleSize: SubtitleSize
  subtitleBackground: SubtitleBackground
  setSubtitleSize: (size: SubtitleSize) => void
  setSubtitleBackground: (bg: SubtitleBackground) => void
  videoFit: VideoFit
  setVideoFit: (fit: VideoFit) => void
  /** Segundos a somar nas legendas quando o provedor as manda fora de sincronia. */
  subtitleOffset: number
  setSubtitleOffset: (seconds: number) => void
  /** Ultimo idioma de audio e de legenda que cada perfil escolheu (codigo ou nome da faixa, em minusculas; legenda
   * null = desligada). O player abre direto nele quando o video tem essa faixa, como a Netflix. */
  /** "Voz mais alta" (so na TV, onde o som ja passa pelo Web Audio). */
  voiceBoost: boolean
  setVoiceBoost: (on: boolean) => void
  trackLang: Record<string, { audio?: string; subtitle?: string | null }>
  setTrackLang: (profileId: string, pref: { audio?: string; subtitle?: string | null }) => void
}

export const usePlayerPrefs = create<PlayerPrefsState>()(
  persist(
    (set) => ({
      volume: 1,
      muted: false,
      setVolumePrefs: (volume, muted) => set({ volume, muted }),
      subtitleSize: 'medium',
      subtitleBackground: 'semi',
      setSubtitleSize: (subtitleSize) => set({ subtitleSize }),
      setSubtitleBackground: (subtitleBackground) => set({ subtitleBackground }),
      videoFit: 'contain',
      setVideoFit: (videoFit) => set({ videoFit }),
      subtitleOffset: 0,
      setSubtitleOffset: (subtitleOffset) => set({ subtitleOffset }),
      voiceBoost: false,
      setVoiceBoost: (voiceBoost) => set({ voiceBoost }),
      trackLang: {},
      setTrackLang: (profileId, pref) => set((s) => ({ trackLang: { ...s.trackLang, [profileId]: { ...s.trackLang[profileId], ...pref } } })),
    }),
    { name: 'iptv-player-prefs' },
  ),
)
