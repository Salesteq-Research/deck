import { useState, useEffect } from 'react'
import { Mail, Phone, User, Car, MessageSquare, Bot } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { ScoreBadge } from './ScoreBadge'
import { ConversationTranscript } from './ConversationTranscript'
import { EmailDialog } from './EmailDialog'
import { getLead, updateLead, getConversations, getConversation, getAiInsight } from '@/lib/api'
import type { Lead, LeadStatus, ConversationDetail } from '@/lib/types'

const statusOptions: LeadStatus[] = ['new', 'contacted', 'qualified', 'converted', 'lost']

export function LeadDetailPanel({ leadId, onUpdate }: { leadId: number; onUpdate?: () => void }) {
  const [lead, setLead] = useState<Lead | null>(null)
  const [conversation, setConversation] = useState<ConversationDetail | null>(null)
  const [emailOpen, setEmailOpen] = useState(false)
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  useEffect(() => {
    setAiInsight(null)
    getLead(leadId).then(setLead).catch(() => {})
    getConversations().then((convs) => {
      const match = convs.find((c) => c.lead_id === leadId)
      if (match) {
        getConversation(match.id).then(setConversation).catch(() => {})
      }
    }).catch(() => {})

    // Get AI insight for this lead
    setAiLoading(true)
    getAiInsight('lead', leadId)
      .then((res) => setAiInsight(res.insight))
      .catch(() => {})
      .finally(() => setAiLoading(false))
  }, [leadId])

  if (!lead) return <div className="p-5 text-xs text-muted-foreground">loading...</div>

  const handleStatusChange = async (status: LeadStatus) => {
    await updateLead(lead.id, { status })
    setLead({ ...lead, status })
    onUpdate?.()
  }

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {lead.customer_name || `lead #${lead.id}`}
          </h3>
          <p className="text-[11px] text-muted-foreground">session:{lead.session_id.slice(0, 12)}</p>
        </div>
        <div className="flex items-center gap-2">
          <ScoreBadge score={lead.score} />
          <StatusBadge status={lead.status} />
        </div>
      </div>

      {/* AI Suggestion */}
      <div className="border border-primary/20 rounded-md bg-primary/5">
        <div className="px-3 py-1.5 border-b border-primary/10 flex items-center gap-1.5">
          <Bot className="h-3 w-3 text-primary" />
          <span className="text-[10px] text-primary font-medium">agent suggestion</span>
        </div>
        <div className="px-3 py-2">
          {aiLoading ? (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="inline-block w-1 h-1 rounded-full bg-primary animate-pulse" />
              analyzing lead...
            </div>
          ) : aiInsight ? (
            <p className="text-[11px] text-foreground leading-relaxed whitespace-pre-wrap">{aiInsight}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">no suggestion</p>
          )}
        </div>
      </div>

      {/* Contact */}
      <div className="space-y-1.5">
        {lead.customer_email && (
          <div className="flex items-center gap-2 text-xs text-foreground">
            <Mail className="h-3 w-3 text-muted-foreground" /> {lead.customer_email}
          </div>
        )}
        {lead.customer_phone && (
          <div className="flex items-center gap-2 text-xs text-foreground">
            <Phone className="h-3 w-3 text-muted-foreground" /> {lead.customer_phone}
          </div>
        )}
        {!lead.customer_email && !lead.customer_phone && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" /> no contact info
          </p>
        )}
      </div>

      {/* Vehicles */}
      {lead.interested_vehicles.length > 0 && (
        <div>
          <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
            <Car className="h-3 w-3" /> vehicles ({lead.interested_vehicles.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {lead.interested_vehicles.map((vin) => (
              <span key={vin} className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
                {vin.slice(0, 11)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {lead.summary && (
        <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">{lead.summary}</p>
      )}

      {/* Status */}
      <div>
        <div className="text-[11px] text-muted-foreground mb-1">status</div>
        <div className="flex flex-wrap gap-1">
          {statusOptions.map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
                s === lead.status
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground border border-border'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div>
        <button
          onClick={() => setEmailOpen(true)}
          disabled={!lead.customer_email}
          className="text-xs text-primary hover:underline disabled:opacity-30 disabled:no-underline flex items-center gap-1"
        >
          <Mail className="h-3 w-3" /> send email
        </button>
      </div>

      {/* Transcript */}
      {conversation && conversation.messages.length > 0 && (
        <div>
          <div className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> transcript ({conversation.message_count} msgs)
          </div>
          <ConversationTranscript messages={conversation.messages} />
        </div>
      )}

      <EmailDialog lead={lead} open={emailOpen} onOpenChange={setEmailOpen} />
    </div>
  )
}
