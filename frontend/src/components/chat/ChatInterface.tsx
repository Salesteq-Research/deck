import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowUp, X } from 'lucide-react'
import { TypingIndicator } from './TypingIndicator'
import { MarkdownMessage } from './MarkdownMessage'
import { InlineProductRow } from './InlineProductRow'
import { VehicleSpotlight } from './VehicleSpotlight'
import { sendChatMessageStream, getChatSuggestions, pollCustomerMessages } from '@/lib/api'
import type { ChatMessage, VehicleCard } from '@/lib/types'

const suggestions = [
  "Show me electric vehicles",
  "What's available under CHF 60,000?",
  "Compare the 3 Series vs 4 Series",
  "Which SUVs do you have?",
]

export function ChatInterface() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamingVehicles, setStreamingVehicles] = useState<VehicleCard[]>([])
  const [toolCallName, setToolCallName] = useState<string | null>(null)
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([])
  const [isHumanMode, setIsHumanMode] = useState(false)
  const [bgVideo, setBgVideo] = useState<string | null>(null)
  const [videoMap, setVideoMap] = useState<Record<string, string>>({})
  const [spotlightVehicle, setSpotlightVehicle] = useState<VehicleCard | null>(null)
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const lastMessageIdRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [sessionId] = useState(() => crypto.randomUUID())

  // Load video map
  useEffect(() => {
    fetch('/videos/index.json').then(r => r.ok ? r.json() : {}).then(setVideoMap).catch(() => {})
  }, [])

  // Set background video when vehicles appear
  useEffect(() => {
    if (!bgVideo) {
      for (const msg of messages) {
        if (msg.vehicles?.length) {
          const name = msg.vehicles[0].name.toLowerCase()
          const matchedId = Object.keys(videoMap).find(id =>
            name.includes(id.replace(/-/g, ' ').replace('limousine', '').trim())
          )
          if (matchedId && videoMap[matchedId]) {
            setBgVideo(videoMap[matchedId])
            break
          }
        }
      }
    }
  }, [messages, videoMap, bgVideo])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => { if (!isLoading) inputRef.current?.focus() }, [isLoading, messages])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingText])

  // Poll for dealer messages when in human mode
  useEffect(() => {
    if (!isHumanMode) return
    let active = true
    const poll = async () => {
      try {
        const data = await pollCustomerMessages(sessionId, lastMessageIdRef.current)
        if (!active) return
        if (data.messages.length > 0) {
          const newMsgs: ChatMessage[] = data.messages.map((m) => ({
            role: 'assistant' as const,
            content: m.content,
          }))
          setMessages((prev) => [...prev, ...newMsgs])
          lastMessageIdRef.current = data.messages[data.messages.length - 1].id
        }
        if (data.operator === 'ai') {
          setIsHumanMode(false)
        }
      } catch {
        // ignore poll errors
      }
    }
    const id = setInterval(poll, 2000)
    return () => { active = false; clearInterval(id) }
  }, [isHumanMode, sessionId])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return

    const userMessage = text.trim()
    setInput('')
    setSuggestedQuestions([])

    const userMsg: ChatMessage = { role: 'user', content: userMessage }
    setMessages((prev) => [...prev, userMsg])
    setIsLoading(true)
    setIsStreaming(false)
    setStreamingText('')
    setStreamingVehicles([])
    setToolCallName(null)

    try {
      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))

      let fullText = ''
      let vehicles: VehicleCard[] = []
      let humanModeTriggered = false

      await sendChatMessageStream(
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
        () => {
          humanModeTriggered = true
          setIsHumanMode(true)
        },
      )

      if (humanModeTriggered) {
        setStreamingText('')
        setStreamingVehicles([])
        setIsStreaming(false)
      } else {
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: fullText,
          vehicles: vehicles.length > 0 ? vehicles : undefined,
        }
        setMessages((prev) => [...prev, assistantMsg])
        setStreamingText('')
        setStreamingVehicles([])
        setIsStreaming(false)
        getChatSuggestions(userMessage, history).then(setSuggestedQuestions)
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Entschuldigung, ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.' },
      ])
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

  const handleVehicleSelect = useCallback((vehicle: VehicleCard) => {
    setSpotlightVehicle(vehicle)
  }, [])

  const handleSpotlightAction = useCallback((message: string) => {
    sendMessage(message)
  }, [sendMessage])

  const getVideoForVehicle = useCallback((name: string) => {
    const lower = name.toLowerCase()
    const matchedId = Object.keys(videoMap).find(id =>
      lower.includes(id.replace(/-/g, ' ').replace('limousine', '').trim())
    )
    return matchedId ? videoMap[matchedId] : undefined
  }, [videoMap])

  const toolCallLabel = (name: string) => {
    const labels: Record<string, string> = {
      'search_inventory': 'Searching inventory …',
      'get_vehicle_details': 'Loading vehicle details …',
      'compare_vehicles': 'Comparing models …',
      'schedule_test_drive': 'Scheduling test drive …',
      'book_service_appointment': 'Booking service appointment …',
    }
    return labels[name] || 'Processing …'
  }

  // ── WELCOME STATE ──
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col h-[100dvh] bg-black" onClick={() => inputRef.current?.focus()}>
        {/* Header */}
        <header className="px-4 sm:px-8 py-3.5 flex items-center justify-between shrink-0 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <img src="/bmw-logo.png" alt="BMW" className="w-7 h-7" />
            <span className="w-px h-4 bg-white/15" />
            <span className="text-[12px] font-bold text-white/80 uppercase tracking-[0.12em]">Sales Advisor</span>
          </div>
          <nav className="flex items-center gap-1">
            <a href="/inventory" className="hidden sm:block px-3 py-1.5 text-[12px] font-bold text-white/60 uppercase tracking-[0.08em] hover:text-white transition-all">Stock</a>
            <a href="/backoffice" className="hidden sm:block px-3 py-1.5 text-[12px] font-bold text-white/60 uppercase tracking-[0.08em] hover:text-white transition-all">Cockpit</a>
            <a href="/" className="ml-1 w-7 h-7 rounded-[4px] flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all" title="Home">
              <X className="w-3.5 h-3.5" strokeWidth={2} />
            </a>
          </nav>
        </header>

        {/* Centered welcome */}
        <div className="flex-1 overflow-y-auto overscroll-y-contain relative">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[400px] h-[400px] rounded-full bg-[#1c69d4] animate-ambient-glow" />
          </div>

          <div className="flex flex-col items-center px-4 sm:px-6 py-12 sm:py-20 min-h-full justify-center">
            <img src="/bmw-logo.png" alt="BMW" className="w-12 h-12 opacity-70 mb-6 animate-hero-in" />

            <h1 className="text-[1.5rem] sm:text-[2.5rem] font-extralight tracking-[0.01em] text-white text-center mb-3 animate-hero-in [animation-delay:100ms] [animation-fill-mode:both]">
              Sales Advisor
            </h1>
            <p className="text-[13px] text-white/40 text-center max-w-sm mb-10 leading-relaxed animate-hero-in [animation-delay:150ms] [animation-fill-mode:both]">
              Your personal BMW consultant for the Swiss market.
            </p>

            {/* Suggestion chips */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md animate-hero-in [animation-delay:250ms] [animation-fill-mode:both]">
              {suggestions.map((question) => (
                <button
                  key={question}
                  onClick={() => sendMessage(question)}
                  className="group flex items-center justify-between px-4 py-3 rounded-[4px] text-[13px] text-white/60 bg-white/[0.04] border border-white/[0.08] hover:border-[#1c69d4]/40 hover:bg-white/[0.06] hover:text-white/80 transition-all duration-200 text-left active:scale-[0.98]"
                >
                  <span>{question}</span>
                  <ArrowUp className="w-3 h-3 text-white/0 group-hover:text-white/30 -rotate-45 transition-all shrink-0 ml-2" />
                </button>
              ))}
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="relative w-full max-w-xl mt-8 animate-hero-in [animation-delay:350ms] [animation-fill-mode:both]">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message BMW Sales Advisor …"
                autoFocus
                className="w-full bg-white/[0.06] border border-white/[0.12] rounded-[4px] pl-4 pr-12 py-4 sm:pl-5 sm:pr-14 sm:py-5 text-base sm:text-lg text-white placeholder:text-white/40 outline-none focus:border-[#1c69d4]/60 focus:bg-white/[0.08] transition-all duration-300 animate-input-glow"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 rounded-[4px] bg-[#1c69d4] flex items-center justify-center disabled:opacity-15 transition-all duration-200 hover:bg-[#1a5db8] active:scale-95"
              >
                <ArrowUp className="h-5 w-5 text-white" strokeWidth={2.5} />
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // ── CONVERSATION STATE ──
  return (
    <div className="flex flex-col h-[100dvh] bg-black relative overflow-hidden" onClick={() => inputRef.current?.focus()}>
      {/* Cinematic background video */}
      {bgVideo && (
        <div className="absolute inset-0 z-0" style={{ animation: 'video-fade-in 1.2s ease-out' }}>
          <video
            ref={bgVideoRef}
            src={bgVideo}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-contain sm:object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/95 via-black/92 to-black/97" />
        </div>
      )}
      {/* Header */}
      <header className="px-4 sm:px-8 py-3.5 flex items-center justify-between shrink-0 border-b border-white/[0.06] relative z-10">
        <div className="flex items-center gap-3">
          <img src="/bmw-logo.png" alt="BMW" className="w-7 h-7" />
          <span className="w-px h-4 bg-white/15" />
          <span className="text-[12px] font-bold text-white/80 uppercase tracking-[0.12em]">Sales Advisor</span>
        </div>
        <nav className="flex items-center gap-1">
          <a href="/inventory" className="hidden sm:block px-3 py-1.5 text-[12px] font-bold text-white/60 uppercase tracking-[0.08em] hover:text-white transition-all">Stock</a>
          <a href="/backoffice" className="hidden sm:block px-3 py-1.5 text-[12px] font-bold text-white/60 uppercase tracking-[0.08em] hover:text-white transition-all">Cockpit</a>
          <a href="/" className="ml-1 w-7 h-7 rounded-[4px] flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.06] transition-all" title="Home">
            <X className="w-3.5 h-3.5" strokeWidth={2} />
          </a>
        </nav>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overscroll-y-contain px-4 py-5 sm:px-6 relative z-10">
        <div className="max-w-2xl mx-auto space-y-5">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={index === messages.length - 1 ? 'animate-message-in' : ''}>
              {message.role === 'user' ? (
                <div className="flex justify-end">
                  <div className="max-w-[85%] sm:max-w-[70%] rounded-[4px] px-4 py-2.5 bg-white/[0.10] text-white">
                    <p className="text-[14px] leading-relaxed">{message.content}</p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3 items-start">
                  <div className="flex-shrink-0 w-8 h-8 rounded-[4px] bg-white/[0.10] flex items-center justify-center">
                    <img src="/bmw-logo.png" alt="BMW" className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <MarkdownMessage content={message.content} />
                    {message.vehicles && message.vehicles.length > 0 && (
                      <InlineProductRow vehicles={message.vehicles} onSelect={handleVehicleSelect} />
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Streaming */}
          {isLoading && (
            <div className="flex gap-3 items-start animate-message-in">
              <div className="flex-shrink-0 w-8 h-8 rounded-[4px] bg-white/[0.10] flex items-center justify-center">
                <img src="/bmw-logo.png" alt="BMW" className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                {isStreaming && streamingText ? (
                  <>
                    <MarkdownMessage content={streamingText} />
                    {streamingVehicles.length > 0 && (
                      <InlineProductRow vehicles={streamingVehicles} onSelect={handleVehicleSelect} />
                    )}
                  </>
                ) : toolCallName ? (
                  <div className="flex items-center gap-2.5 py-2 animate-tool-call-in">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:200ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#1c69d4]/40 animate-typing-dot [animation-delay:400ms]" />
                    </div>
                    <span className="text-[12px] text-white/50">{toolCallLabel(toolCallName)}</span>
                  </div>
                ) : (
                  <div className="py-2"><TypingIndicator dotClassName="bg-[#1c69d4]/50" /></div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Suggested Questions */}
      {suggestedQuestions.length > 0 && !isLoading && (
        <div className="px-4 sm:px-6 pb-2 shrink-0 relative z-10">
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {suggestedQuestions.map((question, index) => (
                <button
                  key={index}
                  className="shrink-0 px-3 py-1.5 rounded-[4px] text-[12px] text-white/50 bg-white/[0.04] border border-white/[0.08] hover:border-[#1c69d4]/30 hover:text-white/70 transition-all whitespace-nowrap"
                  onClick={() => sendMessage(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 sm:px-6 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4 shrink-0 border-t border-white/[0.06] relative z-10">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message BMW Sales Advisor …"
              disabled={isLoading}
              autoFocus
              className="w-full bg-white/[0.06] border border-white/[0.10] rounded-[4px] pl-5 pr-12 py-3.5 text-[14px] text-white placeholder:text-white/40 outline-none focus:border-[#1c69d4]/50 focus:bg-white/[0.08] transition-all duration-200 disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-[4px] bg-[#1c69d4] flex items-center justify-center disabled:opacity-15 transition-all duration-200 hover:bg-[#1a5db8] active:scale-95"
            >
              <ArrowUp className="h-4 w-4 text-white" strokeWidth={2.5} />
            </button>
          </form>
        </div>
      </div>

      {/* Vehicle Spotlight overlay */}
      {spotlightVehicle && (
        <VehicleSpotlight
          vehicle={spotlightVehicle}
          videoSrc={getVideoForVehicle(spotlightVehicle.name)}
          onClose={() => setSpotlightVehicle(null)}
          onAction={handleSpotlightAction}
        />
      )}
    </div>
  )
}
