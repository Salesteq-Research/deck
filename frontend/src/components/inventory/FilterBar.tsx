import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FilterOptions } from '@/lib/types'
import { formatFuelType, formatBodyType, formatLabel } from '@/lib/utils'

export interface FilterState {
  search: string
  series: string
  fuel_type: string
  body_type: string
  color: string
  dealer: string
  drive_type: string
  transmission: string
  price_min: string
  price_max: string
}

interface FilterBarProps {
  filters: FilterState
  options: FilterOptions | null
  filteredCount: number
  totalCount: number
  onFilterChange: (key: keyof FilterState, value: string) => void
  onClearFilters: () => void
}

export function FilterBar({
  filters,
  options,
  filteredCount,
  totalCount,
  onFilterChange,
  onClearFilters,
}: FilterBarProps) {
  const hasActiveFilters = Object.entries(filters).some(
    ([, value]) => value !== ''
  )

  return (
    <div className="space-y-3">
      {/* Row 1: Search + main dropdowns */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, VIN..."
            value={filters.search}
            onChange={(e) => onFilterChange('search', e.target.value)}
            className="pl-9"
          />
        </div>

        <FilterSelect
          placeholder="Series"
          value={filters.series}
          onChange={(v) => onFilterChange('series', v)}
          options={options?.series ?? []}
        />

        <FilterSelect
          placeholder="Fuel Type"
          value={filters.fuel_type}
          onChange={(v) => onFilterChange('fuel_type', v)}
          options={options?.fuel_types ?? []}
          formatLabel={formatFuelType}
        />

        <FilterSelect
          placeholder="Body Type"
          value={filters.body_type}
          onChange={(v) => onFilterChange('body_type', v)}
          options={options?.body_types ?? []}
          formatLabel={formatBodyType}
        />

        <FilterSelect
          placeholder="Dealer"
          value={filters.dealer}
          onChange={(v) => onFilterChange('dealer', v)}
          options={options?.dealers ?? []}
        />
      </div>

      {/* Row 2: Additional filters + result count */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          placeholder="Color"
          value={filters.color}
          onChange={(v) => onFilterChange('color', v)}
          options={options?.colors ?? []}
          formatLabel={formatLabel}
        />

        <FilterSelect
          placeholder="Drive"
          value={filters.drive_type}
          onChange={(v) => onFilterChange('drive_type', v)}
          options={options?.drive_types ?? []}
          formatLabel={formatLabel}
        />

        <FilterSelect
          placeholder="Transmission"
          value={filters.transmission}
          onChange={(v) => onFilterChange('transmission', v)}
          options={options?.transmissions ?? []}
          formatLabel={formatLabel}
        />

        <Input
          type="number"
          placeholder="Min price"
          value={filters.price_min}
          onChange={(e) => onFilterChange('price_min', e.target.value)}
          className="w-[120px]"
        />
        <Input
          type="number"
          placeholder="Max price"
          value={filters.price_max}
          onChange={(e) => onFilterChange('price_max', e.target.value)}
          className="w-[120px]"
        />

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}

        <span className="ml-auto text-sm text-muted-foreground whitespace-nowrap">
          {filteredCount === totalCount
            ? `${totalCount} vehicles`
            : `${filteredCount} of ${totalCount} vehicles`}
        </span>
      </div>
    </div>
  )
}

function FilterSelect({
  placeholder,
  value,
  onChange,
  options,
  formatLabel: format,
}: {
  placeholder: string
  value: string
  onChange: (value: string) => void
  options: string[]
  formatLabel?: (v: string) => string
}) {
  return (
    <Select value={value || undefined} onValueChange={(v) => onChange(v === '__all__' ? '' : v)}>
      <SelectTrigger className="w-[160px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All {placeholder}</SelectItem>
        {options.filter(Boolean).map((opt) => (
          <SelectItem key={opt} value={opt}>
            {format ? format(opt) : opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
