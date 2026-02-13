import type { LeadStatus } from '@/lib/types'

const statusConfig: Record<LeadStatus, { label: string; className: string }> = {
  new: { label: 'new', className: 'text-blue-400 bg-blue-400/10' },
  contacted: { label: 'contacted', className: 'text-amber-400 bg-amber-400/10' },
  qualified: { label: 'qualified', className: 'text-purple-400 bg-purple-400/10' },
  converted: { label: 'converted', className: 'text-emerald-400 bg-emerald-400/10' },
  lost: { label: 'lost', className: 'text-red-400 bg-red-400/10' },
}

export function StatusBadge({ status }: { status: LeadStatus }) {
  const config = statusConfig[status] || statusConfig.new
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${config.className}`}>
      {config.label}
    </span>
  )
}
