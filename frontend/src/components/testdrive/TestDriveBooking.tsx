import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowUp, Calendar, Car, MapPin, CheckCircle2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AssistantAvatar } from '../chat/AssistantAvatar'
import { TypingIndicator } from '../chat/TypingIndicator'
import { MarkdownMessage } from '../chat/MarkdownMessage'
import { InlineProductRow } from '../chat/InlineProductRow'
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
  "I'd like to test drive a BMW 5 Series",
  "Show me electric vehicles for test drive",
  "What SUVs can I test drive?",
  "Ich mochte eine Probefahrt buchen",
]

// Progress tracker steps
const steps = [
  { key: 'vehicle', label: 'Fahrzeug', icon: Car },
  { key: 'dealer', label: 'Standort', icon: MapPin },
  { key: 'date', label: 'Termin', icon: Calendar },
  { key: 'confirm', label: 'Bestatigt', icon: CheckCircle2 },
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

  // Track booking progress based on conversation
  useEffect(() => {
    const allText = messages.map(m => m.content).join(' ').toLowerCase()
    if (allText.includes('booking_reference') || allText.includes('td-202') || allText.includes('bestatigt') || allText.includes('confirmed')) {
      setActiveStep(3)
    } else if (allText.includes('date') || allText.includes('termin') || allText.includes('time') || allText.includes('wann')) {
      setActiveStep(2)
    } else if (allText.includes('dealer') || allText.includes('handler') || allText.includes('standort') || allText.includes('partner')) {
      setActiveStep(1)
    } else if (messages.some(m => m.vehicles && m.vehicles.length > 0)) {
      setActiveStep(1)
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
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }])
      setStreamingText('')
      setIsStreaming(false)
    } finally {
      setIsLoading(false)
      setToolCallName(null)
    }
  }, [messages, isLoading, sessionId])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-white" onClick={() => inputRef.current?.focus()}>
      {/* Header — BMW Test Drive branding */}
      <header className="px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 border-b border-[#e6e6e6]">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 48 48" className="w-7 h-7" fill="none">
            <circle cx="24" cy="24" r="23" stroke="currentColor" strokeWidth="1.5" className="text-foreground/20" />
            <text x="24" y="28" textAnchor="middle" className="fill-foreground/70 text-[9px] font-semibold tracking-[0.08em]" style={{ fontFamily: 'system-ui' }}>BMW</text>
          </svg>
          <div className="flex flex-col">
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#1c1c1c]">Probefahrt buchen</span>
            <span className="text-[11px] text-[#999] tracking-[0.02em]">Test Drive Booking</span>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          <a href="/testdrive/inventory" className="px-3 py-1.5 rounded-lg text-[13px] text-[#1c69d4]/70 hover:text-[#1c69d4] hover:bg-[#1c69d4]/[0.06] font-medium transition-all">
            Fleet
          </a>
          <a href="/" className="px-3 py-1.5 rounded-lg text-[13px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-all">
            Chat
          </a>
          <a href="/inventory" className="px-3 py-1.5 rounded-lg text-[13px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-all">
            Stock
          </a>
          <a href="/backoffice" className="px-3 py-1.5 rounded-lg text-[13px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-all">
            Dealer
          </a>
        </nav>
      </header>

      {/* Progress Tracker */}
      <div className="px-4 sm:px-6 py-3 border-b border-[#f0f0f0] bg-[#fafafa] shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between">
            {steps.map((step, i) => {
              const Icon = step.icon
              const isActive = i <= activeStep
              const isCurrent = i === activeStep
              return (
                <div key={step.key} className="flex items-center gap-2 flex-1">
                  <div className={`
                    flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-all duration-500
                    ${isCurrent ? 'bg-[#1c69d4] text-white' : isActive ? 'bg-[#1c69d4]/10 text-[#1c69d4]' : 'bg-[#f0f0f0] text-[#999]'}
                  `}>
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
                    <AssistantAvatar />
                    <div className="flex-1 min-w-0 pt-0.5">
                      <MarkdownMessage content={message.content} />
                      {message.vehicles && message.vehicles.length > 0 && (
                        <InlineProductRow vehicles={message.vehicles} />
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
              <AssistantAvatar />
              <div className="flex-1 min-w-0 pt-0.5">
                {isStreaming && streamingText ? (
                  <>
                    <MarkdownMessage content={streamingText} />
                    {streamingVehicles.length > 0 && (
                      <InlineProductRow vehicles={streamingVehicles} />
                    )}
                  </>
                ) : toolCallName ? (
                  <div className="flex items-center gap-2.5 py-2">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:200ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:400ms]" />
                    </div>
                    <span className="text-[12px] text-[#999]">
                      {toolCallName === 'search_test_drive_vehicles' ? 'Fahrzeuge suchen...' :
                       toolCallName === 'get_available_dealers' ? 'Handler laden...' :
                       toolCallName === 'confirm_test_drive_booking' ? 'Buchung bestatigen...' :
                       'Processing...'}
                    </span>
                  </div>
                ) : (
                  <div className="py-2">
                    <TypingIndicator />
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="px-4 sm:px-6 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4 shrink-0 border-t border-[#f0f0f0]">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Welches Modell mochten Sie Probe fahren?"
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
          <p className="text-center text-[10px] text-[#bbb] mt-2">
            Powered by BMW AI Sales Advisor &middot; Swiss Market
          </p>
        </div>
      </div>
    </div>
  )
}


function TestDriveWelcome({ onSuggestionClick }: { onSuggestionClick: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[55vh] px-4">
      {/* BMW Roundel with test drive icon */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#1c69d4]/5 to-[#1c69d4]/10 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full border-[2px] border-[#1c69d4]/20 flex items-center justify-center">
            <Car className="w-7 h-7 text-[#1c69d4]/60" />
          </div>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-[1.75rem] sm:text-[2rem] font-semibold tracking-[-0.03em] text-[#1c1c1c] mb-2">
        Probefahrt buchen
      </h1>
      <p className="text-[15px] text-[#888] text-center max-w-md mb-2 leading-relaxed">
        Book your BMW test drive experience. Our AI assistant will guide you through selecting a vehicle, choosing a dealer, and scheduling your appointment.
      </p>
      <p className="text-[13px] text-[#aaa] text-center max-w-sm mb-10">
        Wahlen Sie Ihr Wunschfahrzeug und vereinbaren Sie einen Termin bei Ihrem BMW Partner.
      </p>

      {/* Suggestion chips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-md">
        {suggestions.map((question) => (
          <button
            key={question}
            onClick={() => onSuggestionClick(question)}
            className="group relative px-5 py-3.5 rounded-2xl text-[13.5px] text-[#555] bg-[#fafafa] border border-[#e8e8e8] hover:border-[#1c69d4]/20 hover:bg-[#1c69d4]/[0.03] transition-all duration-200 text-left active:scale-[0.98]"
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
