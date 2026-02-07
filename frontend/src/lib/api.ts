import type { ChatMessage, ChatResponse, VehicleListResponse, Vehicle, InventoryStats, Dealer, FilterOptions } from './types'

const API_BASE = '/api'

export async function sendChatMessage(
  message: string,
  conversationHistory: ChatMessage[],
): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      conversation_history: conversationHistory,
    }),
  })
  if (!response.ok) throw new Error('Chat request failed')
  return response.json()
}

export async function getVehicles(params?: {
  page?: number
  page_size?: number
  series?: string
  fuel_type?: string
  body_type?: string
  search?: string
}): Promise<VehicleListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set('page', String(params.page))
  searchParams.set('page_size', String(params?.page_size ?? 2000))
  if (params?.series) searchParams.set('series', params.series)
  if (params?.fuel_type) searchParams.set('fuel_type', params.fuel_type)
  if (params?.body_type) searchParams.set('body_type', params.body_type)
  if (params?.search) searchParams.set('search', params.search)

  const response = await fetch(`${API_BASE}/vehicles?${searchParams}`)
  if (!response.ok) throw new Error('Failed to fetch vehicles')
  return response.json()
}

export async function getVehicle(vin: string): Promise<Vehicle> {
  const response = await fetch(`${API_BASE}/vehicles/${encodeURIComponent(vin)}`)
  if (!response.ok) throw new Error('Failed to fetch vehicle')
  return response.json()
}

export async function getInventoryStats(): Promise<InventoryStats> {
  const response = await fetch(`${API_BASE}/inventory/stats`)
  if (!response.ok) throw new Error('Failed to fetch inventory stats')
  return response.json()
}

export async function getDealers(): Promise<Dealer[]> {
  const response = await fetch(`${API_BASE}/inventory/dealers`)
  if (!response.ok) throw new Error('Failed to fetch dealers')
  return response.json()
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const response = await fetch(`${API_BASE}/inventory/filter-options`)
  if (!response.ok) throw new Error('Failed to fetch filter options')
  return response.json()
}
