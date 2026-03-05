import { useState, useEffect, useMemo } from 'react'
import { Search, Zap, Fuel, Filter, X, ChevronRight, Battery } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

const API_BASE = '/api'

interface TestDriveModel {
  id: string
  name: string
  series: string
  body_type: string
  powertrain: string  // electric | hybrid | gasoline | diesel
  starting_price: number
  power_hp?: number
  range_km?: number
  image?: string
  url?: string
  highlight?: string
}

interface FleetStats {
  total_vehicles: number
  series_breakdown: Record<string, number>
  powertrain_breakdown: Record<string, number>
  body_type_breakdown: Record<string, number>
  price_range: { min: number | null; max: number | null; avg: number | null }
}

interface FleetFilterOptions {
  series: string[]
  powertrains: string[]
  body_types: string[]
}

const formatCHF = (v: number | null | undefined) =>
  v != null ? `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0 })}` : '–'

const powertrainLabel = (p: string) =>
  ({ electric: 'Elektrisch', hybrid: 'Plug-in Hybrid', gasoline: 'Benzin', diesel: 'Diesel' }[p] ?? p)

const powertrainColor = (p: string) =>
  p === 'electric' ? 'bg-emerald-500/90 text-white' :
  p === 'hybrid' ? 'bg-blue-500/90 text-white' :
  'bg-white/90 text-[#333]'

const powertrainIcon = (p: string) =>
  p === 'electric' ? <Zap className="w-3.5 h-3.5" /> :
  p === 'hybrid' ? <Battery className="w-3.5 h-3.5" /> :
  <Fuel className="w-3.5 h-3.5" />

export function TestDriveInventory() {
  const [models, setModels] = useState<TestDriveModel[]>([])
  const [stats, setStats] = useState<FleetStats | null>(null)
  const [filterOptions, setFilterOptions] = useState<FleetFilterOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedModel, setSelectedModel] = useState<TestDriveModel | null>(null)

  const [search, setSearch] = useState('')
  const [series, setSeries] = useState('')
  const [powertrain, setPowertrain] = useState('')
  const [bodyType, setBodyType] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`${API_BASE}/testdrive/vehicles`).then(r => r.json()),
      fetch(`${API_BASE}/testdrive/vehicles/stats`).then(r => r.json()),
      fetch(`${API_BASE}/testdrive/vehicles/filter-options`).then(r => r.json()),
    ])
      .then(([vehicleRes, statsRes, optionsRes]) => {
        setModels(vehicleRes.items)
        setStats(statsRes)
        setFilterOptions(optionsRes)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let result = models
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.series?.toLowerCase().includes(q) ||
        m.highlight?.toLowerCase().includes(q)
      )
    }
    if (series) result = result.filter(m => m.series === series)
    if (powertrain) result = result.filter(m => m.powertrain === powertrain)
    if (bodyType) result = result.filter(m => m.body_type === bodyType)
    return result
  }, [models, search, series, powertrain, bodyType])

  const hasFilters = search || series || powertrain || bodyType
  const clearFilters = () => { setSearch(''); setSeries(''); setPowertrain(''); setBodyType('') }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#f8f8f8]">
      {/* Header */}
      <header className="px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 border-b border-[#e6e6e6] bg-white">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 48 48" className="w-7 h-7" fill="none">
            <circle cx="24" cy="24" r="23" stroke="currentColor" strokeWidth="1.5" className="text-[#1c1c1c]/20" />
            <text x="24" y="28" textAnchor="middle" className="fill-[#1c1c1c]/70 text-[9px] font-semibold tracking-[0.08em]" style={{ fontFamily: 'system-ui' }}>BMW</text>
          </svg>
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#1c1c1c]">Probefahrt Modelle</span>
            <span className="text-[11px] text-[#999] tracking-[0.02em]">Test Drive Model Catalog</span>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          <a href="/" className="px-3 py-1.5 rounded-lg text-[13px] text-[#666] hover:text-[#1c1c1c] hover:bg-[#f0f0f0] transition-all">Home</a>
          <a href="/testdrive" className="px-3 py-1.5 rounded-lg text-[13px] text-[#1c69d4]/70 hover:text-[#1c69d4] hover:bg-[#1c69d4]/[0.06] font-medium transition-all">Book Test Drive</a>
        </nav>
      </header>

      {/* Stats */}
      {stats && (
        <div className="px-4 sm:px-6 py-3 border-b border-[#e6e6e6] bg-white shrink-0">
          <div className="max-w-6xl mx-auto flex items-center gap-6 overflow-x-auto">
            <Stat label="Test Drive Models" value={String(stats.total_vehicles)} accent />
            <Stat label="Elektrisch" value={String(stats.powertrain_breakdown['electric'] || 0)} />
            <Stat label="Hybrid" value={String(stats.powertrain_breakdown['hybrid'] || 0)} />
            <Stat label="Benzin" value={String(stats.powertrain_breakdown['gasoline'] || 0)} />
            <Stat label="Ab" value={formatCHF(stats.price_range.min)} />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="px-4 sm:px-6 py-3 border-b border-[#e6e6e6] bg-white shrink-0">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#999]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Modell suchen..."
              className="w-full bg-[#f5f5f5] border border-[#e6e6e6] rounded-lg pl-9 pr-4 py-2 text-[13px] text-[#1c1c1c] placeholder:text-[#999] outline-none focus:border-[#1c69d4]/30 transition-all"
            />
          </div>
          <FilterPill label="Serie" value={series} options={filterOptions?.series ?? []} onChange={setSeries} />
          <FilterPill label="Antrieb" value={powertrain} options={filterOptions?.powertrains ?? []} onChange={setPowertrain} format={powertrainLabel} />
          <FilterPill label="Karosserie" value={bodyType} options={filterOptions?.body_types ?? []} onChange={setBodyType} />
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] text-[#999] hover:text-[#1c1c1c] hover:bg-[#f0f0f0] transition-all">
              <X className="w-3 h-3" /> Zurücksetzen
            </button>
          )}
          <span className="ml-auto text-[12px] text-[#999]">
            {filtered.length === models.length ? `${models.length} Modelle` : `${filtered.length} von ${models.length}`}
          </span>
        </div>
      </div>

      {/* Grid + Detail */}
      <div className="flex-1 flex min-h-0">
        <ScrollArea className={`flex-1 px-4 sm:px-6 py-4 ${selectedModel ? 'hidden sm:block' : ''}`}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:0ms]" />
                <span className="w-2 h-2 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:200ms]" />
                <span className="w-2 h-2 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:400ms]" />
              </div>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(m => (
                <div
                  key={m.id}
                  onClick={() => setSelectedModel(m)}
                  className={`group bg-white rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden hover:shadow-md ${
                    selectedModel?.id === m.id ? 'border-[#1c69d4] shadow-md' : 'border-[#e6e6e6] hover:border-[#ccc]'
                  }`}
                >
                  <div className="aspect-[16/9] bg-gradient-to-br from-[#f5f5f5] to-[#e8e8e8] relative overflow-hidden flex items-center justify-center">
                    {m.image ? (
                      <img src={m.image} alt={m.name} loading="lazy" className="w-[85%] h-auto object-contain group-hover:scale-105 transition-transform duration-500 drop-shadow-lg" />
                    ) : (
                      <span className="text-[#ccc] text-[40px] font-bold">BMW</span>
                    )}
                    <div className={`absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium backdrop-blur-sm ${powertrainColor(m.powertrain)}`}>
                      {powertrainIcon(m.powertrain)}
                      {powertrainLabel(m.powertrain)}
                    </div>
                    {m.range_km && (
                      <div className="absolute bottom-3 left-3 px-2 py-1 rounded-full bg-black/60 text-white text-[10px] font-medium backdrop-blur-sm">
                        {m.range_km} km Reichweite
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-[14px] font-semibold text-[#1c1c1c] truncate leading-tight">{m.name}</h3>
                        <p className="text-[12px] text-[#888] mt-0.5">
                          {m.series && <span className="font-medium text-[#1c69d4]">{m.series}</span>}
                          {m.body_type && <> &middot; {m.body_type}</>}
                          {m.power_hp && <> &middot; {m.power_hp} PS</>}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#ccc] shrink-0 mt-0.5 group-hover:text-[#1c69d4] transition-colors" />
                    </div>

                    {m.highlight && (
                      <p className="text-[11px] text-[#999] mt-2 line-clamp-1">{m.highlight}</p>
                    )}

                    <div className="flex items-end justify-between mt-3">
                      <span className="text-[15px] font-bold text-[#1c1c1c]">ab {formatCHF(m.starting_price)}</span>
                      <a
                        href="/testdrive"
                        onClick={e => e.stopPropagation()}
                        className="px-3 py-1.5 rounded-lg bg-[#1c69d4] text-white text-[11px] font-medium hover:bg-[#1557b0] transition-colors"
                      >
                        Probefahrt
                      </a>
                    </div>
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-16">
                  <Filter className="w-8 h-8 text-[#ccc] mb-3" />
                  <p className="text-[14px] text-[#999]">Keine Modelle gefunden</p>
                  <button onClick={clearFilters} className="text-[13px] text-[#1c69d4] mt-2 hover:underline">Filter zurücksetzen</button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Detail Panel */}
        {selectedModel && (
          <div className="w-full sm:w-[400px] shrink-0 border-l border-[#e6e6e6] bg-white">
            <ModelDetail model={selectedModel} onClose={() => setSelectedModel(null)} />
          </div>
        )}
      </div>
    </div>
  )
}


function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col shrink-0">
      <span className={`text-[18px] font-bold ${accent ? 'text-[#1c69d4]' : 'text-[#1c1c1c]'}`}>{value}</span>
      <span className="text-[11px] text-[#999] whitespace-nowrap">{label}</span>
    </div>
  )
}


function FilterPill({ label, value, options, onChange, format }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; format?: (v: string) => string
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`px-3 py-2 rounded-lg border text-[12px] outline-none transition-all cursor-pointer ${
        value ? 'border-[#1c69d4]/30 bg-[#1c69d4]/[0.04] text-[#1c69d4]' : 'border-[#e6e6e6] bg-[#f5f5f5] text-[#666]'
      }`}
    >
      <option value="">Alle {label}</option>
      {options.map(opt => (
        <option key={opt} value={opt}>{format ? format(opt) : opt}</option>
      ))}
    </select>
  )
}


function ModelDetail({ model, onClose }: { model: TestDriveModel; onClose: () => void }) {
  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[16px] font-bold text-[#1c1c1c] leading-tight">{model.name}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[#f0f0f0] flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        {model.image && (
          <div className="aspect-[16/9] rounded-xl overflow-hidden bg-gradient-to-br from-[#f5f5f5] to-[#e8e8e8] mb-4 flex items-center justify-center">
            <img src={model.image} alt={model.name} className="w-[85%] h-auto object-contain drop-shadow-lg" />
          </div>
        )}

        <div className="mb-4">
          <span className="text-[22px] font-bold text-[#1c1c1c]">ab {formatCHF(model.starting_price)}</span>
        </div>

        {model.highlight && (
          <p className="text-[13px] text-[#666] mb-4 leading-relaxed">{model.highlight}</p>
        )}

        <div className="space-y-2 mb-4">
          <DetailRow label="Serie" value={model.series} />
          <DetailRow label="Karosserie" value={model.body_type} />
          <DetailRow label="Antrieb" value={powertrainLabel(model.powertrain)} />
          {model.power_hp && <DetailRow label="Leistung" value={`${model.power_hp} PS`} />}
          {model.range_km && <DetailRow label="Reichweite" value={`${model.range_km} km`} />}
        </div>

        <a
          href="/testdrive"
          className="block w-full py-3 rounded-xl bg-[#1c69d4] text-white text-center text-[14px] font-semibold hover:bg-[#1557b0] transition-colors"
        >
          Probefahrt buchen
        </a>

        {model.url && (
          <a href={model.url} target="_blank" rel="noopener noreferrer" className="block text-center text-[12px] text-[#1c69d4] mt-3 hover:underline">
            Auf BMW.ch ansehen
          </a>
        )}
      </div>
    </ScrollArea>
  )
}


function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-[#999]">{label}</span>
      <span className="text-[#1c1c1c] font-medium">{value}</span>
    </div>
  )
}
