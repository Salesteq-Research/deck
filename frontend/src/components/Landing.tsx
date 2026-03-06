import { useState, useEffect } from 'react'
import { MessageSquare, BarChart3, Globe, CalendarCheck, Warehouse, ArrowRight } from 'lucide-react'

const API_BASE = '/api'

interface FeaturedModel {
  id: string
  name: string
  image?: string
}

const HERO_MODEL_ID = 'i7'

const dealershipModules = [
  { title: 'Sales Advisor', desc: 'AI-powered customer dialogue', href: '/chat', icon: MessageSquare },
  { title: 'Stock', desc: 'Dealer inventory management', href: '/inventory', icon: Warehouse },
  { title: 'Cockpit', desc: 'Leads & operations', href: '/backoffice', icon: BarChart3 },
  { title: 'Network', desc: 'Group analytics', href: '/network', icon: Globe },
]

const testDriveModules = [
  { title: 'Booking', desc: 'AI-guided test drive flow', href: '/testdrive', icon: CalendarCheck },
  { title: 'Fleet', desc: 'Test drive model catalog', href: '/testdrive/inventory', icon: Warehouse },
]

function Tile({ title, desc, href, icon: Icon }: {
  title: string; desc: string; href: string; icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <a href={href} className="group flex items-center gap-4 px-5 py-4 bg-transparent border-b border-white/[0.06] hover:bg-white/[0.04] transition-all duration-200 active:scale-[0.99]">
      <div className="w-9 h-9 rounded-[4px] bg-white/[0.06] flex items-center justify-center shrink-0 group-hover:bg-[#1c69d4]/20 transition-colors">
        <Icon className="w-4 h-4 text-white/40 group-hover:text-[#7ab5ff] transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-white/90 uppercase tracking-[0.06em]">{title}</div>
        <div className="text-[11px] text-white/35 mt-0.5">{desc}</div>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-white/0 group-hover:text-white/30 group-hover:translate-x-1 transition-all duration-300 shrink-0" />
    </a>
  )
}

export function Landing() {
  const [heroImage, setHeroImage] = useState<string | null>(null)
  const [videoMap, setVideoMap] = useState<Record<string, string>>({})

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/testdrive/vehicles`).then(r => r.json()),
      fetch('/videos/index.json').then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([data, videos]) => {
      const all: FeaturedModel[] = data.items || []
      const hero = all.find(m => m.id === HERO_MODEL_ID)
      if (hero?.image) setHeroImage(hero.image)
      setVideoMap(videos as Record<string, string>)
    }).catch(() => {})
  }, [])

  const heroVideo = videoMap[HERO_MODEL_ID]

  return (
    <div className="min-h-[100dvh] flex flex-col bg-black text-[#efefed] overflow-hidden" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>

      {/* Top bar */}
      <header className="flex items-center justify-between px-4 sm:px-8 py-3.5 shrink-0 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <img src="/bmw-logo.png" alt="BMW" className="w-7 h-7" />
          <span className="w-px h-4 bg-white/15" />
          <span className="text-[12px] font-bold text-white/80 uppercase tracking-[0.12em]">Switzerland</span>
        </div>
        <span className="text-[10px] text-white/20 uppercase tracking-[0.15em]">Salesteq</span>
      </header>

      {/* Hero section — cinematic with ambient glow */}
      <div className="relative flex flex-col items-center justify-center min-h-[30vh] sm:min-h-[36vh] px-6 overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[400px] h-[400px] rounded-full bg-[#1c69d4] animate-ambient-glow" />
        </div>

        {/* Background video or car image */}
        {heroVideo ? (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <video
              src={heroVideo}
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-cover opacity-[0.15]"
            />
          </div>
        ) : heroImage ? (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <img
              src={heroImage}
              alt="BMW i7"
              className="w-[85%] sm:w-[65%] max-w-[900px] h-auto object-contain opacity-[0.10] select-none pointer-events-none"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        ) : null}

        {/* Hero text */}
        <div className="relative z-10 text-center animate-hero-in">
          <h1 className="text-[2rem] sm:text-[3rem] md:text-[4rem] font-extralight text-white tracking-[-0.02em] leading-[1.05]">
            AI-Powered
          </h1>
          <h1 className="text-[2rem] sm:text-[3rem] md:text-[4rem] font-extralight text-white tracking-[-0.02em] leading-[1.05] mb-4">
            Platform
          </h1>
          <p className="text-[11px] sm:text-[12px] text-white/70 tracking-[0.15em] uppercase max-w-md mx-auto">
            Intelligent automation for the modern dealership
          </p>
        </div>
      </div>

      {/* Modules */}
      <div className="w-full max-w-[800px] mx-auto px-4 sm:px-8 pb-12 animate-hero-in [animation-delay:200ms] [animation-fill-mode:both]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-0">

          {/* Dealership column */}
          <div>
            <div className="flex items-center gap-2 mb-1 pt-6">
              <div className="w-3 h-px bg-white/20" />
              <h2 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.18em]">
                Dealership
              </h2>
            </div>
            {dealershipModules.map((m) => <Tile key={m.href} {...m} />)}
          </div>

          {/* Test Drive column */}
          <div>
            <div className="flex items-center gap-2 mb-1 pt-6">
              <div className="w-3 h-px bg-[#1c69d4]/50" />
              <h2 className="text-[10px] font-bold text-[#1c69d4]/50 uppercase tracking-[0.18em]">
                Test Drive
              </h2>
            </div>
            {testDriveModules.map((m) => <Tile key={m.href} {...m} />)}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-auto px-4 sm:px-8 py-4 border-t border-white/[0.04] flex items-center justify-between shrink-0">
        <span className="text-[10px] text-white/10 tracking-[0.05em]">
          BMW Switzerland
        </span>
        <span className="text-[10px] text-white/10 tracking-[0.05em]">
          Powered by Salesteq
        </span>
      </footer>
    </div>
  )
}
