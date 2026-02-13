import { useState, useEffect } from 'react'
import { Bot } from 'lucide-react'
import { getConversations, getConversation, getAiInsight } from '@/lib/api'
import { ConversationTranscript } from './ConversationTranscript'
import type { ConversationSummary, ConversationDetail } from '@/lib/types'

function timeAgo(dateStr?: string) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export function ConversationsView() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    const load = () => getConversations().then(setConversations).catch(() => {})
    load()
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (selectedId) {
      const load = () => getConversation(selectedId).then(setDetail).catch(() => {})
      load()
      const interval = setInterval(load, 5000)

      // Get AI insight for this conversation
      setAiInsight(null)
      setAiLoading(true)
      getAiInsight('conversation', undefined, selectedId)
        .then((res) => setAiInsight(res.insight))
        .catch(() => {})
        .finally(() => setAiLoading(false))

      return () => clearInterval(interval)
    } else {
      setDetail(null)
      setAiInsight(null)
    }
  }, [selectedId])

  return (
    <div className="flex h-full">
      {/* List */}
      <div className={`${selectedId ? 'w-1/2' : 'w-full'} border-r border-border overflow-y-auto`}>
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">conversations</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{conversations.length} total</span>
        </div>
        {conversations.length === 0 ? (
          <div className="p-5 text-xs text-muted-foreground">
            no conversations yet
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedId(conv.id)}
              className={`w-full text-left px-4 py-2.5 border-b border-border hover:bg-secondary/50 transition-colors ${
                selectedId === conv.id ? 'bg-secondary' : ''
              }`}
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="text-foreground truncate">
                  {conv.summary || `session:${conv.session_id.slice(0, 12)}`}
                </span>
                <span className={`ml-auto shrink-0 text-[11px] ${
                  conv.status === 'active' ? 'text-emerald-400' : 'text-muted-foreground'
                }`}>
                  {conv.status === 'active' && '● '}{conv.status}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-muted-foreground">{conv.message_count} msgs</span>
                {conv.lead_id && (
                  <span className="text-[10px] text-primary/60">lead #{conv.lead_id}</span>
                )}
                <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">{timeAgo(conv.updated_at)}</span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Detail + Transcript */}
      {detail && (
        <div className="w-1/2 overflow-y-auto flex flex-col">
          {/* Conversation header */}
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
            <span className="text-xs text-muted-foreground">
              conversation #{detail.id} — {detail.message_count} msgs
            </span>
            <span className={`text-[11px] ${
              detail.status === 'active' ? 'text-emerald-400' : 'text-muted-foreground'
            }`}>
              {detail.status}
            </span>
          </div>

          {/* AI Insight */}
          <div className="mx-4 mt-3 border border-primary/20 rounded-md bg-primary/5 shrink-0">
            <div className="px-3 py-1.5 border-b border-primary/10 flex items-center gap-1.5">
              <Bot className="h-3 w-3 text-primary" />
              <span className="text-[10px] text-primary font-medium">conversation analysis</span>
            </div>
            <div className="px-3 py-2">
              {aiLoading ? (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="inline-block w-1 h-1 rounded-full bg-primary animate-pulse" />
                  analyzing conversation...
                </div>
              ) : aiInsight ? (
                <p className="text-[11px] text-foreground leading-relaxed whitespace-pre-wrap">{aiInsight}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">no analysis available</p>
              )}
            </div>
          </div>

          {/* Transcript */}
          <div className="p-4 flex-1">
            <ConversationTranscript messages={detail.messages} />
          </div>
        </div>
      )}
    </div>
  )
}
