import { AirPlay, Cast, ChevronLeft, PictureInPicture } from './icons'
import type { SubtitleBackground, SubtitleSize, VideoFit } from '../store/playerPrefs'
import { VideoPlayerAudioMenu } from './VideoPlayerAudioMenu'
import { VideoPlayerDisplayMenu } from './VideoPlayerDisplayMenu'
import { VideoPlayerQualityMenu, type QualityLevel } from './VideoPlayerQualityMenu'
import { VideoPlayerSpeedMenu } from './VideoPlayerSpeedMenu'
import { VideoPlayerSubtitleMenu } from './VideoPlayerSubtitleMenu'

interface AudioTrack {
  id: number
  name: string
}

interface SubtitleTrack {
  id: number
  name: string
}

type MenuKey = 'quality' | 'audio' | 'subtitles' | 'speed' | 'display' | null

interface VideoPlayerHeaderProps {
  title?: string
  subtitle?: string
  onBack?: () => void
  controlsVisible: boolean
  openMenu: MenuKey
  onToggleMenu: (menu: Exclude<MenuKey, null>) => void
  audioTracks: AudioTrack[]
  currentAudioTrack: number
  onSelectAudioTrack: (id: number) => void
  subtitleTracks: SubtitleTrack[]
  currentSubtitleTrack: number
  subtitleSize: SubtitleSize
  subtitleBackground: SubtitleBackground
  onSelectSubtitleTrack: (id: number) => void
  onSelectSubtitleSize: (size: SubtitleSize) => void
  onSelectSubtitleBackground: (background: SubtitleBackground) => void
  isLive: boolean
  playbackRate: number
  onSelectSpeed: (rate: number) => void
  pipSupported: boolean
  isPip: boolean
  onTogglePip: () => void
  airPlaySupported: boolean
  onShowAirPlayPicker: () => void
  castSupported: boolean
  casting: boolean
  onCast: () => void
  levels: QualityLevel[]
  currentLevel: number
  autoPickedHeight: number | null
  onSelectLevel: (level: number) => void
  videoFit: VideoFit
  onSelectFit: (fit: VideoFit) => void
  sleepRemaining: number | null
  onSelectSleep: (minutes: number) => void
  subtitleOffset: number
  onChangeSubtitleOffset: (seconds: number) => void
}

export function VideoPlayerHeader({
  title,
  subtitle,
  onBack,
  controlsVisible,
  openMenu,
  onToggleMenu,
  audioTracks,
  currentAudioTrack,
  onSelectAudioTrack,
  subtitleTracks,
  currentSubtitleTrack,
  subtitleSize,
  subtitleBackground,
  onSelectSubtitleTrack,
  onSelectSubtitleSize,
  onSelectSubtitleBackground,
  isLive,
  playbackRate,
  onSelectSpeed,
  pipSupported,
  isPip,
  onTogglePip,
  airPlaySupported,
  onShowAirPlayPicker,
  castSupported,
  casting,
  onCast,
  levels,
  currentLevel,
  autoPickedHeight,
  onSelectLevel,
  videoFit,
  onSelectFit,
  sleepRemaining,
  onSelectSleep,
  subtitleOffset,
  onChangeSubtitleOffset,
}: VideoPlayerHeaderProps) {
  return (
    <div
      data-controls
      className={`absolute inset-x-0 top-0 z-30 flex items-start gap-2 bg-gradient-to-b from-black/80 to-transparent pb-8 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] transition-opacity duration-200 ${
        controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Voltar"
          className="player-btn h-11 w-11 shrink-0"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      <div className="min-w-0 flex-1 self-center">
        {title && <h1 className="font-display truncate text-label-md text-white sm:text-headline-sm">{title}</h1>}
        {subtitle && <p className="truncate text-body-sm text-on-surface-variant">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {audioTracks.length > 1 && (
          <VideoPlayerAudioMenu
            open={openMenu === 'audio'}
            tracks={audioTracks}
            currentTrack={currentAudioTrack}
            onToggle={() => onToggleMenu('audio')}
            onSelectTrack={onSelectAudioTrack}
          />
        )}

        {subtitleTracks.length > 0 && (
          <VideoPlayerSubtitleMenu
            offset={subtitleOffset}
            onChangeOffset={onChangeSubtitleOffset}
            open={openMenu === 'subtitles'}
            tracks={subtitleTracks}
            currentTrack={currentSubtitleTrack}
            subtitleSize={subtitleSize}
            subtitleBackground={subtitleBackground}
            onToggle={() => onToggleMenu('subtitles')}
            onSelectTrack={onSelectSubtitleTrack}
            onSelectSize={onSelectSubtitleSize}
            onSelectBackground={onSelectSubtitleBackground}
          />
        )}

        {!isLive && (
          <VideoPlayerSpeedMenu
            open={openMenu === 'speed'}
            playbackRate={playbackRate}
            onToggle={() => onToggleMenu('speed')}
            onSelect={onSelectSpeed}
          />
        )}

        <VideoPlayerDisplayMenu
          open={openMenu === 'display'}
          onToggle={() => onToggleMenu('display')}
          fit={videoFit}
          onSelectFit={onSelectFit}
          sleepRemaining={sleepRemaining}
          onSelectSleep={onSelectSleep}
        />

        {pipSupported && (
          <button
            onClick={onTogglePip}
            aria-label="Picture-in-Picture"
            className={`player-btn pointer-coarse:hidden ${isPip ? 'player-btn-active' : ''}`}
          >
            <PictureInPicture className="h-4 w-4" />
          </button>
        )}

        {airPlaySupported && (
          // No pointer-coarse:hidden here unlike PiP/Cast right below — those are mouse-desktop
          // conveniences that are redundant on touch, but AirPlay only ever exists on Safari, and the
          // iPhone/iPad it's most useful on are touch devices. Hiding it there (the bug, until now)
          // meant the button never appeared on exactly the hardware AirPlay is for.
          <button
            onClick={onShowAirPlayPicker}
            aria-label="AirPlay"
            className="player-btn"
          >
            <AirPlay className="h-4 w-4" />
          </button>
        )}

        {castSupported && (
          <button
            onClick={onCast}
            aria-label="Transmitir (Chromecast)"
            className={`player-btn pointer-coarse:hidden ${casting ? 'player-btn-active' : ''}`}
          >
            <Cast className="h-4 w-4" />
          </button>
        )}

        {levels.length > 1 && (
          <VideoPlayerQualityMenu
            open={openMenu === 'quality'}
            levels={levels}
            currentLevel={currentLevel}
            autoPickedHeight={autoPickedHeight}
            onToggle={() => onToggleMenu('quality')}
            onSelect={onSelectLevel}
          />
        )}
      </div>
    </div>
  )
}
