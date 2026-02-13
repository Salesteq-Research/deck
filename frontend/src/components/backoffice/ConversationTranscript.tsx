import type { ConversationMessageItem } from '@/lib/types'

function timeStr(dateStr?: string) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function ConversationTranscript({ messages }: { messages: ConversationMessageItem[] }) {
  if (messages.length === 0) {
    return <p className="text-xs text-muted-foreground py-4">no messages</p>
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
      {messages.map((msg) => (
        <div key={msg.id}>
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[11px] font-medium ${msg.role === 'user' ? 'text-blue-400' : 'text-emerald-400'}`}>
              {msg.role === 'user' ? 'customer' : 'assistant'}
            </span>
            {msg.role === 'assistant' && msg.sender && (
              <span className={`text-[10px] px-1 rounded ${
                msg.sender === 'human'
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {msg.sender === 'human' ? 'dealer' : 'ai'}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground tabular-nums">{timeStr(msg.created_at)}</span>
          </div>
          <p className="text-xs text-foreground whitespace-pre-wrap pl-2 border-l-2 border-border">{msg.content}</p>
        </div>
      ))}
    </div>
  )
}
