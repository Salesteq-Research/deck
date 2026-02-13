import { useEffect, useState } from 'react'
import { getActivity } from '@/lib/api'
import type { ActivityItem } from '@/lib/types'

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

const eventPrefix: Record<string, string> = {
  new_lead: '+',
  message: '>',
  vehicle_shown: '*',
  email_sent: '@',
  status_change: '~',
}

export function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([])

  useEffect(() => {
    const load = () => getActivity(30).then(setItems).catch(() => {})
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [])

  if (items.length === 0) {
    return (
      <div className="border border-border rounded-md bg-card p-4 text-xs text-muted-foreground">
        no activity yet
      </div>
    )
  }

  return (
    <div className="border border-border rounded-md bg-card">
      <div className="px-4 py-2.5 border-b border-border">
        <span className="text-xs text-muted-foreground">activity_log</span>
      </div>
      <div className="max-h-80 overflow-y-auto">
        {items.map((item) => {
          const prefix = eventPrefix[item.event_type] || '·'
          return (
            <div key={item.id} className="flex items-start gap-2 px-4 py-2 border-b border-border last:border-0 text-xs">
              <span className="text-primary shrink-0 w-3 text-center">{prefix}</span>
              <div className="min-w-0 flex-1">
                <span className="text-foreground">{item.title}</span>
                {item.description && (
                  <span className="text-muted-foreground ml-1.5">— {item.description}</span>
                )}
              </div>
              <span className="shrink-0 text-muted-foreground tabular-nums">{timeAgo(item.created_at)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
