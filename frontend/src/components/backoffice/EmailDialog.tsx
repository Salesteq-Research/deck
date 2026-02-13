import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { sendEmail } from '@/lib/api'
import type { Lead } from '@/lib/types'

interface EmailDialogProps {
  lead: Lead
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EmailDialog({ lead, open, onOpenChange }: EmailDialogProps) {
  const [subject, setSubject] = useState(`Follow-up on your BMW interest`)
  const [body, setBody] = useState(
    `Hello${lead.customer_name ? ` ${lead.customer_name}` : ''},\n\nThank you for your interest in our BMW vehicles. I'd love to help you find the perfect car.\n\nBest regards,\nYour BMW Sales Team`
  )
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const toEmail = lead.customer_email || ''

  const handleSend = async () => {
    if (!toEmail) return
    setSending(true)
    try {
      await sendEmail({ lead_id: lead.id, subject, body, to_email: toEmail })
      setSent(true)
      setTimeout(() => {
        onOpenChange(false)
        setSent(false)
      }, 1500)
    } catch {
      // handled silently
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="backoffice bg-card border-border max-w-lg font-mono text-[13px]">
        <DialogHeader>
          <DialogTitle className="text-foreground text-sm">send_email</DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            to: {toEmail || 'no email on file'}
          </DialogDescription>
        </DialogHeader>
        {sent ? (
          <div className="py-6 text-center text-emerald-400 text-xs">sent successfully</div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-muted-foreground">to</label>
              <input
                className="w-full mt-1 rounded-md border border-border bg-secondary px-3 py-2 text-xs text-foreground outline-none"
                value={toEmail}
                disabled
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">subject</label>
              <input
                className="w-full mt-1 rounded-md border border-border bg-secondary px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">body</label>
              <textarea
                className="w-full mt-1 rounded-md border border-border bg-secondary px-3 py-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary min-h-32 resize-y"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </div>
        )}
        {!sent && (
          <DialogFooter className="gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !toEmail}
              className="text-xs text-primary hover:underline disabled:opacity-30"
            >
              {sending ? 'sending...' : 'send'}
            </button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
