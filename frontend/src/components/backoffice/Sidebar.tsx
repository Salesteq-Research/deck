import { LayoutDashboard, Users, MessageSquare, Bot, Radio, MessageCircle, Terminal, Globe } from 'lucide-react'

export type BackofficeView = 'dashboard' | 'leads' | 'conversations' | 'live' | 'agent'

interface SidebarProps {
  active: BackofficeView
  onNavigate: (view: BackofficeView) => void
}

const navItems: { id: BackofficeView; icon: typeof LayoutDashboard; label: string }[] = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'leads', icon: Users, label: 'Leads' },
  { id: 'conversations', icon: MessageSquare, label: 'Conversations' },
  { id: 'live', icon: Radio, label: 'Live' },
  { id: 'agent', icon: Bot, label: 'Agent' },
]

export function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <div className="flex flex-col w-14 lg:w-48 border-r border-border bg-background shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-border">
        <Terminal className="h-4 w-4 text-primary shrink-0" />
        <span className="hidden lg:block text-xs font-semibold text-foreground tracking-wide uppercase">Hedin</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
              active === item.id
                ? 'text-primary bg-primary/10 border-r-2 border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <item.icon className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:block">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-border py-1">
        <a
          href="/network"
          className="flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Globe className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden lg:block">BMW CH Network</span>
        </a>
        <a
          href="/"
          className="flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden lg:block">Customer Chat</span>
        </a>
      </div>
    </div>
  )
}
