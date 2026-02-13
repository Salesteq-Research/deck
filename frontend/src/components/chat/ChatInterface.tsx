import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  const [sessionId] = useState(() => crypto.randomUUID())

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
        // onText
        (delta) => {
          fullText += delta
          setStreamingText(fullText)
          setIsStreaming(true)
          setToolCallName(null)
        },
        // onVehicles
        (v) => {
          vehicles = v
          setStreamingVehicles(v)
        },
        // onToolCall
        (name) => {
          setToolCallName(name)
        },
        // onHumanMode
        () => {
          humanModeTriggered = true
          setIsHumanMode(true)
        },
      )

      if (humanModeTriggered) {
        // Human took over — skip AI message finalization, polling will handle replies
        setStreamingText('')
        setStreamingVehicles([])
        setIsStreaming(false)
      } else {
        // Finalize: move from streaming state to message list
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: fullText,
          vehicles: vehicles.length > 0 ? vehicles : undefined,
        }
        setMessages((prev) => [...prev, assistantMsg])
        setStreamingText('')
        setStreamingVehicles([])
        setIsStreaming(false)

        // Fetch suggestions async (non-blocking)
        getChatSuggestions(userMessage, history).then(setSuggestedQuestions)
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
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
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="border-b px-3 sm:px-6 py-2 flex items-center justify-between bg-background shrink-0">
        <h1 className="text-base sm:text-lg font-bold truncate">BMW Sales Advisor</h1>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <a href="/inventory">
            <Button variant="outline" size="sm" className="gap-1.5">
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">Stock</span>
            </Button>
          </a>
          <a href="/backoffice">
            <Button variant="outline" size="sm" className="gap-1.5">
              <span className="hidden sm:inline">Dealer</span>
            </Button>
          </a>
          <a href="/network">
            <Button variant="outline" size="sm" className="gap-1.5">
              <span className="hidden sm:inline">BMW CH</span>
            </Button>
          </a>
        </div>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3 py-3 sm:px-6 sm:py-4">
        <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
          {messages.length === 0 && !isLoading ? (
            <WelcomeHero onSuggestionClick={handleSuggestionClick} />
          ) : (
            messages.map((message, index) => (
              <div key={index} className="animate-message-in">
                {message.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[75%] rounded-3xl px-4 py-2.5 sm:px-5 sm:py-3 bg-[var(--color-user-bubble)] text-foreground">
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 sm:gap-3 items-start">
                    <AssistantAvatar />
                    <div className="flex-1 min-w-0 px-1 py-1">
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
            <div className="flex gap-2 sm:gap-3 items-start animate-message-in">
              <AssistantAvatar />
              <div className="flex-1 min-w-0 px-1 py-1">
                {isStreaming && streamingText ? (
                  <>
                    <MarkdownMessage content={streamingText} />
                    {streamingVehicles.length > 0 && (
                      <InlineProductRow vehicles={streamingVehicles} />
                    )}
                  </>
                ) : toolCallName ? (
                  <div className="flex items-center gap-2 py-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-foreground/60 animate-pulse" />
                    <span className="text-xs text-muted-foreground">searching inventory...</span>
                  </div>
                ) : (
                  <div className="px-1 py-2.5">
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
        <div className="px-3 sm:px-6 py-2 border-t shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide pb-0.5">
              {suggestedQuestions.map((question, index) => (
                <button
                  key={index}
                  className="shrink-0 px-3 py-1.5 rounded-lg border border-foreground/80 text-xs text-foreground bg-white hover:bg-gray-50 transition-colors whitespace-nowrap"
                  onClick={() => handleSuggestionClick(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t p-2.5 sm:p-4 bg-background shrink-0 pb-[calc(0.625rem+env(safe-area-inset-bottom))] sm:pb-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-[#eee] rounded-full px-4 py-1.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about BMW models, pricing..."
              disabled={isLoading}
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="shrink-0 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center disabled:opacity-30 transition-opacity"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
