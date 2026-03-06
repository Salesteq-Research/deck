import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Zap, Fuel, Battery, ChevronLeft, ChevronRight, Gauge, Palette, MapPin, Cog } from 'lucide-react'
import type { VehicleCard } from '@/lib/types'

interface VehicleSpotlightProps {
  vehicle: VehicleCard
  videoSrc?: string
  onClose: () => void
  onAction: (message: string) => void
}

const actions = [
  { label: 'Tell me more', message: 'Tell me more about the {name}' },
  { label: 'Financing options', message: 'What are the financing and leasing options for the {name}?' },
  { label: 'Compare models', message: 'Compare the {name} with similar models in stock' },
  { label: 'Book test drive', message: 'I would like to book a test drive with the {name}' },
  { label: 'Service appointment', message: 'I need to book a service appointment' },
]

export function VehicleSpotlight({ vehicle: v, videoSrc, onClose, onAction }: VehicleSpotlightProps) {
  const [imageIndex, setImageIndex] = useState(0)
  const [entering, setEntering] = useState(true)
  const [leaving, setLeaving] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const allImages = v.images?.length ? v.images : v.image ? [v.image] : []

  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 20)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (videoSrc && videoRef.current) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }, [videoSrc])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleClose = useCallback(() => {
    setLeaving(true)
    setTimeout(onClose, 250)
  }, [onClose])

  const handleAction = useCallback((message: string) => {
    const resolved = message.replace('{name}', v.name)
    handleClose()
    // Small delay so the overlay closes first
    setTimeout(() => onAction(resolved), 300)
  }, [v.name, onAction, handleClose])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) handleClose()
  }, [handleClose])

  const nextImage = () => setImageIndex(i => (i + 1) % allImages.length)
  const prevImage = () => setImageIndex(i => (i - 1 + allImages.length) % allImages.length)

  const fuelIcon = v.fuel_type?.includes('Electri') || v.fuel_type === 'BEV'
    ? <Zap className="w-3 h-3" />
    : v.fuel_type?.includes('Hybrid') || v.fuel_type === 'PHEV'
      ? <Battery className="w-3 h-3" />
      : <Fuel className="w-3 h-3" />

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center transition-all duration-300 ${entering ? 'bg-black/0' : leaving ? 'bg-black/0' : 'bg-black/70 backdrop-blur-sm'}`}
    >
      <div
        className={`relative w-full sm:max-w-[520px] max-h-[92dvh] sm:max-h-[85dvh] bg-[#0a0a0a] border border-white/[0.08] sm:rounded-[8px] rounded-t-[16px] overflow-hidden flex flex-col transition-all duration-300 ease-out ${entering ? 'translate-y-full sm:translate-y-8 opacity-0 scale-95' : leaving ? 'translate-y-full sm:translate-y-8 opacity-0 scale-95' : 'translate-y-0 opacity-100 scale-100'}`}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md border border-white/[0.08] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.12] transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Hero image/video area */}
        <div className="relative w-full h-[220px] sm:h-[260px] bg-gradient-to-b from-[#111] to-[#0a0a0a] overflow-hidden shrink-0">
          {/* Ambient glow behind car */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[70%] h-[100px] bg-[#1c69d4]/[0.06] blur-3xl" />

          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : allImages.length > 0 ? (
            <>
              <img
                src={allImages[imageIndex]}
                alt={v.name}
                className="absolute inset-0 w-full h-full object-contain p-6 drop-shadow-[0_20px_60px_rgba(0,0,0,0.9)]"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
              {allImages.length > 1 && (
                <>
                  <button onClick={prevImage} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-white/50 hover:text-white transition-all">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={nextImage} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-white/50 hover:text-white transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {/* Dots */}
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {allImages.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImageIndex(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${i === imageIndex ? 'bg-white/80 w-4' : 'bg-white/20'}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[32px] font-bold text-white/[0.04] tracking-[0.15em]">BMW</span>
            </div>
          )}

          {/* Light bloom */}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#1c69d4]/20 to-transparent" />
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-y-contain px-5 pt-4 pb-5">
          {/* Title + Price */}
          <div className="mb-4">
            <h2 className="text-[18px] sm:text-[20px] font-semibold text-white leading-tight">{v.name}</h2>
            <div className="flex items-baseline gap-3 mt-1.5">
              {v.price && (
                <span className="text-[18px] font-bold text-white">{v.price}</span>
              )}
              {v.monthly_installment && (
                <span className="text-[12px] text-white/40">
                  CHF {v.monthly_installment.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo
                </span>
              )}
            </div>
          </div>

          {/* Spec grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 mb-5">
            {v.series && (
              <SpecItem icon={<Cog className="w-3 h-3" />} label="Series" value={v.series} />
            )}
            {v.fuel_type && (
              <SpecItem icon={fuelIcon} label="Powertrain" value={v.fuel_type.replace(/_/g, ' ')} />
            )}
            {v.body_type && (
              <SpecItem icon={<Gauge className="w-3 h-3" />} label="Body" value={v.body_type.replace(/_/g, ' ')} />
            )}
            {v.color && (
              <SpecItem icon={<Palette className="w-3 h-3" />} label="Color" value={v.color.replace(/_/g, ' ')} />
            )}
            {v.dealer_name && (
              <SpecItem icon={<MapPin className="w-3 h-3" />} label="Dealer" value={v.dealer_name} className="col-span-2" />
            )}
          </div>

          {/* Action chips */}
          <div className="space-y-2">
            <p className="text-[10px] text-white/25 uppercase tracking-[0.12em] font-bold">Continue the conversation</p>
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <button
                  key={a.label}
                  onClick={() => handleAction(a.message)}
                  className="px-3.5 py-2 rounded-[4px] text-[12px] text-white/60 bg-white/[0.04] border border-white/[0.08] hover:border-[#1c69d4]/40 hover:bg-[#1c69d4]/10 hover:text-white/90 transition-all duration-200 active:scale-[0.97]"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SpecItem({ icon, label, value, className = '' }: { icon: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="w-6 h-6 rounded-[3px] bg-white/[0.04] flex items-center justify-center text-white/30 shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-white/25 uppercase tracking-[0.06em]">{label}</div>
        <div className="text-[13px] text-white/80 truncate capitalize">{value.toLowerCase()}</div>
      </div>
    </div>
  )
}
