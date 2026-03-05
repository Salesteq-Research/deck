import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowUp, Calendar, Car, MapPin, CheckCircle2, Zap, Fuel, Battery } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TypingIndicator } from '../chat/TypingIndicator'
import { MarkdownMessage } from '../chat/MarkdownMessage'
import type { ChatMessage, VehicleCard } from '@/lib/types'

const API_BASE = '/api'

async function sendTestDriveStream(
  message: string,
  conversationHistory: ChatMessage[],
  sessionId: string,
  onText: (text: string) => void,
  onVehicles: (vehicles: VehicleCard[]) => void,
  onToolCall?: (name: string) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE}/testdrive/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      conversation_history: conversationHistory,
      session_id: sessionId,
    }),
  })
  if (!response.ok) throw new Error('Stream failed')

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
      } catch {
        // skip
      }
    }
  }
}

const suggestions = [
  "Ich möchte den neuen BMW i7 Probe fahren",
  "Welche Elektrofahrzeuge kann ich testen?",
  "Zeigen Sie mir SUV-Modelle für eine Probefahrt",
  "Ich interessiere mich für den BMW 3er",
]

const steps = [
  { key: 'vehicle', label: 'Fahrzeug', icon: Car },
  { key: 'dealer', label: 'Standort', icon: MapPin },
  { key: 'date', label: 'Termin', icon: Calendar },
  { key: 'confirm', label: 'Bestätigt', icon: CheckCircle2 },
]

export function TestDriveBooking() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamingVehicles, setStreamingVehicles] = useState<VehicleCard[]>([])
  const [toolCallName, setToolCallName] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [sessionId] = useState(() => crypto.randomUUID())

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { if (!isLoading) inputRef.current?.focus() }, [isLoading, messages])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingText])

  // Track booking progress from conversation content
  useEffect(() => {
    const allText = messages.map(m => m.content).join(' ').toLowerCase()
    if (allText.includes('td-202') || allText.includes('buchungsreferenz') || allText.includes('booking_reference') || allText.includes('bestätigt')) {
      setActiveStep(3)
    } else if (allText.includes('datum') || allText.includes('termin') || allText.includes('wann') || allText.includes('preferred date') || allText.includes('time of day') || allText.includes('zeitpunkt')) {
      setActiveStep(2)
    } else if (allText.includes('händler') || allText.includes('partner') || allText.includes('standort') || allText.includes('dealer') || allText.includes('niederlassung') || allText.includes('region')) {
      setActiveStep(1)
    } else if (messages.length >= 2) {
      setActiveStep(0)
    }
  }, [messages])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMessage = text.trim()
    setInput('')

    const userMsg: ChatMessage = { role: 'user', content: userMessage }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    setIsStreaming(false)
    setStreamingText('')
    setStreamingVehicles([])
    setToolCallName(null)

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

      let fullText = ''
      let vehicles: VehicleCard[] = []

      await sendTestDriveStream(
        userMessage,
        history,
        sessionId,
        (delta) => {
          fullText += delta
          setStreamingText(fullText)
          setIsStreaming(true)
          setToolCallName(null)
        },
        (v) => {
          vehicles = v
          setStreamingVehicles(v)
        },
        (name) => {
          setToolCallName(name)
        },
      )

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: fullText,
        vehicles: vehicles.length > 0 ? vehicles : undefined,
      }
      setMessages(prev => [...prev, assistantMsg])
      setStreamingText('')
      setStreamingVehicles([])
      setIsStreaming(false)
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Entschuldigung, ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.' }])
      setStreamingText('')
      setIsStreaming(false)
    } finally {
      setIsLoading(false)
      setToolCallName(null)
    }
  }, [messages, isLoading, sessionId])

  const handleModelSelect = useCallback((vehicle: VehicleCard) => {
    sendMessage(`Ich möchte eine Probefahrt mit dem ${vehicle.name} buchen`)
  }, [sendMessage])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  const toolCallLabel = (name: string) => {
    const labels: Record<string, string> = {
      'browse_test_drive_models': 'Modelle werden geladen …',
      'get_model_details': 'Fahrzeugdetails laden …',
      'get_available_dealers': 'BMW Partner suchen …',
      'confirm_test_drive_booking': 'Buchung wird bestätigt …',
    }
    return labels[name] || 'Wird verarbeitet …'
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#fafafa]" onClick={() => inputRef.current?.focus()}>
      {/* Header — dark, premium */}
      <header className="px-4 sm:px-6 py-3.5 flex items-center justify-between shrink-0 bg-[#0d0d0d]">
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-bold text-white tracking-[0.08em]" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>BMW</span>
          <span className="w-px h-4 bg-white/15" />
          <span className="text-[13px] font-medium text-white/60 tracking-[-0.01em]">Probefahrt buchen</span>
        </div>
        <nav className="flex items-center gap-1">
          <a href="/" className="px-3 py-1.5 rounded-lg text-[12px] text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all">Home</a>
          <a href="/testdrive/inventory" className="px-3 py-1.5 rounded-lg text-[12px] text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all">Modelle</a>
        </nav>
      </header>

      {/* Progress Tracker */}
      <div className="px-4 sm:px-6 py-3 border-b border-[#e8e8e8] bg-white shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between">
            {steps.map((step, i) => {
              const Icon = step.icon
              const isActive = i <= activeStep
              const isCurrent = i === activeStep
              return (
                <div key={step.key} className="flex items-center gap-2 flex-1">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-all duration-500 ${
                    isCurrent ? 'bg-[#1c69d4] text-white' : isActive ? 'bg-[#1c69d4]/10 text-[#1c69d4]' : 'bg-[#f0f0f0] text-[#aaa]'
                  }`}>
                    <Icon className="w-3 h-3" />
                    <span className="hidden sm:inline">{step.label}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`flex-1 h-[1.5px] transition-all duration-500 ${i < activeStep ? 'bg-[#1c69d4]' : 'bg-[#e6e6e6]'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4 sm:px-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.length === 0 && !isLoading ? (
            <TestDriveWelcome onSuggestionClick={sendMessage} />
          ) : (
            messages.map((message, index) => (
              <div key={index} className="animate-message-in">
                {message.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[70%] rounded-[1.25rem] rounded-br-md px-4 py-2.5 bg-[#1c69d4] text-white">
                      <p className="text-[14px] leading-relaxed">{message.content}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 items-start">
                    <BmwAvatar />
                    <div className="flex-1 min-w-0 pt-0.5">
                      <MarkdownMessage content={message.content} />
                      {message.vehicles && message.vehicles.length > 0 && (
                        <SelectableModelCards vehicles={message.vehicles} onSelect={handleModelSelect} disabled={isLoading} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}

          {/* Streaming */}
          {isLoading && (
            <div className="flex gap-3 items-start animate-message-in">
              <BmwAvatar />
              <div className="flex-1 min-w-0 pt-0.5">
                {isStreaming && streamingText ? (
                  <>
                    <MarkdownMessage content={streamingText} />
                    {streamingVehicles.length > 0 && (
                      <SelectableModelCards vehicles={streamingVehicles} onSelect={handleModelSelect} disabled />
                    )}
                  </>
                ) : toolCallName ? (
                  <div className="flex items-center gap-2.5 py-2">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:200ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:400ms]" />
                    </div>
                    <span className="text-[12px] text-[#999]">{toolCallLabel(toolCallName)}</span>
                  </div>
                ) : (
                  <div className="py-2"><TypingIndicator /></div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="px-4 sm:px-6 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4 shrink-0 border-t border-[#e8e8e8] bg-white">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                activeStep === 0 ? "Welches Modell möchten Sie Probe fahren?" :
                activeStep === 1 ? "In welcher Region ist Ihr BMW Partner?" :
                activeStep === 2 ? "Wann möchten Sie die Probefahrt machen?" :
                "Nachricht eingeben …"
              }
              disabled={isLoading}
              autoFocus
              className="w-full bg-[#f5f5f5] border border-[#e6e6e6] rounded-2xl pl-5 pr-12 py-3.5 text-[14.5px] text-[#1c1c1c] placeholder:text-[#999] outline-none focus:border-[#1c69d4]/30 focus:bg-white transition-all duration-200 disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-[#1c69d4] flex items-center justify-center disabled:opacity-15 transition-all duration-200 hover:scale-105 active:scale-95"
            >
              <ArrowUp className="h-4 w-4 text-white" strokeWidth={2.5} />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}


/** Inline BMW avatar for assistant messages */
function BmwAvatar() {
  return (
    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#0d0d0d] flex items-center justify-center">
      <span className="text-[8px] font-bold text-white tracking-[0.06em]" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>BMW</span>
    </div>
  )
}


/** Selectable model cards */
function SelectableModelCards({ vehicles, onSelect, disabled }: {
  vehicles: VehicleCard[]
  onSelect: (v: VehicleCard) => void
  disabled?: boolean
}) {
  if (vehicles.length === 0) return null

  return (
    <div className="mt-3 pt-3">
      <div className="flex gap-3 overflow-x-auto py-2 px-0.5 scrollbar-hide">
        {vehicles.map((v) => (
          <button
            key={v.vin}
            disabled={disabled}
            onClick={(e) => { e.stopPropagation(); onSelect(v) }}
            className="flex-shrink-0 w-[240px] sm:w-[280px] flex flex-col rounded-xl border border-[#e6e6e6] bg-white overflow-hidden text-left transition-all duration-200 hover:border-[#1c69d4] hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none group"
          >
            {/* Image — larger */}
            <div className="w-full h-[140px] sm:h-[165px] bg-gradient-to-br from-[#f8f8f8] to-[#efefef] relative flex items-center justify-center overflow-hidden">
              {v.image ? (
                <img
                  src={v.image}
                  alt={v.name}
                  className="w-[85%] h-auto object-contain drop-shadow-lg group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : null}
              {/* Powertrain badge */}
              <div className={`absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium backdrop-blur-sm ${
                v.fuel_type?.includes('Electri') ? 'bg-emerald-500/90 text-white' :
                v.fuel_type?.includes('Hybrid') ? 'bg-blue-500/90 text-white' :
                'bg-white/80 text-[#555] border border-black/5'
              }`}>
                {v.fuel_type?.includes('Electri') ? <Zap className="w-2.5 h-2.5" /> :
                 v.fuel_type?.includes('Hybrid') ? <Battery className="w-2.5 h-2.5" /> :
                 <Fuel className="w-2.5 h-2.5" />}
                {v.fuel_type}
              </div>
            </div>

            {/* Info */}
            <div className="p-3.5 flex-1 flex flex-col">
              <h4 className="text-[13.5px] font-semibold text-[#1c1c1c] leading-tight line-clamp-2">{v.name}</h4>
              <p className="text-[11px] text-[#888] mt-0.5">
                {v.series && <span className="text-[#1c69d4] font-medium">{v.series}</span>}
                {v.body_type && <> &middot; {v.body_type}</>}
              </p>
              {v.price && (
                <p className="text-[14px] font-bold text-[#1c1c1c] mt-auto pt-2">{v.price}</p>
              )}

              {/* Select CTA */}
              <div className="mt-2 py-1.5 rounded-lg bg-[#1c69d4]/[0.06] text-[#1c69d4] text-[11px] font-medium text-center group-hover:bg-[#1c69d4] group-hover:text-white transition-all">
                Dieses Modell wählen
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}


function TestDriveWelcome({ onSuggestionClick }: { onSuggestionClick: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[55vh] px-4">
      <div className="relative mb-8">
        <div className="w-20 h-20 rounded-full bg-[#0d0d0d] flex items-center justify-center">
          <span className="text-[14px] font-bold text-white tracking-[0.12em]" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>BMW</span>
        </div>
      </div>

      <h1 className="text-[1.75rem] sm:text-[2rem] font-semibold tracking-[-0.03em] text-[#1c1c1c] mb-2">
        Probefahrt buchen
      </h1>
      <p className="text-[14px] text-[#888] text-center max-w-md mb-10 leading-relaxed">
        Unser AI-Assistent führt Sie in wenigen Schritten durch die Buchung — Fahrzeug wählen, BMW Partner finden und Ihren Wunschtermin vereinbaren.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-md">
        {suggestions.map((question) => (
          <button
            key={question}
            onClick={() => onSuggestionClick(question)}
            className="group relative px-5 py-3.5 rounded-2xl text-[13px] text-[#555] bg-white border border-[#e8e8e8] hover:border-[#1c69d4]/20 hover:bg-[#1c69d4]/[0.02] transition-all duration-200 text-left active:scale-[0.98]"
          >
            {question}
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#ccc] group-hover:text-[#1c69d4]/40 transition-colors text-sm">
              &rarr;
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
