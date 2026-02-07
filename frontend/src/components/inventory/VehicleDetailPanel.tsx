import { X, ExternalLink, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ImageGallery } from './ImageGallery'
import type { Vehicle } from '@/lib/types'
import { formatCHF, formatFuelType, formatBodyType, formatLabel } from '@/lib/utils'

interface VehicleDetailPanelProps {
  vehicle: Vehicle
  onClose: () => void
}

const fuelBadgeColor: Record<string, string> = {
  'BEV': 'bg-green-500 text-white',
  'PLUGIN_HYBRID': 'bg-blue-500 text-white',
  'MILD_HYBRID': 'bg-cyan-500 text-white',
  'DIESEL': 'bg-gray-600 text-white',
  'PETROL': 'bg-orange-500 text-white',
}

export function VehicleDetailPanel({ vehicle, onClose }: VehicleDetailPanelProps) {
  const allImages = vehicle.images?.length
    ? vehicle.images
    : vehicle.image
      ? [vehicle.image]
      : []

  const hasDiscount = vehicle.price_list && vehicle.price_offer && vehicle.price_list > vehicle.price_offer

  return (
    <div className="border-l bg-background h-full flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight truncate">{vehicle.name}</h2>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {vehicle.series && <Badge variant="secondary">{vehicle.series}</Badge>}
            {vehicle.fuel_type && (
              <Badge className={fuelBadgeColor[vehicle.fuel_type] ?? 'bg-secondary text-secondary-foreground'}>
                {formatFuelType(vehicle.fuel_type)}
              </Badge>
            )}
            {vehicle.sales_status && (
              <Badge variant="outline">{formatLabel(vehicle.sales_status)}</Badge>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 ml-2">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Images */}
          <ImageGallery images={allImages} alt={vehicle.name} />

          {/* Pricing */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">Pricing</h3>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold">{formatCHF(vehicle.price_offer)}</span>
              {hasDiscount && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatCHF(vehicle.price_list)}
                </span>
              )}
            </div>
          </div>

          {/* Specs grid */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Specifications</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <SpecRow label="Body" value={formatBodyType(vehicle.body_type)} />
              <SpecRow label="Drive" value={vehicle.drive_type ? formatLabel(vehicle.drive_type) : '–'} />
              <SpecRow label="Transmission" value={vehicle.transmission ? formatLabel(vehicle.transmission) : '–'} />
              <SpecRow label="Power" value={vehicle.power_hp ? `${vehicle.power_hp} HP (${vehicle.power_kw} kW)` : '–'} />
              <SpecRow label="Doors" value={vehicle.door_count?.toString() ?? '–'} />
              <SpecRow label="Color" value={vehicle.color ? formatLabel(vehicle.color) : '–'} />
              <SpecRow label="Interior" value={vehicle.upholstery_color ? formatLabel(vehicle.upholstery_color) : '–'} />
              <SpecRow label="Model Range" value={vehicle.model_range ?? '–'} />
            </div>
          </div>

          {/* Dealer */}
          {vehicle.dealer_name && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Dealer</h3>
              <p className="text-sm font-medium">{vehicle.dealer_name}</p>
              {vehicle.dealer_latitude && vehicle.dealer_longitude && (
                <a
                  href={`https://www.google.com/maps?q=${vehicle.dealer_latitude},${vehicle.dealer_longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                >
                  <MapPin className="h-3 w-3" />
                  View on Maps
                </a>
              )}
            </div>
          )}

          {/* VIN */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-1">VIN</h3>
            <p className="text-sm font-mono">{vehicle.vin}</p>
          </div>

          {/* External link */}
          {vehicle.url && (
            <a
              href={vehicle.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              View on BMW.ch
            </a>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{' '}
      <span className="font-medium">{value}</span>
    </div>
  )
}
