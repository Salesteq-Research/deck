import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { Vehicle, SortConfig, SortField } from '@/lib/types'
import { formatCHF, formatFuelType, formatBodyType } from '@/lib/utils'

interface VehicleTableProps {
  vehicles: Vehicle[]
  selectedVin: string | null
  sort: SortConfig
  detailOpen: boolean
  onSelect: (vehicle: Vehicle) => void
  onSort: (field: SortField) => void
}

const fuelBadgeColor: Record<string, string> = {
  'BEV': 'bg-green-500 text-white',
  'PLUGIN_HYBRID': 'bg-blue-500 text-white',
  'MILD_HYBRID': 'bg-cyan-500 text-white',
  'DIESEL': 'bg-gray-600 text-white',
  'PETROL': 'bg-orange-500 text-white',
}

export function VehicleTable({
  vehicles,
  selectedVin,
  sort,
  detailOpen,
  onSelect,
  onSort,
}: VehicleTableProps) {
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sort.field !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />
    return sort.direction === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />
  }

  const sortableHeader = (field: SortField, label: string, className?: string) => (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground ${className ?? ''}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center">
        {label}
        <SortIcon field={field} />
      </div>
    </TableHead>
  )

  return (
    <Table>
      <TableHeader className="sticky top-0 bg-background z-10">
        <TableRow>
          <TableHead className="w-[60px]">Image</TableHead>
          {sortableHeader('name', 'Name', 'min-w-[200px]')}
          {sortableHeader('series', 'Series')}
          {sortableHeader('body_type', 'Body')}
          {sortableHeader('fuel_type', 'Fuel')}
          {sortableHeader('color', 'Color')}
          {sortableHeader('price_offer', 'Price')}
          {!detailOpen && sortableHeader('power_hp', 'Power')}
          {sortableHeader('dealer_name', 'Dealer')}
        </TableRow>
      </TableHeader>
      <TableBody>
        {vehicles.length === 0 ? (
          <TableRow>
            <TableCell colSpan={detailOpen ? 8 : 9} className="text-center py-8 text-muted-foreground">
              No vehicles match your filters
            </TableCell>
          </TableRow>
        ) : (
          vehicles.map((v) => (
            <TableRow
              key={v.vin}
              onClick={() => onSelect(v)}
              className={`cursor-pointer ${v.vin === selectedVin ? 'bg-primary/5' : ''}`}
            >
              <TableCell className="p-1">
                {v.image ? (
                  <img
                    src={v.image}
                    alt={v.name}
                    loading="lazy"
                    className="w-14 h-10 object-cover rounded"
                  />
                ) : (
                  <div className="w-14 h-10 bg-muted rounded flex items-center justify-center text-[10px] text-muted-foreground">
                    No img
                  </div>
                )}
              </TableCell>
              <TableCell className="font-medium max-w-[250px] truncate">{v.name}</TableCell>
              <TableCell>
                {v.series && <Badge variant="secondary" className="text-xs">{v.series}</Badge>}
              </TableCell>
              <TableCell className="text-xs">{formatBodyType(v.body_type)}</TableCell>
              <TableCell>
                {v.fuel_type && (
                  <Badge className={`text-[10px] px-1.5 py-0 ${fuelBadgeColor[v.fuel_type] ?? 'bg-secondary text-secondary-foreground'}`}>
                    {formatFuelType(v.fuel_type)}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-xs">{v.color ?? '–'}</TableCell>
              <TableCell className="text-xs font-medium whitespace-nowrap">{formatCHF(v.price_offer)}</TableCell>
              {!detailOpen && (
                <TableCell className="text-xs whitespace-nowrap">
                  {v.power_hp ? `${v.power_hp} HP` : '–'}
                </TableCell>
              )}
              <TableCell className="text-xs max-w-[150px] truncate">{v.dealer_name ?? '–'}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
