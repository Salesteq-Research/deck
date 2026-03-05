import { LayoutDashboard, Users, MessageSquare, Bot, Radio, MessageCircle, Globe, Home, Warehouse } from 'lucide-react'

export type BackofficeView = 'dashboard' | 'leads' | 'conversations' | 'live' | 'agent'

interface SidebarProps {
  active: BackofficeView
  onNavigate: (view: BackofficeView) => void
}

const navItems: { id: BackofficeView; icon: typeof LayoutDashboard; label: string }[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'leads', icon: Users, label: 'Leads' },
  { id: 'conversations', icon: MessageSquare, label: 'Conversations' },
  { id: 'live', icon: Radio, label: 'Live Monitor' },
  { id: 'agent', icon: Bot, label: 'Agent' },
]

export function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <div className="flex flex-col w-14 lg:w-52 border-r border-white/[0.06] bg-[#0a0b0f] shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/[0.06]">
        <svg viewBox="0 0 48 48" className="w-6 h-6 shrink-0" fill="none">
          <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" className="text-white/20" />
          <text x="24" y="28" textAnchor="middle" className="fill-white/50 text-[9px] font-semibold" style={{ fontFamily: 'system-ui' }}>BMW</text>
        </svg>
        <div className="hidden lg:block">
          <span className="text-[13px] font-semibold text-white/90 tracking-[-0.01em]">Hedin</span>
          <span className="text-[13px] text-white/30 ml-1.5">Dealer</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 px-2">
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-150 ${
                active === item.id
                  ? 'text-white bg-white/[0.08]'
                  : 'text-white/35 hover:text-white/60 hover:bg-white/[0.04]'
              }`}
            >
              <item.icon className="h-[15px] w-[15px] shrink-0" strokeWidth={active === item.id ? 2 : 1.5} />
              <span className="hidden lg:block">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Bottom links */}
      <div className="border-t border-white/[0.06] p-2 space-y-0.5">
        <a
          href="/"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-all"
        >
          <Home className="h-[15px] w-[15px] shrink-0" strokeWidth={1.5} />
          <span className="hidden lg:block">Home</span>
        </a>
        <a
          href="/chat"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-all"
        >
          <MessageCircle className="h-[15px] w-[15px] shrink-0" strokeWidth={1.5} />
          <span className="hidden lg:block">Chat</span>
        </a>
        <a
          href="/inventory"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-all"
        >
          <Warehouse className="h-[15px] w-[15px] shrink-0" strokeWidth={1.5} />
          <span className="hidden lg:block">Stock</span>
        </a>
        <a
          href="/network"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-all"
        >
          <Globe className="h-[15px] w-[15px] shrink-0" strokeWidth={1.5} />
          <span className="hidden lg:block">Network</span>
        </a>
      </div>
    </div>
  )
}
