import { useState, useEffect, useMemo } from 'react'
import { Search, Car, Fuel, Zap, Filter, X, ChevronRight } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatCHF, formatFuelType, formatBodyType } from '@/lib/utils'
import type { Vehicle } from '@/lib/types'

const API_BASE = '/api'

interface FleetStats {
  total_vehicles: number
  series_breakdown: Record<string, number>
  fuel_type_breakdown: Record<string, number>
  body_type_breakdown: Record<string, number>
  price_range: { min: number | null; max: number | null; avg: number | null }
}

interface FleetFilterOptions {
  series: string[]
  fuel_types: string[]
  body_types: string[]
  colors: string[]
  drive_types: string[]
}

export function TestDriveInventory() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [stats, setStats] = useState<FleetStats | null>(null)
  const [filterOptions, setFilterOptions] = useState<FleetFilterOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)

  // Filters
  const [search, setSearch] = useState('')
  const [series, setSeries] = useState('')
  const [fuelType, setFuelType] = useState('')
  const [bodyType, setBodyType] = useState('')

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`${API_BASE}/testdrive/vehicles`).then(r => r.json()),
      fetch(`${API_BASE}/testdrive/vehicles/stats`).then(r => r.json()),
      fetch(`${API_BASE}/testdrive/vehicles/filter-options`).then(r => r.json()),
    ])
      .then(([vehicleRes, statsRes, optionsRes]) => {
        setVehicles(vehicleRes.items)
        setStats(statsRes)
        setFilterOptions(optionsRes)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let result = vehicles
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(v =>
        v.name.toLowerCase().includes(q) ||
        v.series?.toLowerCase().includes(q) ||
        v.color?.toLowerCase().includes(q)
      )
    }
    if (series) result = result.filter(v => v.series === series)
    if (fuelType) result = result.filter(v => v.fuel_type === fuelType)
    if (bodyType) result = result.filter(v => v.body_type === bodyType)
    return result
  }, [vehicles, search, series, fuelType, bodyType])

  const hasFilters = search || series || fuelType || bodyType
  const clearFilters = () => { setSearch(''); setSeries(''); setFuelType(''); setBodyType('') }

  const fuelIcon = (ft: string | undefined) => {
    if (ft === 'ELECTRIC') return <Zap className="w-3.5 h-3.5" />
    return <Fuel className="w-3.5 h-3.5" />
  }

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
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#1c1c1c]">Probefahrt Fahrzeuge</span>
            <span className="text-[11px] text-[#999] tracking-[0.02em]">Test Drive Fleet</span>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          <a href="/" className="px-3 py-1.5 rounded-lg text-[13px] text-[#666] hover:text-[#1c1c1c] hover:bg-[#f0f0f0] transition-all">
            Chat
          </a>
          <a href="/testdrive" className="px-3 py-1.5 rounded-lg text-[13px] text-[#1c69d4]/70 hover:text-[#1c69d4] hover:bg-[#1c69d4]/[0.06] font-medium transition-all">
            Book Test Drive
          </a>
          <a href="/inventory" className="px-3 py-1.5 rounded-lg text-[13px] text-[#666] hover:text-[#1c1c1c] hover:bg-[#f0f0f0] transition-all">
            Full Stock
          </a>
        </nav>
      </header>

      {/* Stats Bar */}
      {stats && (
        <div className="px-4 sm:px-6 py-3 border-b border-[#e6e6e6] bg-white shrink-0">
          <div className="max-w-6xl mx-auto flex items-center gap-6 overflow-x-auto">
            <Stat label="Test Drive Models" value={String(stats.total_vehicles)} accent />
            <Stat label="Gasoline" value={String(stats.fuel_type_breakdown['GASOLINE'] || 0)} />
            <Stat label="Diesel" value={String(stats.fuel_type_breakdown['DIESEL'] || 0)} />
            <Stat label="Electric" value={String(stats.fuel_type_breakdown['ELECTRIC'] || 0)} />
            <Stat label="From" value={formatCHF(stats.price_range.min)} />
            <Stat label="Average" value={formatCHF(stats.price_range.avg)} />
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
              placeholder="Search models..."
              className="w-full bg-[#f5f5f5] border border-[#e6e6e6] rounded-lg pl-9 pr-4 py-2 text-[13px] text-[#1c1c1c] placeholder:text-[#999] outline-none focus:border-[#1c69d4]/30 transition-all"
            />
          </div>

          <FilterPill
            label="Series"
            value={series}
            options={filterOptions?.series ?? []}
            onChange={setSeries}
          />
          <FilterPill
            label="Fuel"
            value={fuelType}
            options={filterOptions?.fuel_types ?? []}
            onChange={setFuelType}
            format={formatFuelType}
          />
          <FilterPill
            label="Body"
            value={bodyType}
            options={filterOptions?.body_types ?? []}
            onChange={setBodyType}
            format={formatBodyType}
          />

          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] text-[#999] hover:text-[#1c1c1c] hover:bg-[#f0f0f0] transition-all">
              <X className="w-3 h-3" /> Clear
            </button>
          )}

          <span className="ml-auto text-[12px] text-[#999]">
            {filtered.length === vehicles.length
              ? `${vehicles.length} vehicles`
              : `${filtered.length} of ${vehicles.length}`}
          </span>
        </div>
      </div>

      {/* Vehicle Grid + Detail */}
      <div className="flex-1 flex min-h-0">
        <ScrollArea className={`flex-1 px-4 sm:px-6 py-4 ${selectedVehicle ? 'hidden sm:block' : ''}`}>
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
              {filtered.map(v => (
                <div
                  key={v.vin}
                  onClick={() => setSelectedVehicle(v)}
                  className={`group bg-white rounded-2xl border transition-all duration-200 cursor-pointer overflow-hidden hover:shadow-md ${
                    selectedVehicle?.vin === v.vin ? 'border-[#1c69d4] shadow-md' : 'border-[#e6e6e6] hover:border-[#ccc]'
                  }`}
                >
                  {/* Image */}
                  <div className="aspect-[16/10] bg-[#f0f0f0] relative overflow-hidden">
                    {v.image ? (
                      <img
                        src={v.image}
                        alt={v.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Car className="w-12 h-12 text-[#ccc]" />
                      </div>
                    )}
                    {/* Fuel badge */}
                    <div className={`absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium backdrop-blur-sm ${
                      v.fuel_type === 'ELECTRIC'
                        ? 'bg-green-500/90 text-white'
                        : v.fuel_type === 'DIESEL'
                          ? 'bg-gray-600/90 text-white'
                          : 'bg-white/90 text-[#333]'
                    }`}>
                      {fuelIcon(v.fuel_type)}
                      {formatFuelType(v.fuel_type)}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-[14px] font-semibold text-[#1c1c1c] truncate leading-tight">{v.name}</h3>
                        <p className="text-[12px] text-[#888] mt-0.5">
                          {v.series && <span className="font-medium text-[#1c69d4]">{v.series}</span>}
                          {v.body_type && <> &middot; {formatBodyType(v.body_type)}</>}
                          {v.color && <> &middot; {v.color}</>}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#ccc] shrink-0 mt-0.5 group-hover:text-[#1c69d4] transition-colors" />
                    </div>

                    <div className="flex items-end justify-between mt-3">
                      <div>
                        <span className="text-[16px] font-bold text-[#1c1c1c]">{formatCHF(v.price_offer)}</span>
                        {v.power_hp && (
                          <span className="text-[11px] text-[#999] ml-2">{v.power_hp} HP</span>
                        )}
                      </div>
                      <a
                        href="/testdrive"
                        onClick={e => e.stopPropagation()}
                        className="px-3 py-1.5 rounded-lg bg-[#1c69d4] text-white text-[11px] font-medium hover:bg-[#1557b0] transition-colors"
                      >
                        Probefahrt
                      </a>
                    </div>

                    {v.dealer_name && (
                      <p className="text-[11px] text-[#aaa] mt-2 truncate">{v.dealer_name}</p>
                    )}
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-16">
                  <Filter className="w-8 h-8 text-[#ccc] mb-3" />
                  <p className="text-[14px] text-[#999]">No vehicles match your filters</p>
                  <button onClick={clearFilters} className="text-[13px] text-[#1c69d4] mt-2 hover:underline">Clear filters</button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Detail Panel */}
        {selectedVehicle && (
          <div className="w-full sm:w-[400px] shrink-0 border-l border-[#e6e6e6] bg-white">
            <VehicleDetail vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />
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


function FilterPill({
  label, value, options, onChange, format,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  format?: (v: string) => string
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`px-3 py-2 rounded-lg border text-[12px] outline-none transition-all cursor-pointer ${
        value ? 'border-[#1c69d4]/30 bg-[#1c69d4]/[0.04] text-[#1c69d4]' : 'border-[#e6e6e6] bg-[#f5f5f5] text-[#666]'
      }`}
    >
      <option value="">All {label}</option>
      {options.map(opt => (
        <option key={opt} value={opt}>{format ? format(opt) : opt}</option>
      ))}
    </select>
  )
}


function VehicleDetail({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const images = vehicle.images?.length ? vehicle.images : vehicle.image ? [vehicle.image] : []
  const [imgIdx, setImgIdx] = useState(0)

  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        {/* Close */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[16px] font-bold text-[#1c1c1c] leading-tight">{vehicle.name}</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg hover:bg-[#f0f0f0] flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-[#999]" />
          </button>
        </div>

        {/* Image Gallery */}
        {images.length > 0 && (
          <div className="mb-4">
            <div className="aspect-[16/10] rounded-xl overflow-hidden bg-[#f0f0f0]">
              <img
                src={images[imgIdx]}
                alt={vehicle.name}
                className="w-full h-full object-cover"
              />
            </div>
            {images.length > 1 && (
              <div className="flex gap-1.5 mt-2 overflow-x-auto">
                {images.slice(0, 8).map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setImgIdx(i)}
                    className={`w-12 h-8 rounded-md overflow-hidden shrink-0 border-2 transition-all ${
                      i === imgIdx ? 'border-[#1c69d4]' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Price */}
        <div className="mb-4">
          <span className="text-[22px] font-bold text-[#1c1c1c]">{formatCHF(vehicle.price_offer)}</span>
          {vehicle.price_list && vehicle.price_offer && vehicle.price_list > vehicle.price_offer && (
            <span className="text-[13px] text-[#999] line-through ml-2">{formatCHF(vehicle.price_list)}</span>
          )}
        </div>

        {/* Specs */}
        <div className="space-y-2 mb-4">
          <DetailRow label="Series" value={vehicle.series} />
          <DetailRow label="Body" value={formatBodyType(vehicle.body_type)} />
          <DetailRow label="Fuel" value={formatFuelType(vehicle.fuel_type)} />
          <DetailRow label="Drive" value={vehicle.drive_type?.replace(/_/g, ' ')} />
          <DetailRow label="Transmission" value={vehicle.transmission?.replace(/_/g, ' ')} />
          <DetailRow label="Power" value={vehicle.power_hp ? `${vehicle.power_hp} HP (${vehicle.power_kw} kW)` : undefined} />
          <DetailRow label="Color" value={vehicle.color} />
          <DetailRow label="Interior" value={vehicle.upholstery_color} />
          <DetailRow label="Doors" value={vehicle.door_count?.toString()} />
          <DetailRow label="Dealer" value={vehicle.dealer_name} />
        </div>

        {/* Book CTA */}
        <a
          href="/testdrive"
          className="block w-full py-3 rounded-xl bg-[#1c69d4] text-white text-center text-[14px] font-semibold hover:bg-[#1557b0] transition-colors"
        >
          Probefahrt buchen
        </a>

        {/* VIN */}
        <p className="text-[11px] text-[#bbb] mt-3 text-center font-mono">{vehicle.vin}</p>

        {vehicle.url && (
          <a
            href={vehicle.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-[12px] text-[#1c69d4] mt-2 hover:underline"
          >
            View on BMW.ch
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
