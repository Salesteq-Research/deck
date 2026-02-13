import { useState, useRef, useEffect } from 'react'
import { Terminal, CornerDownLeft } from 'lucide-react'
import { sendAgentMessage } from '@/lib/api'

interface ToolCall {
  name: string
  input: Record<string, unknown>
  result_summary: string
}

interface AgentEntry {
  type: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
}

const suggestions = [
  'how many vehicles do we have in stock?',
  'show me all electric SUVs under 80k',
  'summarize today\'s leads',
  'which series is most popular with customers?',
  'find the most expensive vehicle in inventory',
  'draft a follow-up for the hottest lead',
]

function formatToolInput(input: Record<string, unknown>): string {
  const parts = Object.entries(input)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
  return parts.length > 0 ? `(${parts.join(', ')})` : '()'
}

export function AgentChat() {
  const [entries, setEntries] = useState<AgentEntry[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep a separate flat history for the API (role/content only)
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string }[]>([])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries, loading])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const send = async (text: string) => {
    if (!text.trim() || loading) return
    const userText = text.trim()

    // Add user entry
    setEntries(prev => [...prev, { type: 'user', content: userText }])
    setInput('')
    setLoading(true)

    const newHistory = [...chatHistory, { role: 'user', content: userText }]

    try {
      const res = await sendAgentMessage(userText, newHistory)

      // Add tool calls if any
      const newEntries: AgentEntry[] = []
      if (res.tool_calls && res.tool_calls.length > 0) {
        newEntries.push({ type: 'tool', content: '', toolCalls: res.tool_calls })
      }
      newEntries.push({ type: 'assistant', content: res.message })

      setEntries(prev => [...prev, ...newEntries])
      setChatHistory([...newHistory, { role: 'assistant', content: res.message }])
    } catch {
      setEntries(prev => [...prev, { type: 'assistant', content: 'error: failed to reach agent' }])
      setChatHistory([...newHistory, { role: 'assistant', content: 'error: failed to reach agent' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-200 font-mono text-[13px] leading-relaxed">
      {/* Output area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-1">
        {/* Welcome */}
        {entries.length === 0 && (
          <div className="space-y-4">
            <div className="text-slate-500">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Terminal className="h-4 w-4" />
                <span className="font-semibold">Hedin Agent</span>
                <span className="text-slate-600">v2.0</span>
              </div>
              <div className="text-slate-600 text-xs mb-4">
                Full access to inventory, leads, conversations, and analytics. Uses tools to query real data.
              </div>
            </div>
            <div className="text-slate-600 text-xs">Try:</div>
            <div className="space-y-1">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="block text-left text-slate-500 hover:text-blue-400 transition-colors"
                >
                  <span className="text-slate-600 mr-2">$</span>{s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Entries */}
        {entries.map((entry, i) => (
          <div key={i}>
            {entry.type === 'user' && (
              <div className="text-slate-300 mt-4">
                <span className="text-blue-400 mr-2 select-none">&#10095;</span>
                {entry.content}
              </div>
            )}
            {entry.type === 'tool' && entry.toolCalls && (
              <div className="mt-1 space-y-0.5">
                {entry.toolCalls.map((tc, j) => (
                  <div key={j} className="text-slate-600 text-xs">
                    <span className="text-amber-500/70">&#9670;</span>
                    {' '}
                    <span className="text-slate-500">{tc.name}</span>
                    <span className="text-slate-700">{formatToolInput(tc.input)}</span>
                    {' '}
                    <span className="text-slate-700">→</span>
                    {' '}
                    <span className="text-slate-500">{tc.result_summary}</span>
                  </div>
                ))}
              </div>
            )}
            {entry.type === 'assistant' && (
              <div className="text-slate-400 mt-1 mb-2 pl-4 border-l-2 border-slate-800 whitespace-pre-wrap">
                {entry.content}
              </div>
            )}
          </div>
        ))}

        {/* Loading */}
        {loading && (
          <div className="mt-1 space-y-1">
            <div className="text-slate-600 text-xs flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500/70 animate-pulse" />
              <span>querying tools...</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 px-5 py-3">
        <form
          onSubmit={(e) => { e.preventDefault(); send(input) }}
          className="flex items-center gap-2"
        >
          <span className="text-blue-400 select-none shrink-0">&#10095;</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={loading ? 'waiting...' : 'ask the agent...'}
            disabled={loading}
            className="flex-1 bg-transparent outline-none text-slate-200 placeholder:text-slate-700 caret-blue-400"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="shrink-0 text-slate-600 hover:text-slate-400 disabled:opacity-20 transition-opacity"
            title="Send (Enter)"
          >
            <CornerDownLeft className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
