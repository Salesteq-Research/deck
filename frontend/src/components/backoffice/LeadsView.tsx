import { useState, useEffect } from 'react'
import { Bot } from 'lucide-react'
import { getLeads, getAiInsight } from '@/lib/api'
import { StatusBadge } from './StatusBadge'
import { ScoreBadge } from './ScoreBadge'
import { LeadDetailPanel } from './LeadDetailPanel'
import type { Lead, LeadStatus } from '@/lib/types'

const filters: (LeadStatus | 'all')[] = ['all', 'new', 'contacted', 'qualified', 'converted', 'lost']

function timeAgo(dateStr?: string) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function getPriorityIndicator(lead: Lead): { label: string; color: string } | null {
  // High score + new status = hot lead
  if (lead.score >= 70 && lead.status === 'new') {
    return { label: 'hot', color: 'text-red-400' }
  }
  // Has contact info + high engagement
  if (lead.score >= 50 && lead.customer_email && lead.message_count >= 3) {
    return { label: 'ready', color: 'text-amber-400' }
  }
  // Active with vehicles
  if (lead.interested_vehicles.length >= 2 && lead.status === 'new') {
    return { label: 'engaged', color: 'text-emerald-400' }
  }
  return null
}

export function LeadsView() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [leadsInsight, setLeadsInsight] = useState<string | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)

  const loadLeads = () => {
    const status = filter === 'all' ? undefined : filter
    getLeads(status).then(setLeads).catch(() => {})
  }

  useEffect(() => {
    loadLeads()
    const interval = setInterval(loadLeads, 15000)
    return () => clearInterval(interval)
  }, [filter])

  // Load AI overview for leads pipeline
  useEffect(() => {
    setInsightLoading(true)
    getAiInsight('leads_overview')
      .then((res) => setLeadsInsight(res.insight))
      .catch(() => {})
      .finally(() => setInsightLoading(false))
  }, [])

  const statusCounts = leads.reduce<Record<string, number>>((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="flex h-full">
      {/* Lead list */}
      <div className={`${selectedId ? 'w-1/2' : 'w-full'} border-r border-border overflow-y-auto`}>
        {/* AI Pipeline Insight */}
        {!selectedId && (
          <div className="mx-4 mt-3 mb-2 border border-primary/20 rounded-md bg-primary/5">
            <div className="px-3 py-1.5 border-b border-primary/10 flex items-center gap-1.5">
              <Bot className="h-3 w-3 text-primary" />
              <span className="text-[10px] text-primary font-medium">pipeline analysis</span>
            </div>
            <div className="px-3 py-2">
              {insightLoading ? (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="inline-block w-1 h-1 rounded-full bg-primary animate-pulse" />
                  analyzing lead pipeline...
                </div>
              ) : leadsInsight ? (
                <p className="text-[11px] text-foreground leading-relaxed whitespace-pre-wrap">{leadsInsight}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">no analysis available</p>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="px-4 py-2.5 border-b border-border flex gap-1 flex-wrap items-center">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setSelectedId(null) }}
              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                f === filter
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f}{f !== 'all' && statusCounts[f] ? ` (${statusCounts[f]})` : ''}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">{leads.length} leads</span>
        </div>

        {leads.length === 0 ? (
          <div className="p-5 text-xs text-muted-foreground">
            no leads found
          </div>
        ) : (
          <div>
            {leads.map((lead) => {
              const priority = getPriorityIndicator(lead)
              return (
                <button
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  className={`w-full text-left px-4 py-2.5 border-b border-border hover:bg-secondary/50 transition-colors ${
                    selectedId === lead.id ? 'bg-secondary' : ''
                  } ${priority?.label === 'hot' ? 'border-l-2 border-l-red-400/50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-foreground truncate">
                        {lead.customer_name || lead.customer_email || `session:${lead.session_id.slice(0, 8)}`}
                      </span>
                      {priority && (
                        <span className={`text-[9px] uppercase tracking-wider font-medium ${priority.color} shrink-0`}>
                          {priority.label}
                        </span>
                      )}
                    </div>
                    <ScoreBadge score={lead.score} />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={lead.status} />
                    <span className="text-[11px] text-muted-foreground">{lead.message_count} msgs</span>
                    {lead.interested_vehicles.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{lead.interested_vehicles.length} vehicles</span>
                    )}
                    <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">{timeAgo(lead.updated_at)}</span>
                  </div>
                  {lead.summary && (
                    <p className="text-[10px] text-muted-foreground mt-1 truncate">{lead.summary}</p>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedId && (
        <div className="w-1/2 overflow-y-auto">
          <LeadDetailPanel leadId={selectedId} onUpdate={loadLeads} />
        </div>
      )}
    </div>
  )
}
