interface KpiCardProps {
  label: string
  value: string | number
  sub?: string
}

export function KpiCard({ label, value, sub }: KpiCardProps) {
  return (
    <div className="border border-border rounded-md bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground tabular-nums">
        {value}
        {sub && <span className="text-sm font-normal text-muted-foreground ml-0.5">{sub}</span>}
      </p>
    </div>
  )
}
