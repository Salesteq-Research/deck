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
    <a href={href} className="group flex items-center gap-4 px-5 py-4 rounded-none bg-transparent border-b border-white/[0.08] hover:bg-white/[0.06] transition-all duration-200 active:scale-[0.99]">
      <div className="w-8 h-8 rounded-none bg-white/[0.06] flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-white/50 group-hover:text-white/80 transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-white/90 uppercase tracking-[0.05em]">{title}</div>
        <div className="text-[11px] text-white/40 mt-0.5">{desc}</div>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-white/0 group-hover:text-white/40 group-hover:translate-x-1 transition-all duration-300 shrink-0" />
    </a>
  )
}

export function Landing() {
  const [heroImage, setHeroImage] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/testdrive/vehicles`)
      .then(r => r.json())
      .then(data => {
        const all: FeaturedModel[] = data.items || []
        const hero = all.find(m => m.id === HERO_MODEL_ID)
        if (hero?.image) setHeroImage(hero.image)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-[100dvh] flex flex-col bg-black text-[#efefed] overflow-hidden" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 sm:px-10 py-4 shrink-0">
        <img src="/bmw-logo.png" alt="BMW" className="w-8 h-8" />
        <span className="text-[10px] text-white/30 uppercase tracking-[0.2em]">Switzerland</span>
      </header>

      {/* Hero section — full-width car image with overlaid copy */}
      <div className="relative flex flex-col items-center justify-center min-h-[28vh] sm:min-h-[32vh] px-6">
        {/* Background car image */}
        {heroImage && (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
            <img
              src={heroImage}
              alt="BMW i7"
              className="w-[85%] sm:w-[65%] max-w-[900px] h-auto object-contain opacity-[0.12] select-none pointer-events-none"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}

        {/* Hero text */}
        <div className="relative z-10 text-center">
          <h1 className="text-[2.2rem] sm:text-[3.2rem] md:text-[4rem] font-light text-white tracking-[-0.03em] leading-[1.05]">
            AI-Powered
          </h1>
          <h1 className="text-[2.2rem] sm:text-[3.2rem] md:text-[4rem] font-light text-white tracking-[-0.03em] leading-[1.05] mb-4">
            Platform
          </h1>
          <p className="text-[12px] sm:text-[13px] text-white/40 tracking-[0.12em] uppercase max-w-md mx-auto">
            Intelligent automation for the modern dealership
          </p>
        </div>
      </div>

      {/* Modules */}
      <div className="w-full max-w-[800px] mx-auto px-6 sm:px-10 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-0">

          {/* Dealership column */}
          <div>
            <div className="flex items-center gap-2 mb-1 pt-6">
              <div className="w-3 h-px bg-white/30" />
              <h2 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.18em]">
                Dealership
              </h2>
            </div>
            {dealershipModules.map((m) => <Tile key={m.href} {...m} />)}
          </div>

          {/* Test Drive column */}
          <div>
            <div className="flex items-center gap-2 mb-1 pt-6">
              <div className="w-3 h-px bg-[#1c69d4]/60" />
              <h2 className="text-[10px] font-bold text-[#1c69d4]/60 uppercase tracking-[0.18em]">
                Test Drive
              </h2>
            </div>
            {testDriveModules.map((m) => <Tile key={m.href} {...m} />)}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 sm:px-10 py-5 border-t border-white/[0.04] flex items-center justify-between shrink-0">
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
