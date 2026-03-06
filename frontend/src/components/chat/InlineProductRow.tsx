import { useState, useEffect } from 'react'
import { VehicleCard } from './VehicleCard'
import type { VehicleCard as VehicleCardType } from '@/lib/types'

interface InlineVehicleRowProps {
  vehicles: VehicleCardType[]
  onSelect?: (vehicle: VehicleCardType) => void
}

export function InlineProductRow({ vehicles, onSelect }: InlineVehicleRowProps) {
  const [videoMap, setVideoMap] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/videos/index.json').then(r => r.ok ? r.json() : {}).then(setVideoMap).catch(() => {})
  }, [])

  if (vehicles.length === 0) return null

  return (
    <div className="mt-3 pt-3">
      <div className="flex gap-3 overflow-x-auto py-2 px-0.5 scrollbar-hide">
        {vehicles.map((vehicle) => {
          const videoId = Object.keys(videoMap).find(id =>
            vehicle.name.toLowerCase().includes(id.replace(/-/g, ' ').replace('limousine', '').trim())
          )
          return (
            <VehicleCard
              key={vehicle.vin}
              vehicle={vehicle}
              videoSrc={videoId ? videoMap[videoId] : undefined}
              onSelect={onSelect}
            />
          )
        })}
      </div>
    </div>
  )
}
