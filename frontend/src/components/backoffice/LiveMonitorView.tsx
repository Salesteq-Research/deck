import { useState, useEffect, useRef } from 'react'
import { Radio, PhoneForwarded, PhoneOff, Send } from 'lucide-react'
import { getConversations, getConversation, takeoverConversation, handbackConversation, sendDealerReply } from '@/lib/api'
import type { ConversationSummary, ConversationDetail } from '@/lib/types'

export function LiveMonitorView() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Poll conversation list every 3s
  useEffect(() => {
    let active = true
    const load = () => {
      getConversations()
        .then((convs) => {
          if (active) setConversations(convs.filter((c) => c.status === 'active'))
        })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 3000)
    return () => { active = false; clearInterval(id) }
  }, [])

  // Poll selected conversation detail every 2s
  useEffect(() => {
    if (!selectedId) return
    let active = true
    const load = () => {
      getConversation(selectedId)
        .then((d) => { if (active) setDetail(d) })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 2000)
    return () => { active = false; clearInterval(id) }
  }, [selectedId])

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [detail?.messages?.length])

  const handleTakeover = async () => {
    if (!selectedId) return
    await takeoverConversation(selectedId)
    // Refresh detail
    const d = await getConversation(selectedId)
    setDetail(d)
  }

  const handleHandback = async () => {
    if (!selectedId) return
    await handbackConversation(selectedId)
    const d = await getConversation(selectedId)
    setDetail(d)
  }

  const handleReply = async () => {
    if (!selectedId || !replyText.trim() || sending) return
    setSending(true)
    try {
      await sendDealerReply(selectedId, replyText.trim())
      setReplyText('')
      const d = await getConversation(selectedId)
      setDetail(d)
    } finally {
      setSending(false)
    }
  }

  const isHuman = detail?.operator === 'human'

  return (
    <div className="flex h-full">
      {/* Left: conversation list */}
      <div className="w-64 border-r border-border overflow-y-auto shrink-0">
        <div className="px-3 py-2 border-b border-border flex items-center gap-2">
          <Radio className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-semibold">Live Conversations</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{conversations.length}</span>
        </div>
        {conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3 py-4">No active conversations</p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left px-3 py-2 border-b border-border text-xs transition-colors ${
                selectedId === c.id ? 'bg-primary/10' : 'hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground truncate">#{c.id}</span>
                <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  c.operator === 'human'
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {c.operator === 'human' ? 'dealer' : 'ai'}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {c.session_id.slice(0, 8)}... &middot; {c.message_count} msgs
              </div>
            </button>
          ))
        )}
      </div>

      {/* Right: transcript + controls */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedId || !detail ? (
          <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
            Select a conversation to monitor
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-2 border-b border-border flex items-center gap-3 shrink-0">
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold">Conversation #{detail.id}</span>
                <span className="text-[10px] text-muted-foreground ml-2">{detail.session_id.slice(0, 12)}...</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                isHuman ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {isHuman ? 'dealer control' : 'ai active'}
              </span>
              {isHuman ? (
                <button
                  onClick={handleHandback}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                >
                  <PhoneOff className="h-3 w-3" />
                  Hand Back
                </button>
              ) : (
                <button
                  onClick={handleTakeover}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors"
                >
                  <PhoneForwarded className="h-3 w-3" />
                  Take Over
                </button>
              )}
            </div>

            {/* Transcript */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {detail.messages.map((msg) => (
                <div key={msg.id}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[11px] font-medium ${
                      msg.role === 'user' ? 'text-blue-400' : 'text-emerald-400'
                    }`}>
                      {msg.role === 'user' ? 'customer' : 'assistant'}
                    </span>
                    {msg.role === 'assistant' && (
                      <span className={`text-[10px] px-1 rounded ${
                        msg.sender === 'human'
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {msg.sender === 'human' ? 'dealer' : 'ai'}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  <p className="text-xs text-foreground whitespace-pre-wrap pl-2 border-l-2 border-border">
                    {msg.content}
                  </p>
                </div>
              ))}
            </div>

            {/* Reply input (only when human) */}
            {isHuman && (
              <div className="px-4 py-2 border-t border-border shrink-0">
                <form
                  onSubmit={(e) => { e.preventDefault(); handleReply() }}
                  className="flex items-center gap-2"
                >
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type a reply as dealer..."
                    disabled={sending}
                    className="flex-1 bg-muted rounded px-3 py-1.5 text-xs outline-none text-foreground placeholder:text-muted-foreground"
                  />
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    className="shrink-0 w-7 h-7 rounded bg-orange-500 text-white flex items-center justify-center disabled:opacity-30 transition-opacity"
                  >
                    <Send className="h-3 w-3" />
                  </button>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
