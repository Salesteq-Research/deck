import { useRef, useState, useCallback } from 'react'
import { Zap, Fuel, Battery, Play } from 'lucide-react'
import type { VehicleCard as VehicleCardType } from '@/lib/types'

interface VehicleCardProps {
  vehicle: VehicleCardType
  videoSrc?: string
  onSelect?: (vehicle: VehicleCardType) => void
}

export function VehicleCard({ vehicle: v, videoSrc, onSelect }: VehicleCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const handleMouseEnter = useCallback(() => {
    if (videoSrc && videoRef.current) {
      setIsPlaying(true)
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }, [videoSrc])

  const handleMouseLeave = useCallback(() => {
    setIsPlaying(false)
    if (videoRef.current) videoRef.current.pause()
  }, [])

  const handlePlayClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!videoSrc || !videoRef.current) return
    if (isPlaying) {
      setIsPlaying(false)
      videoRef.current.pause()
    } else {
      setIsPlaying(true)
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }, [videoSrc, isPlaying])

  return (
    <div
      className="flex-shrink-0 w-[240px] sm:w-[280px] flex flex-col rounded-[4px] border border-white/[0.10] bg-white/[0.05] overflow-hidden cursor-pointer transition-all duration-200 hover:border-white/[0.20] hover:bg-white/[0.08] active:scale-[0.98] group animate-card-in"
      onClick={() => onSelect ? onSelect(v) : v.url && window.open(v.url, '_blank')}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Image/Video area */}
      <div className="w-full h-[140px] sm:h-[165px] relative flex items-center justify-center overflow-hidden">
        {/* Static image — fades when video plays */}
        {v.image ? (
          <img
            src={v.image}
            alt={v.name}
            className={`w-[85%] h-auto object-contain drop-shadow-[0_12px_40px_rgba(0,0,0,0.8)] group-hover:scale-105 transition-all duration-300 animate-car-reveal ${isPlaying ? 'opacity-0' : 'opacity-100'}`}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <span className="text-[24px] font-bold text-white/10 tracking-[0.1em]">BMW</span>
        )}
        {/* Video layer */}
        {videoSrc && (
          <video
            ref={videoRef}
            src={videoSrc}
            muted
            loop
            playsInline
            preload="none"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isPlaying ? 'opacity-100' : 'opacity-0'}`}
            style={isPlaying ? { animation: 'video-fade-in 0.5s ease-out' } : undefined}
          />
        )}
        {/* Play badge */}
        {videoSrc && (
          <div
            onClick={handlePlayClick}
            className={`absolute bottom-2.5 left-2.5 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-all duration-500 hover:scale-110 active:scale-95 ${isPlaying ? 'opacity-0 scale-75 pointer-events-none' : 'opacity-100 scale-100'}`}
          >
            <div className="absolute inset-0 rounded-full border border-[#1c69d4]/40" style={{ animation: 'play-ring-pulse 3s ease-in-out infinite' }} />
            <div className="absolute inset-0 rounded-full bg-black/50 backdrop-blur-md" />
            <Play className="w-3.5 h-3.5 text-[#7ab5ff] relative z-10 ml-[2px] fill-[#7ab5ff]/30" strokeWidth={2} />
          </div>
        )}
        {/* Light bloom */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-[2px] bg-gradient-to-r from-transparent via-[#1c69d4]/30 to-transparent" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-[40px] bg-[#1c69d4]/[0.04] blur-2xl" />
        {/* Powertrain badge */}
        {v.fuel_type && (
          <div className={`absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-[2px] text-[10px] font-bold uppercase tracking-[0.04em] ${
            v.fuel_type.includes('Electri') || v.fuel_type === 'BEV' ? 'bg-[#1c69d4]/25 text-[#7ab5ff]' :
            v.fuel_type.includes('Hybrid') || v.fuel_type === 'PHEV' ? 'bg-[#1c69d4]/15 text-[#7ab5ff]' :
            'bg-white/[0.08] text-white/60'
          }`}>
            {v.fuel_type.includes('Electri') || v.fuel_type === 'BEV' ? <Zap className="w-2.5 h-2.5" /> :
             v.fuel_type.includes('Hybrid') || v.fuel_type === 'PHEV' ? <Battery className="w-2.5 h-2.5" /> :
             <Fuel className="w-2.5 h-2.5" />}
            {v.fuel_type}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3.5 flex-1 flex flex-col">
        <h4 className="text-[14px] font-semibold text-white leading-tight line-clamp-2">{v.name}</h4>
        <p className="text-[12px] text-white/50 mt-0.5">
          {v.series && <span className="text-[#4d8fe0] font-medium">{v.series}</span>}
          {v.body_type && <> &middot; {v.body_type}</>}
        </p>
        {v.color && (
          <p className="text-[11px] text-white/30 mt-0.5">{v.color.replace(/_/g, ' ')}</p>
        )}
        {v.dealer_name && (
          <p className="text-[11px] text-white/25 mt-0.5 truncate">{v.dealer_name}</p>
        )}
        <div className="mt-auto pt-2 flex items-end justify-between">
          {v.price ? (
            <span className="text-[14px] font-bold text-white">{v.price}</span>
          ) : <span />}
          {v.monthly_installment && (
            <span className="text-[10px] text-white/40">
              CHF {v.monthly_installment.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
