import { ExternalLink, ImageIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { VehicleCard as VehicleCardType } from '@/lib/types'

interface VehicleCardProps {
  vehicle: VehicleCardType
}

function formatFuelType(fuel?: string): string {
  if (!fuel) return ''
  const map: Record<string, string> = {
    BEV: 'Electric',
    PHEV: 'Plug-in Hybrid',
    GASOLINE: 'Petrol',
    DIESEL: 'Diesel',
  }
  return map[fuel] || fuel
}

function formatBodyType(body?: string): string {
  if (!body) return ''
  return body
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
  const imageUrl = vehicle.image || null

  return (
    <div
      className="flex-shrink-0 w-[240px] sm:w-[300px] flex flex-col rounded-lg border border-border bg-card overflow-hidden cursor-pointer hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
      onClick={() => vehicle.url && window.open(vehicle.url, '_blank')}
    >
      {/* Landscape car image */}
      <div className="w-full h-[130px] sm:h-[160px] bg-muted relative flex-shrink-0">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={vehicle.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="p-2.5 sm:p-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {vehicle.series && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {vehicle.series} Series
            </Badge>
          )}
          {vehicle.fuel_type && (
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 ${
                vehicle.fuel_type === 'BEV'
                  ? 'bg-green-100 text-green-800'
                  : vehicle.fuel_type === 'PHEV'
                    ? 'bg-blue-100 text-blue-800'
                    : ''
              }`}
            >
              {formatFuelType(vehicle.fuel_type)}
            </Badge>
          )}
        </div>

        <h4 className="font-semibold text-xs leading-tight line-clamp-2">
          {vehicle.name}
        </h4>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {vehicle.color && <span>{vehicle.color.replace(/_/g, ' ')}</span>}
          {vehicle.body_type && (
            <>
              <span>·</span>
              <span>{formatBodyType(vehicle.body_type)}</span>
            </>
          )}
        </div>

        {vehicle.dealer_name && (
          <p className="text-[10px] text-muted-foreground truncate">
            {vehicle.dealer_name}
          </p>
        )}

        <div className="flex items-center justify-between mt-1">
          {vehicle.price ? (
            <span className="text-xs font-semibold text-primary">
              {vehicle.price}
            </span>
          ) : (
            <span />
          )}
          {vehicle.url && (
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>
    </div>
  )
}
