import { Car, MessageSquare, BarChart3, Building2, Globe, CalendarCheck, Warehouse } from 'lucide-react'

const dealershipModules = [
  {
    title: 'Sales Advisor',
    description: 'AI-powered customer chat for vehicle discovery, pricing, and comparisons.',
    href: '/chat',
    icon: MessageSquare,
  },
  {
    title: 'Stock Overview',
    description: 'Full dealership inventory with filters, specs, and real-time availability.',
    href: '/inventory',
    icon: Warehouse,
  },
  {
    title: 'Dealer Cockpit',
    description: 'Leads, conversations, live monitor, and AI agent management.',
    href: '/backoffice',
    icon: BarChart3,
  },
  {
    title: 'Network',
    description: 'BMW Switzerland group view — cross-dealer analytics and performance.',
    href: '/network',
    icon: Globe,
  },
]

const testDriveModules = [
  {
    title: 'Book a Test Drive',
    description: 'AI-guided booking flow — vehicle selection, dealer, and scheduling.',
    href: '/testdrive',
    icon: CalendarCheck,
  },
  {
    title: 'Fleet Inventory',
    description: 'Available models for test drives across the Swiss dealer network.',
    href: '/testdrive/inventory',
    icon: Car,
  },
]

function ModuleCard({ title, description, href, icon: Icon }: {
  title: string
  description: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <a
      href={href}
      className="group relative flex flex-col gap-3 p-5 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] hover:border-foreground/[0.12] hover:bg-foreground/[0.04] transition-all duration-200 active:scale-[0.98]"
    >
      <div className="w-10 h-10 rounded-xl bg-foreground/[0.04] flex items-center justify-center">
        <Icon className="w-5 h-5 text-foreground/50 group-hover:text-foreground/70 transition-colors" />
      </div>
      <div>
        <h3 className="text-[15px] font-semibold text-foreground/85 tracking-[-0.01em]">{title}</h3>
        <p className="text-[13px] text-foreground/40 leading-relaxed mt-1">{description}</p>
      </div>
      <span className="absolute right-4 top-5 text-foreground/15 group-hover:text-foreground/35 transition-colors text-sm">
        &rarr;
      </span>
    </a>
  )
}

export function Landing() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* BMW Roundel */}
      <div className="relative mb-8">
        <div className="w-20 h-20 rounded-full border-[2.5px] border-foreground/10 flex items-center justify-center">
          <svg viewBox="0 0 96 96" className="w-16 h-16" fill="none">
            <circle cx="48" cy="48" r="46" stroke="currentColor" strokeWidth="1.5" className="text-foreground/15" />
            <circle cx="48" cy="48" r="36" stroke="currentColor" strokeWidth="0.75" className="text-foreground/10" />
            <text x="48" y="54" textAnchor="middle" className="fill-foreground/80 text-[13px] font-semibold tracking-[0.15em]" style={{ fontFamily: 'system-ui' }}>BMW</text>
          </svg>
        </div>
      </div>

      <h1 className="text-[1.75rem] sm:text-[2rem] font-semibold tracking-[-0.03em] text-foreground mb-2">
        BMW Switzerland
      </h1>
      <p className="text-[15px] text-foreground/45 text-center max-w-md mb-12 leading-relaxed">
        AI-powered dealership operations and customer experience platform.
      </p>

      <div className="w-full max-w-2xl space-y-10">
        {/* Dealership Experience */}
        <section>
          <div className="flex items-center gap-2 mb-4 px-1">
            <Building2 className="w-4 h-4 text-foreground/30" />
            <h2 className="text-[13px] font-semibold text-foreground/40 uppercase tracking-[0.08em]">Dealership Experience</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {dealershipModules.map((m) => (
              <ModuleCard key={m.href} {...m} />
            ))}
          </div>
        </section>

        {/* Test Drive Engine */}
        <section>
          <div className="flex items-center gap-2 mb-4 px-1">
            <Car className="w-4 h-4 text-[#1c69d4]/50" />
            <h2 className="text-[13px] font-semibold text-[#1c69d4]/60 uppercase tracking-[0.08em]">Test Drive Booking Engine</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {testDriveModules.map((m) => (
              <ModuleCard key={m.href} {...m} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
