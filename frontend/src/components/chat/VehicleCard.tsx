import { ExternalLink, ImageIcon } from 'lucide-react'
import type { VehicleCard as VehicleCardType } from '@/lib/types'

interface VehicleCardProps {
  vehicle: VehicleCardType
}

function formatFuelType(fuel?: string): string {
  if (!fuel) return ''
  const map: Record<string, string> = {
    ELECTRIC: 'Electric',
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
      className="flex-shrink-0 w-[240px] sm:w-[280px] flex flex-col rounded-lg border border-foreground/80 bg-white overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-1 active:translate-y-0 transition-all duration-200"
      onClick={() => vehicle.url && window.open(vehicle.url, '_blank')}
    >
      {/* Landscape car image */}
      <div className="w-full h-[130px] sm:h-[160px] bg-gray-50 relative flex-shrink-0">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={vehicle.name}
            className="w-full h-full object-contain animate-fade-in-img"
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
      <div className="p-2.5 sm:p-3 flex flex-col gap-1">
        <h4 className="font-semibold text-sm leading-tight line-clamp-2 text-primary">
          {vehicle.name}
        </h4>

        <div className="flex items-center gap-1.5 flex-wrap">
          {vehicle.fuel_type && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                vehicle.fuel_type === 'ELECTRIC' || vehicle.fuel_type === 'BEV'
                  ? 'bg-green-100 text-green-800'
                  : vehicle.fuel_type === 'PHEV'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-700'
              }`}
            >
              {formatFuelType(vehicle.fuel_type)}
            </span>
          )}
          {vehicle.body_type && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
              {formatBodyType(vehicle.body_type)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {vehicle.color && <span>{vehicle.color.replace(/_/g, ' ')}</span>}
          {vehicle.dealer_name && (
            <>
              <span>·</span>
              <span className="truncate">{vehicle.dealer_name}</span>
            </>
          )}
        </div>

        <div className="mt-1">
          <div className="flex items-center justify-between">
            {vehicle.price ? (
              <span className="text-sm font-bold text-foreground">
                {vehicle.price}
              </span>
            ) : (
              <span />
            )}
            {vehicle.url && (
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </div>
          {vehicle.monthly_installment && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              from CHF {vehicle.monthly_installment.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
