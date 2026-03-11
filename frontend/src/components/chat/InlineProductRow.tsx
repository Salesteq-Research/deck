import { useState, useEffect } from 'react'
import { VehicleCard } from './VehicleCard'
import { matchVideoForVehicle } from '@/lib/video-match'
import type { VehicleCard as VehicleCardType } from '@/lib/types'

interface InlineVehicleRowProps {
  vehicles: VehicleCardType[]
  lang?: 'de' | 'fr' | 'it' | 'en'
  onSelect?: (vehicle: VehicleCardType) => void
}

export function InlineProductRow({ vehicles, lang, onSelect }: InlineVehicleRowProps) {
  const [videoMap, setVideoMap] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/videos/index.json').then(r => r.ok ? r.json() : {}).then(setVideoMap).catch(() => {})
  }, [])

  if (vehicles.length === 0) return null

  return (
    <div className="mt-3 pt-3">
      <div className="flex gap-3 overflow-x-auto py-2 px-0.5 scrollbar-hide">
        {vehicles.map((vehicle) => {
          return (
            <VehicleCard
              key={vehicle.vin}
              vehicle={vehicle}
              videoSrc={matchVideoForVehicle(vehicle.name, videoMap)}
              lang={lang}
              onSelect={onSelect}
            />
          )
        })}
      </div>
    </div>
  )
}
