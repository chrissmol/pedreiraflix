import { Info, Play } from './icons'

interface HeroProps {
  title: string
  description?: string | null
  image: string | null
  onPlay: () => void
  onInfo?: () => void
}

export default function Hero({ title, description, image, onPlay, onInfo }: HeroProps) {
  return (
    <div className="relative h-[60vw] max-h-[680px] min-h-[420px] w-full overflow-hidden">
      {image && (
        <img src={image} alt={title} className="absolute inset-0 h-full w-full object-cover object-top" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#06070c] via-[#06070c]/50 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#06070c]/90 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
      <div className="pointer-events-none absolute -right-20 top-0 h-72 w-72 rounded-full bg-brand-500/20 blur-[100px]" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 px-4 pb-10 sm:px-10 sm:pb-16">
        <h1 className="font-display max-w-xl text-3xl font-extrabold tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)] sm:text-5xl">
          {title}
        </h1>
        {description && (
          <p className="line-clamp-3 max-w-lg text-sm text-zinc-300 drop-shadow sm:text-base">{description}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onPlay}
            className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-black shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_10px_30px_-8px_rgba(15,123,255,0.5)] transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_14px_40px_-8px_rgba(15,123,255,0.75)] sm:px-6 sm:text-base"
          >
            <Play className="h-5 w-5" /> Assistir
          </button>
          {onInfo && (
            <button
              onClick={onInfo}
              className="glass-panel flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:border-brand-400/40 hover:bg-white/10 sm:px-6 sm:text-base"
            >
              <Info className="h-5 w-5" /> Detalhes
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
