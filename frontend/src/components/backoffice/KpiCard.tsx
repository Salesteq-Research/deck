interface KpiCardProps {
  label: string
  value: string | number
  sub?: string
}

export function KpiCard({ label, value, sub }: KpiCardProps) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3.5">
      <p className="text-[11px] text-white/30 mb-1.5 tracking-wide">{label}</p>
      <p className="text-[22px] font-semibold text-white/90 tabular-nums tracking-[-0.02em]">
        {value}
        {sub && <span className="text-[13px] font-normal text-white/25 ml-0.5">{sub}</span>}
      </p>
    </div>
  )
}
