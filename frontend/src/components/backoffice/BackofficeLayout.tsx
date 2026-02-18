import { useState } from 'react'
import { Sidebar, type BackofficeView } from './Sidebar'
import { DashboardView } from './DashboardView'
import { LeadsView } from './LeadsView'
import { ConversationsView } from './ConversationsView'
import { LiveMonitorView } from './LiveMonitorView'
import { AgentChat } from './AgentChat'

const viewLabels: Record<BackofficeView, string> = {
  dashboard: 'Overview',
  leads: 'Lead Pipeline',
  conversations: 'Conversations',
  live: 'Live Monitor',
  agent: 'AI Agent',
}

export function BackofficeLayout() {
  const [view, setView] = useState<BackofficeView>('dashboard')

  return (
    <div className="backoffice flex h-[100dvh] bg-[#0c0d11] text-white/85 font-sans text-[13px]">
      <Sidebar active={view} onNavigate={setView} />
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-medium text-white/90 tracking-[-0.01em]">{viewLabels[view]}</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse-dot absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[12px] text-emerald-400/80">AI Active</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 min-h-0 overflow-hidden">
          {view === 'dashboard' && <DashboardView />}
          {view === 'leads' && <LeadsView />}
          {view === 'conversations' && <ConversationsView />}
          {view === 'live' && <LiveMonitorView />}
          {view === 'agent' && <AgentChat />}
        </main>
      </div>
    </div>
  )
}
