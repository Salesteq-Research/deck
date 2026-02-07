import { VehicleCard } from './VehicleCard'
import type { VehicleCard as VehicleCardType } from '@/lib/types'

interface InlineVehicleRowProps {
  vehicles: VehicleCardType[]
}

export function InlineProductRow({ vehicles }: InlineVehicleRowProps) {
  if (vehicles.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
        {vehicles.map((vehicle) => (
          <VehicleCard key={vehicle.vin} vehicle={vehicle} />
        ))}
      </div>
    </div>
  )
}
