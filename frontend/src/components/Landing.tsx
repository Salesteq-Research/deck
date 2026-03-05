import { MessageSquare, BarChart3, Globe, CalendarCheck, Warehouse, ArrowRight } from 'lucide-react'

const dealershipModules = [
  { title: 'Sales Advisor', desc: 'AI customer chat', href: '/chat', icon: MessageSquare },
  { title: 'Stock', desc: 'Dealer inventory', href: '/inventory', icon: Warehouse },
  { title: 'Cockpit', desc: 'Leads & operations', href: '/backoffice', icon: BarChart3 },
  { title: 'Network', desc: 'Group analytics', href: '/network', icon: Globe },
]

const testDriveModules = [
  { title: 'Booking', desc: 'AI-guided flow', href: '/testdrive', icon: CalendarCheck },
  { title: 'Fleet', desc: 'Model catalog', href: '/testdrive/inventory', icon: Warehouse },
]

function Tile({ title, desc, href, icon: Icon }: {
  title: string; desc: string; href: string; icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <a href={href} className="group flex items-center gap-4 px-5 py-4 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12] transition-all duration-200 active:scale-[0.98]">
      <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
        <Icon className="w-[18px] h-[18px] text-white/40 group-hover:text-white/70 transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-white/90 tracking-[-0.01em]">{title}</div>
        <div className="text-[12px] text-white/30">{desc}</div>
      </div>
      <ArrowRight className="w-4 h-4 text-white/10 group-hover:text-white/30 group-hover:translate-x-0.5 transition-all shrink-0" />
    </a>
  )
}

export function Landing() {
  return (
    <div className="h-[100dvh] flex flex-col items-center justify-center bg-[#0d0d0d] px-6 overflow-hidden" style={{ fontFamily: "'BMW Type Next', 'Helvetica Neue', Helvetica, Arial, sans-serif" }}>

      {/* BMW wordmark */}
      <div className="mb-10">
        <svg viewBox="0 0 120 40" className="w-[100px] h-auto">
          <text x="60" y="30" textAnchor="middle" fill="white" fontSize="28" fontWeight="700" letterSpacing="0.18em" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>BMW</text>
        </svg>
      </div>

      {/* Tagline */}
      <p className="text-[13px] text-white/25 tracking-[0.2em] uppercase mb-12">
        AI Platform Demo
      </p>

      {/* Two columns */}
      <div className="w-full max-w-[720px] grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Dealership */}
        <div>
          <h2 className="text-[11px] font-medium text-white/20 uppercase tracking-[0.15em] mb-3 px-1">
            Dealership
          </h2>
          <div className="space-y-2">
            {dealershipModules.map((m) => <Tile key={m.href} {...m} />)}
          </div>
        </div>

        {/* Test Drive */}
        <div>
          <h2 className="text-[11px] font-medium text-[#0166B1]/60 uppercase tracking-[0.15em] mb-3 px-1">
            Test Drive Engine
          </h2>
          <div className="space-y-2">
            {testDriveModules.map((m) => <Tile key={m.href} {...m} />)}
          </div>
        </div>
      </div>

      {/* Footer line */}
      <div className="absolute bottom-6 text-[11px] text-white/10 tracking-[0.05em]">
        BMW Switzerland &middot; Salesteq
      </div>
    </div>
  )
}
