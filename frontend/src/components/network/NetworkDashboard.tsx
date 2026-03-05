import { useState, useEffect } from 'react'
import {
  Building2, MessageSquare, Zap, TrendingUp, Bot,
  Car, BarChart3, Wrench,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

// ── Types ────────────────────────────────────────────────

interface NetworkStats {
  total_vehicles: number
  dealer_count: number
  total_leads: number
  new_leads_today: number
  total_conversations: number
  active_conversations: number
  total_messages: number
  avg_score: number
  ev_demand_pct: number
  ev_stock_pct: number
  lead_funnel: Record<string, number>
  total_service_requests: number
  pending_service_requests: number
  service_breakdown: Record<string, number>
}

interface DemandItem {
  series?: string
  fuel_type?: string
  body_type?: string
  demand: number
  supply: number
}

interface DemandData {
  series_demand: DemandItem[]
  fuel_demand: DemandItem[]
  body_demand: DemandItem[]
  price_segments: Record<string, number>
  series_supply: { series: string; count: number }[]
  fuel_supply: { fuel_type: string; count: number }[]
}

interface DealerPerf {
  dealer_name: string
  dealer_id: string
  stock: number
  avg_price: number
  leads: number
  avg_lead_score: number
}

interface ActivityItem {
  id: number
  event_type: string
  title: string
  description?: string
  created_at?: string
}

// ── API Calls ────────────────────────────────────────────

const API = '/api/network'

async function fetchNetworkStats(): Promise<NetworkStats> {
  const r = await fetch(`${API}/stats`)
  return r.json()
}

async function fetchDemand(): Promise<DemandData> {
  const r = await fetch(`${API}/demand`)
  return r.json()
}

async function fetchDealers(): Promise<{ dealers: DealerPerf[] }> {
  const r = await fetch(`${API}/dealers`)
  return r.json()
}

async function fetchActivity(): Promise<ActivityItem[]> {
  const r = await fetch(`${API}/activity?limit=30`)
  return r.json()
}

async function fetchAiBrief(): Promise<{ brief: string; tool_calls: { name: string; result_summary: string }[] }> {
  const r = await fetch(`${API}/ai-brief`)
  return r.json()
}

// ── Helpers ──────────────────────────────────────────────

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

function formatBody(bt?: string) {
  if (!bt) return ''
  return bt.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

const eventPrefix: Record<string, string> = {
  new_lead: '+',
  message: '>',
  vehicle_shown: '*',
  email_sent: '@',
  status_change: '~',
  takeover: '!',
  handback: '<',
  service_request: '⚙',
}

// ── Components ───────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl px-4 py-3.5 ${accent ? 'border border-emerald-500/20 bg-emerald-500/[0.06]' : 'border border-white/[0.06] bg-white/[0.03]'}`}>
      <p className="text-[11px] text-white/30 mb-1.5 tracking-wide">{label}</p>
      <p className={`text-[22px] font-semibold tabular-nums tracking-[-0.02em] ${accent ? 'text-emerald-400' : 'text-white/90'}`}>
        {value}
        {sub && <span className="text-sm font-normal text-muted-foreground ml-0.5">{sub}</span>}
      </p>
    </div>
  )
}

function HorizontalBar({ items, maxVal }: { items: { label: string; value: number; supply?: number }[]; maxVal: number }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground w-20 text-right shrink-0 truncate" title={item.label}>{item.label}</span>
          <div className="flex-1 h-5 bg-secondary/50 rounded-sm overflow-hidden relative">
            {item.supply !== undefined && item.supply > 0 && (
              <div
                className="absolute inset-y-0 left-0 bg-border/40 rounded-sm"
                style={{ width: `${Math.min((item.supply / maxVal) * 100, 100)}%` }}
              />
            )}
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-sm transition-all duration-500"
              style={{ width: `${Math.min((item.value / maxVal) * 100, 100)}%` }}
            />
          </div>
          <span className="text-[11px] text-foreground tabular-nums w-8 text-right shrink-0">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main Dashboard ───────────────────────────────────────

export function NetworkDashboard() {
  const [stats, setStats] = useState<NetworkStats | null>(null)
  const [demand, setDemand] = useState<DemandData | null>(null)
  const [dealers, setDealers] = useState<DealerPerf[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [brief, setBrief] = useState<string | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefTools, setBriefTools] = useState<{ name: string; result_summary: string }[]>([])

  useEffect(() => {
    const load = () => {
      fetchNetworkStats().then(setStats).catch(() => {})
      fetchDemand().then(setDemand).catch(() => {})
      fetchDealers().then((d) => setDealers(d.dealers)).catch(() => {})
      fetchActivity().then(setActivity).catch(() => {})
    }
    load()
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setBriefLoading(true)
    fetchAiBrief()
      .then((r) => { setBrief(r.brief); setBriefTools(r.tool_calls || []) })
      .catch(() => setBrief(null))
      .finally(() => setBriefLoading(false))
  }, [])

  const seriesMax = demand?.series_demand.length ? Math.max(...demand.series_demand.map(d => Math.max(d.demand, d.supply))) : 1
  const fuelMax = demand?.fuel_demand.length ? Math.max(...demand.fuel_demand.map(d => Math.max(d.demand, d.supply))) : 1
  const bodyMax = demand?.body_demand.length ? Math.max(...demand.body_demand.map(d => Math.max(d.demand, d.supply))) : 1

  return (
    <div className="backoffice flex flex-col h-[100dvh] bg-[#0c0d11] text-white/85 font-sans text-[13px]">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 48 48" className="w-6 h-6" fill="none">
            <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" className="text-white/20" />
            <text x="24" y="28" textAnchor="middle" className="fill-white/50 text-[9px] font-semibold" style={{ fontFamily: 'system-ui' }}>BMW</text>
          </svg>
          <div>
            <span className="text-[15px] font-medium text-white/90 tracking-[-0.01em]">BMW Switzerland</span>
            <span className="text-[15px] text-white/25 ml-2">Network</span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-pulse-dot absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[12px] text-emerald-400/80">{stats?.dealer_count ?? '—'} dealers</span>
          </div>
          <nav className="flex items-center gap-1">
            <a href="/" className="px-3 py-1.5 rounded-lg text-[12px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all">Home</a>
            <a href="/chat" className="px-3 py-1.5 rounded-lg text-[12px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all">Chat</a>
            <a href="/inventory" className="px-3 py-1.5 rounded-lg text-[12px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all">Stock</a>
            <a href="/backoffice" className="px-3 py-1.5 rounded-lg text-[12px] text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-all">Dealer</a>
          </nav>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-5 space-y-4 max-w-[1400px] mx-auto">

          {/* AI Executive Brief */}
          <div className="rounded-xl border border-blue-500/15 bg-blue-500/[0.04]">
            <div className="px-4 py-2 border-b border-blue-500/10 flex items-center gap-2">
              <Bot className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-primary font-medium">executive brief</span>
              {briefTools.length > 0 && (
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {briefTools.map(t => t.name).join(' → ')}
                </span>
              )}
            </div>
            <div className="px-4 py-3">
              {briefLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  analyzing network data...
                </div>
              ) : brief ? (
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{brief}</p>
              ) : (
                <p className="text-xs text-muted-foreground">briefing unavailable</p>
              )}
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <KpiCard label="inventory" value={stats?.total_vehicles ?? 0} />
            <KpiCard label="dealers" value={stats?.dealer_count ?? 0} />
            <KpiCard label="leads" value={stats?.total_leads ?? 0} />
            <KpiCard label="conversations" value={stats?.total_conversations ?? 0} />
            <KpiCard label="avg score" value={stats?.avg_score?.toFixed(0) ?? 0} sub="/100" />
            <KpiCard label="ev demand" value={`${stats?.ev_demand_pct ?? 0}%`} accent />
            <KpiCard label="service reqs" value={stats?.total_service_requests ?? 0} />
            <KpiCard label="svc pending" value={stats?.pending_service_requests ?? 0} accent />
          </div>

          {/* Lead Funnel */}
          {stats && stats.lead_funnel && Object.keys(stats.lead_funnel).length > 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">lead_pipeline</span>
              </div>
              <div className="px-4 py-3 flex items-center gap-1">
                {['new', 'contacted', 'qualified', 'converted', 'lost'].map((stage, i) => {
                  const count = stats.lead_funnel[stage] || 0
                  const colors: Record<string, string> = {
                    new: 'bg-emerald-500',
                    contacted: 'bg-blue-500',
                    qualified: 'bg-purple-500',
                    converted: 'bg-amber-500',
                    lost: 'bg-red-500/50',
                  }
                  const total = Object.values(stats.lead_funnel).reduce((a, b) => a + b, 0)
                  const pct = total > 0 ? Math.max((count / total) * 100, 2) : 0
                  return (
                    <div key={stage} className="flex-1" style={{ flex: Math.max(pct, 8) }}>
                      <div className={`h-8 ${colors[stage]} rounded-sm flex items-center justify-center transition-all duration-500 ${i > 0 ? 'ml-0.5' : ''}`}>
                        {count > 0 && (
                          <span className="text-[10px] font-medium text-white">{count}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground text-center mt-1">{stage}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Service Requests Breakdown */}
          {stats && stats.service_breakdown && Object.keys(stats.service_breakdown).length > 0 && (() => {
            const serviceLabels: Record<string, string> = {
              maintenance: 'Maintenance',
              repair: 'Repair',
              tire_change: 'Tire Change',
              inspection: 'Inspection (MFK)',
              recall: 'Recall',
              other: 'Other',
            }
            const serviceColors: Record<string, string> = {
              maintenance: 'bg-blue-500',
              repair: 'bg-amber-500',
              tire_change: 'bg-emerald-500',
              inspection: 'bg-purple-500',
              recall: 'bg-red-500',
              other: 'bg-gray-500',
            }
            const entries = Object.entries(stats.service_breakdown).sort((a, b) => b[1] - a[1])
            const maxSvc = Math.max(...entries.map(e => e[1]), 1)
            return (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5">
                  <Wrench className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">service_requests</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{stats.total_service_requests} total — {stats.pending_service_requests} pending</span>
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                    {entries.map(([stype, count]) => (
                      <div key={stype} className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground w-24 text-right shrink-0">
                          {serviceLabels[stype] || stype}
                        </span>
                        <div className="flex-1 h-5 bg-secondary/50 rounded-sm overflow-hidden relative">
                          <div
                            className={`absolute inset-y-0 left-0 ${serviceColors[stype] || 'bg-primary'} rounded-sm transition-all duration-500`}
                            style={{ width: `${Math.min((count / maxSvc) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-foreground tabular-nums w-6 text-right shrink-0">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Demand Intelligence */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Series Demand */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5">
                <BarChart3 className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">demand_by_series</span>
                <span className="text-[10px] text-muted-foreground ml-auto flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-sm bg-primary" /> demand
                  <span className="inline-block w-2 h-2 rounded-sm bg-border/40" /> stock
                </span>
              </div>
              <div className="p-4">
                {demand && demand.series_demand.length > 0 ? (
                  <HorizontalBar
                    items={demand.series_demand.slice(0, 10).map(d => ({
                      label: d.series || '?',
                      value: d.demand,
                      supply: d.supply,
                    }))}
                    maxVal={seriesMax}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">no demand data yet — interact with chat to generate</p>
                )}
              </div>
            </div>

            {/* Fuel Type Demand */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">fuel_type_demand</span>
                <span className="text-[10px] text-muted-foreground ml-auto">ev transition tracking</span>
              </div>
              <div className="p-4">
                {demand && demand.fuel_demand.length > 0 ? (
                  <HorizontalBar
                    items={demand.fuel_demand.map(d => ({
                      label: d.fuel_type === 'ELECTRIC' ? 'Electric' : d.fuel_type === 'GASOLINE' ? 'Petrol' : d.fuel_type || '?',
                      value: d.demand,
                      supply: d.supply,
                    }))}
                    maxVal={fuelMax}
                  />
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground mb-3">customer demand — no interaction data yet</p>
                    {demand?.fuel_supply?.map(fs => (
                      <div key={fs.fuel_type} className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground w-20 text-right shrink-0">
                          {fs.fuel_type === 'ELECTRIC' ? 'Electric' : fs.fuel_type === 'GASOLINE' ? 'Petrol' : fs.fuel_type}
                        </span>
                        <div className="flex-1 h-5 bg-secondary/50 rounded-sm overflow-hidden relative">
                          <div
                            className="absolute inset-y-0 left-0 bg-border/40 rounded-sm"
                            style={{ width: `${(fs.count / (stats?.total_vehicles || 1)) * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right shrink-0">{fs.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* EV Demand vs Stock mini */}
              {stats && (
                <div className="px-4 pb-3 flex items-center gap-4 border-t border-border pt-3 mt-0">
                  <div>
                    <p className="text-[10px] text-muted-foreground">ev in stock</p>
                    <p className="text-sm font-bold text-foreground tabular-nums">{stats.ev_stock_pct}%</p>
                  </div>
                  <div className="w-px h-6 bg-border" />
                  <div>
                    <p className="text-[10px] text-muted-foreground">ev customer demand</p>
                    <p className={`text-sm font-bold tabular-nums ${stats.ev_demand_pct > stats.ev_stock_pct ? 'text-emerald-400' : 'text-foreground'}`}>
                      {stats.ev_demand_pct}%
                    </p>
                  </div>
                  {stats.ev_demand_pct > stats.ev_stock_pct && (
                    <span className="text-[10px] text-emerald-400 ml-auto">demand outpacing supply</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Body Type + Price Segments */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5">
                <Car className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">body_type_demand</span>
              </div>
              <div className="p-4">
                {demand && demand.body_demand.length > 0 ? (
                  <HorizontalBar
                    items={demand.body_demand.slice(0, 8).map(d => ({
                      label: formatBody(d.body_type),
                      value: d.demand,
                      supply: d.supply,
                    }))}
                    maxVal={bodyMax}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">no data yet</p>
                )}
              </div>
            </div>

            {/* Price Segment Demand */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">price_segment_demand</span>
              </div>
              <div className="p-4">
                {demand ? (() => {
                  const segs = [
                    { label: '< 50k', key: 'under_50k' },
                    { label: '50–100k', key: '50k_100k' },
                    { label: '100–150k', key: '100k_150k' },
                    { label: '> 150k', key: 'over_150k' },
                  ]
                  const maxSeg = Math.max(...segs.map(s => demand.price_segments[s.key] || 0), 1)
                  return (
                    <HorizontalBar
                      items={segs.map(s => ({
                        label: `CHF ${s.label}`,
                        value: demand.price_segments[s.key] || 0,
                      }))}
                      maxVal={maxSeg}
                    />
                  )
                })() : (
                  <p className="text-xs text-muted-foreground">no data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Dealer Network + Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Dealer Leaderboard */}
            <div className="lg:col-span-2 rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5">
                <Building2 className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">dealer_network</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{dealers.length} dealers</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-muted-foreground">
                      <th className="text-left px-4 py-2 font-normal">#</th>
                      <th className="text-left px-2 py-2 font-normal">dealer</th>
                      <th className="text-right px-2 py-2 font-normal">stock</th>
                      <th className="text-right px-2 py-2 font-normal">avg price</th>
                      <th className="text-right px-2 py-2 font-normal">leads</th>
                      <th className="text-right px-4 py-2 font-normal">score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealers.slice(0, 15).map((d, i) => (
                      <tr key={d.dealer_name} className="border-b border-white/[0.06] last:border-0 hover:bg-secondary/30 transition-colors">
                        <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-2 text-foreground truncate max-w-[200px]">{d.dealer_name}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{d.stock}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                          {d.avg_price ? `${Math.round(d.avg_price).toLocaleString('de-CH')}` : '—'}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          <span className={d.leads > 0 ? 'text-primary font-medium' : 'text-muted-foreground'}>
                            {d.leads}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          <span className={d.avg_lead_score >= 60 ? 'text-emerald-400' : d.avg_lead_score > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                            {d.avg_lead_score > 0 ? d.avg_lead_score : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {dealers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">loading dealers...</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Activity Feed */}
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5">
                <MessageSquare className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">network_activity</span>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {activity.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-muted-foreground text-center">no activity yet</p>
                ) : (
                  activity.map((item) => {
                    const prefix = eventPrefix[item.event_type] || '·'
                    return (
                      <div key={item.id} className="flex items-start gap-2 px-4 py-2 border-b border-white/[0.06] last:border-0 text-xs">
                        <span className="text-primary shrink-0 w-3 text-center">{prefix}</span>
                        <div className="min-w-0 flex-1">
                          <span className="text-foreground">{item.title}</span>
                          {item.description && (
                            <span className="text-muted-foreground ml-1.5">— {item.description}</span>
                          )}
                        </div>
                        <span className="shrink-0 text-muted-foreground tabular-nums">{timeAgo(item.created_at)}</span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
