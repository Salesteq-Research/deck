import type {
  ChatMessage, ChatResponse, VehicleCard, VehicleListResponse, Vehicle,
  InventoryStats, Dealer, FilterOptions,
  Lead, ConversationSummary, ConversationDetail, ActivityItem, BackofficeStats,
} from './types'

const API_BASE = '/api'

export async function sendChatMessage(
  message: string,
  conversationHistory: ChatMessage[],
  sessionId?: string,
): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      conversation_history: conversationHistory,
      session_id: sessionId,
    }),
  })
  if (!response.ok) throw new Error('Chat request failed')
  return response.json()
}

export async function sendChatMessageStream(
  message: string,
  conversationHistory: ChatMessage[],
  sessionId: string,
  onText: (text: string) => void,
  onVehicles: (vehicles: VehicleCard[]) => void,
  onToolCall?: (name: string) => void,
  onHumanMode?: () => void,
  options?: { language?: string; dealer_name?: string },
): Promise<void> {
  const response = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      conversation_history: conversationHistory,
      session_id: sessionId,
      ...(options?.language && { language: options.language }),
      ...(options?.dealer_name && { dealer_name: options.dealer_name }),
    }),
  })
  if (!response.ok) throw new Error('Chat stream failed')

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No reader')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const event = JSON.parse(line.slice(6))
        if (event.type === 'text') onText(event.content)
        else if (event.type === 'vehicles') onVehicles(event.vehicles)
        else if (event.type === 'tool_call' && onToolCall) onToolCall(event.name)
        else if (event.type === 'human_mode' && onHumanMode) onHumanMode()
      } catch {
        // skip malformed events
      }
    }
  }
}

export async function getChatSuggestions(
  message: string,
  conversationHistory: ChatMessage[],
): Promise<string[]> {
  try {
    const response = await fetch(`${API_BASE}/chat/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        conversation_history: conversationHistory,
      }),
    })
    if (!response.ok) return []
    const data = await response.json()
    return data.suggestions || []
  } catch {
    return []
  }
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

// ── Backoffice API ──────────────────────────────────────

export async function getBackofficeStats(): Promise<BackofficeStats> {
  const response = await fetch(`${API_BASE}/backoffice/stats`)
  if (!response.ok) throw new Error('Failed to fetch backoffice stats')
  return response.json()
}

export async function getLeads(status?: string): Promise<Lead[]> {
  const params = status ? `?status=${status}` : ''
  const response = await fetch(`${API_BASE}/backoffice/leads${params}`)
  if (!response.ok) throw new Error('Failed to fetch leads')
  return response.json()
}

export async function getLead(id: number): Promise<Lead> {
  const response = await fetch(`${API_BASE}/backoffice/leads/${id}`)
  if (!response.ok) throw new Error('Failed to fetch lead')
  return response.json()
}

export async function updateLead(id: number, data: Partial<Lead>): Promise<Lead> {
  const response = await fetch(`${API_BASE}/backoffice/leads/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to update lead')
  return response.json()
}

export async function getConversations(): Promise<ConversationSummary[]> {
  const response = await fetch(`${API_BASE}/backoffice/conversations`)
  if (!response.ok) throw new Error('Failed to fetch conversations')
  return response.json()
}

export async function getConversation(id: number): Promise<ConversationDetail> {
  const response = await fetch(`${API_BASE}/backoffice/conversations/${id}`)
  if (!response.ok) throw new Error('Failed to fetch conversation')
  return response.json()
}

export async function getActivity(limit = 50): Promise<ActivityItem[]> {
  const response = await fetch(`${API_BASE}/backoffice/activity?limit=${limit}`)
  if (!response.ok) throw new Error('Failed to fetch activity')
  return response.json()
}

export async function sendAgentMessage(
  message: string,
  conversationHistory: { role: string; content: string }[],
): Promise<{ message: string; tool_calls: { name: string; input: Record<string, unknown>; result_summary: string }[] }> {
  const response = await fetch(`${API_BASE}/backoffice/agent-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, conversation_history: conversationHistory }),
  })
  if (!response.ok) throw new Error('Agent chat failed')
  return response.json()
}

export async function getAiInsight(
  context: string = 'dashboard',
  leadId?: number,
  conversationId?: number,
): Promise<{ insight: string; tool_calls: { name: string; result_summary: string }[] }> {
  const params = new URLSearchParams({ context })
  if (leadId) params.set('lead_id', String(leadId))
  if (conversationId) params.set('conversation_id', String(conversationId))
  const response = await fetch(`${API_BASE}/backoffice/ai-insight?${params}`)
  if (!response.ok) throw new Error('Failed to get AI insight')
  return response.json()
}

export async function sendEmail(data: {
  lead_id: number
  subject: string
  body: string
  to_email: string
}): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE}/backoffice/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to send email')
  return response.json()
}

// ── Live Monitor / Takeover API ──────────────────────────

export async function takeoverConversation(id: number): Promise<{ status: string; operator: string }> {
  const response = await fetch(`${API_BASE}/backoffice/conversations/${id}/takeover`, { method: 'POST' })
  if (!response.ok) throw new Error('Failed to takeover conversation')
  return response.json()
}

export async function handbackConversation(id: number): Promise<{ status: string; operator: string }> {
  const response = await fetch(`${API_BASE}/backoffice/conversations/${id}/handback`, { method: 'POST' })
  if (!response.ok) throw new Error('Failed to hand back conversation')
  return response.json()
}

export async function sendDealerReply(convId: number, message: string): Promise<{ status: string; message_id: number }> {
  const response = await fetch(`${API_BASE}/backoffice/conversations/${convId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (!response.ok) throw new Error('Failed to send dealer reply')
  return response.json()
}

export async function pollCustomerMessages(sessionId: string, afterId: number): Promise<{
  operator: string
  messages: { id: number; role: string; content: string; sender: string }[]
}> {
  const response = await fetch(`${API_BASE}/chat/poll?session_id=${encodeURIComponent(sessionId)}&after=${afterId}`)
  if (!response.ok) throw new Error('Failed to poll messages')
  return response.json()
}
