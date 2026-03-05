import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowUp } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AssistantAvatar } from './AssistantAvatar'
import { TypingIndicator } from './TypingIndicator'
import { MarkdownMessage } from './MarkdownMessage'
import { InlineProductRow } from './InlineProductRow'
import { WelcomeHero } from './WelcomeHero'
import { sendChatMessageStream, getChatSuggestions, pollCustomerMessages } from '@/lib/api'
import type { ChatMessage, VehicleCard } from '@/lib/types'

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
  const lastMessageIdRef = useRef(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [sessionId] = useState(() => crypto.randomUUID())

  // Always focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus()
    }
  }, [isLoading, messages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

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
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }))

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
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' },
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

  const handleSuggestionClick = (question: string) => {
    sendMessage(question)
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-background" onClick={() => inputRef.current?.focus()}>
      {/* Header — minimal, premium */}
      <header className="px-4 sm:px-6 py-3 flex items-center justify-between shrink-0 border-b border-foreground/[0.06]">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 48 48" className="w-7 h-7" fill="none">
            <circle cx="24" cy="24" r="23" stroke="currentColor" strokeWidth="1.5" className="text-foreground/20" />
            <text x="24" y="28" textAnchor="middle" className="fill-foreground/70 text-[9px] font-semibold tracking-[0.08em]" style={{ fontFamily: 'system-ui' }}>BMW</text>
          </svg>
          <span className="text-[15px] font-medium tracking-[-0.01em] text-foreground/80">Sales Advisor</span>
        </div>
        <nav className="flex items-center gap-1">
          <a href="/" className="px-3 py-1.5 rounded-lg text-[13px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-all">
            Home
          </a>
          <a href="/inventory" className="px-3 py-1.5 rounded-lg text-[13px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-all">
            Stock
          </a>
          <a href="/backoffice" className="px-3 py-1.5 rounded-lg text-[13px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-all">
            Dealer
          </a>
          <a href="/network" className="px-3 py-1.5 rounded-lg text-[13px] text-foreground/40 hover:text-foreground/70 hover:bg-foreground/[0.04] transition-all">
            Network
          </a>
        </nav>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4 sm:px-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.length === 0 && !isLoading ? (
            <WelcomeHero onSuggestionClick={handleSuggestionClick} />
          ) : (
            messages.map((message, index) => (
              <div key={index} className="animate-message-in">
                {message.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[70%] rounded-[1.25rem] rounded-br-md px-4 py-2.5 bg-foreground text-background">
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

          {/* Streaming response */}
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
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground/30 animate-typing-dot [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground/30 animate-typing-dot [animation-delay:200ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground/30 animate-typing-dot [animation-delay:400ms]" />
                    </div>
                    <span className="text-[12px] text-foreground/30">Searching inventory</span>
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

      {/* Suggested Questions */}
      {suggestedQuestions.length > 0 && !isLoading && (
        <div className="px-4 sm:px-6 pb-2 shrink-0">
          <div className="max-w-2xl mx-auto">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {suggestedQuestions.map((question, index) => (
                <button
                  key={index}
                  className="shrink-0 px-3.5 py-2 rounded-xl text-[12.5px] text-foreground/50 bg-foreground/[0.03] border border-foreground/[0.07] hover:border-foreground/[0.14] hover:text-foreground/70 transition-all whitespace-nowrap"
                  onClick={() => handleSuggestionClick(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input — clean, focused, Apple-style */}
      <div className="px-4 sm:px-6 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-4 shrink-0">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit} className="relative">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message BMW Sales Advisor..."
              disabled={isLoading}
              autoFocus
              className="w-full bg-foreground/[0.04] border border-foreground/[0.08] rounded-2xl pl-5 pr-12 py-3.5 text-[14.5px] text-foreground placeholder:text-foreground/25 outline-none focus:border-foreground/[0.15] focus:bg-foreground/[0.06] transition-all duration-200 disabled:opacity-40"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-foreground flex items-center justify-center disabled:opacity-15 transition-all duration-200 hover:scale-105 active:scale-95"
            >
              <ArrowUp className="h-4 w-4 text-background" strokeWidth={2.5} />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
