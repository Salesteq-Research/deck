import { useState } from 'react'
import { Sidebar, type BackofficeView } from './Sidebar'
import { DashboardView } from './DashboardView'
import { LeadsView } from './LeadsView'
import { ConversationsView } from './ConversationsView'
import { LiveMonitorView } from './LiveMonitorView'
import { AgentChat } from './AgentChat'

export function BackofficeLayout() {
  const [view, setView] = useState<BackofficeView>('dashboard')

  return (
    <div className="backoffice flex h-[100dvh] bg-background text-foreground font-mono text-[13px]">
      <Sidebar active={view} onNavigate={setView} />
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-2.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-foreground font-semibold">hedin</span>
            <span className="text-border">/</span>
            <span>{view}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse-dot absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs text-emerald-400">ai active</span>
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
