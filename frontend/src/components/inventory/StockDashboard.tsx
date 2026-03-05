import { useState, useEffect, useMemo } from 'react'
import { StatsBar } from './StatsBar'
import { FilterBar, type FilterState } from './FilterBar'
import { VehicleTable } from './VehicleTable'
import { VehicleDetailPanel } from './VehicleDetailPanel'
import { getVehicles, getInventoryStats, getFilterOptions } from '@/lib/api'
import type { Vehicle, InventoryStats, FilterOptions, SortConfig, SortField } from '@/lib/types'

const emptyFilters: FilterState = {
  search: '',
  series: '',
  fuel_type: '',
  body_type: '',
  color: '',
  dealer: '',
  drive_type: '',
  transmission: '',
  price_min: '',
  price_max: '',
}

export function StockDashboard() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [stats, setStats] = useState<InventoryStats | null>(null)
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<FilterState>(emptyFilters)
  const [sort, setSort] = useState<SortConfig>({ field: 'name', direction: 'asc' })
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getVehicles({ page_size: 5000 }),
      getInventoryStats(),
      getFilterOptions(),
    ])
      .then(([vehicleRes, statsRes, optionsRes]) => {
        setVehicles(vehicleRes.items)
        setStats(statsRes)
        setFilterOptions(optionsRes)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const handleSort = (field: SortField) => {
    setSort((prev) =>
      prev.field === field
        ? { field, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'asc' }
    )
  }

  const filteredAndSorted = useMemo(() => {
    let result = vehicles

    // Text search
    if (filters.search) {
      const q = filters.search.toLowerCase()
      result = result.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.vin.toLowerCase().includes(q) ||
          v.dealer_name?.toLowerCase().includes(q)
      )
    }

    // Dropdown filters
    if (filters.series) result = result.filter((v) => v.series === filters.series)
    if (filters.fuel_type) result = result.filter((v) => v.fuel_type === filters.fuel_type)
    if (filters.body_type) result = result.filter((v) => v.body_type === filters.body_type)
    if (filters.color) result = result.filter((v) => v.color === filters.color)
    if (filters.dealer) result = result.filter((v) => v.dealer_name === filters.dealer)
    if (filters.drive_type) result = result.filter((v) => v.drive_type === filters.drive_type)
    if (filters.transmission) result = result.filter((v) => v.transmission === filters.transmission)

    // Price range
    if (filters.price_min) {
      const min = Number(filters.price_min)
      result = result.filter((v) => v.price_offer != null && v.price_offer >= min)
    }
    if (filters.price_max) {
      const max = Number(filters.price_max)
      result = result.filter((v) => v.price_offer != null && v.price_offer <= max)
    }

    // Sort
    result = [...result].sort((a, b) => {
      const field = sort.field
      const aVal = a[field]
      const bVal = b[field]

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      let cmp: number
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal
      } else {
        cmp = String(aVal).localeCompare(String(bVal))
      }

      return sort.direction === 'asc' ? cmp : -cmp
    })

    return result
  }, [vehicles, filters, sort])

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center justify-between bg-background shrink-0">
        <div>
          <h1 className="text-xl font-bold">Stock Overview</h1>
          <p className="text-sm text-muted-foreground">
            BMW Switzerland Inventory
          </p>
        </div>
        <nav className="flex items-center gap-1">
          <a href="/" className="px-3 py-1.5 rounded-lg text-[13px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-all">Home</a>
          <a href="/chat" className="px-3 py-1.5 rounded-lg text-[13px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-all">Chat</a>
          <a href="/backoffice" className="px-3 py-1.5 rounded-lg text-[13px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-all">Dealer</a>
          <a href="/network" className="px-3 py-1.5 rounded-lg text-[13px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-all">Network</a>
        </nav>
      </header>

      {/* Stats */}
      <div className="px-6 py-4 shrink-0">
        <StatsBar stats={stats} loading={loading} />
      </div>

      {/* Filters */}
      <div className="px-6 pb-3 shrink-0">
        <FilterBar
          filters={filters}
          options={filterOptions}
          filteredCount={filteredAndSorted.length}
          totalCount={vehicles.length}
          onFilterChange={handleFilterChange}
          onClearFilters={() => setFilters(emptyFilters)}
        />
      </div>

      {/* Table + Detail split */}
      <div className="flex-1 flex min-h-0">
        {/* Table panel */}
        <div className={`overflow-auto ${selectedVehicle ? 'w-[60%]' : 'w-full'} transition-all`}>
          <VehicleTable
            vehicles={filteredAndSorted}
            selectedVin={selectedVehicle?.vin ?? null}
            sort={sort}
            detailOpen={!!selectedVehicle}
            onSelect={setSelectedVehicle}
            onSort={handleSort}
          />
        </div>

        {/* Detail panel */}
        {selectedVehicle && (
          <div className="w-[40%] shrink-0">
            <VehicleDetailPanel
              vehicle={selectedVehicle}
              onClose={() => setSelectedVehicle(null)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
