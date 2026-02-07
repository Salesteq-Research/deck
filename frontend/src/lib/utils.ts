import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCHF(value: number | null | undefined): string {
  if (value == null) return '–'
  return `CHF ${value.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function formatFuelType(fuel: string | undefined | null): string {
  if (!fuel) return '–'
  const map: Record<string, string> = {
    'PLUGIN_HYBRID': 'Plug-in Hybrid',
    'MILD_HYBRID': 'Mild Hybrid',
    'BEV': 'Electric',
    'DIESEL': 'Diesel',
    'PETROL': 'Petrol',
  }
  return map[fuel] ?? formatLabel(fuel)
}

export function formatBodyType(body: string | undefined | null): string {
  if (!body) return '–'
  return formatLabel(body)
}

export function formatLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
