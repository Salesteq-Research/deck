import { useState, useEffect } from 'react'
import { Bot, Users, TrendingUp } from 'lucide-react'
import { KpiCard } from './KpiCard'
import { ActivityFeed } from './ActivityFeed'
import { getBackofficeStats, getLeads, getAiInsight } from '@/lib/api'
import type { BackofficeStats, Lead } from '@/lib/types'

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

export function DashboardView() {
  const [stats, setStats] = useState<BackofficeStats | null>(null)
  const [recentLeads, setRecentLeads] = useState<Lead[]>([])
  const [insight, setInsight] = useState<string | null>(null)
  const [insightLoading, setInsightLoading] = useState(false)
  const [insightTools, setInsightTools] = useState<{ name: string; result_summary: string }[]>([])

  useEffect(() => {
    const load = () => {
      getBackofficeStats().then(setStats).catch(() => {})
      getLeads().then((leads) => setRecentLeads(leads.slice(0, 5))).catch(() => {})
    }
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setInsightLoading(true)
    getAiInsight('dashboard')
      .then((res) => {
        setInsight(res.insight)
        setInsightTools(res.tool_calls || [])
      })
      .catch(() => setInsight(null))
      .finally(() => setInsightLoading(false))
  }, [])

  return (
    <div className="p-5 space-y-4 overflow-y-auto h-full">
      {/* AI Insight Banner */}
      <div className="border border-border rounded-md bg-card">
        <div className="px-4 py-2 border-b border-border flex items-center gap-2">
          <Bot className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-primary font-medium">agent insight</span>
          {insightTools.length > 0 && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              {insightTools.map(t => t.name).join(', ')}
            </span>
          )}
        </div>
        <div className="px-4 py-3">
          {insightLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              analyzing dealership data...
            </div>
          ) : insight ? (
            <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{insight}</p>
          ) : (
            <p className="text-xs text-muted-foreground">no insight available</p>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label="vehicles" value={stats?.total_vehicles ?? 0} />
        <KpiCard label="leads" value={stats?.total_leads ?? 0} />
        <KpiCard label="new_today" value={stats?.new_leads_today ?? 0} />
        <KpiCard label="active_chats" value={stats?.active_conversations ?? 0} />
        <KpiCard label="avg_score" value={stats?.avg_score?.toFixed(0) ?? 0} sub="/100" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Top vehicles — rich display */}
        <div className="border border-border rounded-md bg-card">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">top_vehicles</span>
          </div>
          <div className="divide-y divide-border">
            {!stats || stats.top_vehicles.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">no data</p>
            ) : (
              stats.top_vehicles.map((v, i) => (
                <div key={v.vin} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-4 text-right shrink-0">{i + 1}.</span>
                  {v.image && (
                    <img
                      src={v.image}
                      alt={v.name || v.vin}
                      className="w-14 h-10 object-cover rounded shrink-0 bg-secondary"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-foreground truncate">
                      {v.name || v.vin}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {v.series && <span className="text-[10px] text-muted-foreground">{v.series}</span>}
                      {v.fuel_type && <span className="text-[10px] text-muted-foreground">· {v.fuel_type}</span>}
                      {v.color && <span className="text-[10px] text-muted-foreground">· {v.color}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-primary font-medium tabular-nums">
                      {v.count} lead{v.count > 1 ? 's' : ''}
                    </div>
                    {v.price_offer && (
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        CHF {v.price_offer.toLocaleString('de-CH', { maximumFractionDigits: 0 })}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Leads */}
        <div className="border border-border rounded-md bg-card">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-1.5">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">recent_leads</span>
          </div>
          <div className="divide-y divide-border">
            {recentLeads.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">no leads</p>
            ) : (
              recentLeads.map((lead) => {
                const isHot = lead.score >= 70 && lead.status === 'new'
                return (
                  <div key={lead.id} className={`px-4 py-2.5 ${isHot ? 'border-l-2 border-l-red-400/50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-foreground truncate">
                          {lead.customer_name || lead.customer_email || `session:${lead.session_id.slice(0, 8)}`}
                        </span>
                        {isHot && (
                          <span className="text-[9px] uppercase tracking-wider font-medium text-red-400 shrink-0">hot</span>
                        )}
                      </div>
                      <span className={`text-[11px] tabular-nums shrink-0 ${
                        lead.score >= 70 ? 'text-primary' : 'text-muted-foreground'
                      }`}>
                        {lead.score}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] ${
                        lead.status === 'new' ? 'text-emerald-400' :
                        lead.status === 'contacted' ? 'text-blue-400' :
                        'text-muted-foreground'
                      }`}>{lead.status}</span>
                      <span className="text-[10px] text-muted-foreground">{lead.message_count} msgs</span>
                      {lead.interested_vehicles.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">{lead.interested_vehicles.length} vehicles</span>
                      )}
                      <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">{timeAgo(lead.updated_at)}</span>
                    </div>
                    {lead.summary && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{lead.summary}</p>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Activity */}
        <ActivityFeed />
      </div>
    </div>
  )
}
