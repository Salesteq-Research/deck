export interface VehicleCard {
  vin: string
  name: string
  series?: string
  body_type?: string
  fuel_type?: string
  color?: string
  price?: string
  price_offer?: number
  monthly_installment?: number
  currency: string
  image?: string
  images: string[]
  dealer_name?: string
  url?: string
}

export interface Vehicle {
  vin: string
  name: string
  brand: string
  series?: string
  model_range?: string
  body_type?: string
  fuel_type?: string
  drive_type?: string
  transmission?: string
  color?: string
  upholstery_color?: string
  price?: string
  price_offer?: number
  price_list?: number
  currency: string
  image?: string
  images: string[]
  dealer_name?: string
  dealer_id?: string
  dealer_latitude?: number
  dealer_longitude?: number
  power_kw?: number
  power_hp?: number
  door_count?: number
  country: string
  sales_status?: string
  url?: string
  created_at?: string
  updated_at?: string
}

export interface VehicleListResponse {
  items: Vehicle[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface InventoryStats {
  total_vehicles: number
  dealer_count: number
  fuel_type_breakdown: Record<string, number>
  series_breakdown: Record<string, number>
  price_range: {
    min: number | null
    max: number | null
    avg: number | null
  }
}

export interface Dealer {
  dealer_name: string
  dealer_id: string
  latitude: number | null
  longitude: number | null
  count: number
}

export interface FilterOptions {
  series: string[]
  fuel_types: string[]
  body_types: string[]
  colors: string[]
  dealers: string[]
  drive_types: string[]
  transmissions: string[]
}

export type SortField = 'name' | 'series' | 'body_type' | 'fuel_type' | 'color' | 'price_offer' | 'power_hp' | 'dealer_name'
export type SortDirection = 'asc' | 'desc'

export interface SortConfig {
  field: SortField
  direction: SortDirection
}

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
  vehicles?: VehicleCard[]
  suggestedQuestions?: string[]
}

export interface ChatResponse {
  message: string
  vehicles: VehicleCard[]
  suggested_questions: string[]
}
