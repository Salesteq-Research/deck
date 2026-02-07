import { Car, Building2, Fuel, DollarSign } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { InventoryStats } from '@/lib/types'
import { formatCHF, formatFuelType } from '@/lib/utils'

interface StatsBarProps {
  stats: InventoryStats | null
  loading: boolean
}

export function StatsBar({ stats, loading }: StatsBarProps) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-4 w-24 bg-muted animate-pulse rounded mb-2" />
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const fuelEntries = Object.entries(stats.fuel_type_breakdown).sort((a, b) => b[1] - a[1])

  const fuelColors: Record<string, string> = {
    'BEV': 'bg-green-500 text-white',
    'PLUGIN_HYBRID': 'bg-blue-500 text-white',
    'MILD_HYBRID': 'bg-cyan-500 text-white',
    'DIESEL': 'bg-gray-600 text-white',
    'PETROL': 'bg-orange-500 text-white',
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Car className="h-4 w-4" />
            Total Vehicles
          </div>
          <div className="text-2xl font-bold">{stats.total_vehicles.toLocaleString()}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Building2 className="h-4 w-4" />
            Dealers
          </div>
          <div className="text-2xl font-bold">{stats.dealer_count}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Fuel className="h-4 w-4" />
            Fuel Types
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {fuelEntries.map(([fuel, count]) => (
              <Badge
                key={fuel}
                className={`text-[10px] px-1.5 py-0 ${fuelColors[fuel] ?? 'bg-secondary text-secondary-foreground'}`}
              >
                {formatFuelType(fuel)} ({count})
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <DollarSign className="h-4 w-4" />
            Price Range
          </div>
          <div className="text-sm font-semibold">
            {formatCHF(stats.price_range.min)} – {formatCHF(stats.price_range.max)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Avg: {formatCHF(stats.price_range.avg)}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
