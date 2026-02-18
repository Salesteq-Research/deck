export function AssistantAvatar() {
  return (
    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-foreground/[0.07] flex items-center justify-center">
      <svg viewBox="0 0 48 48" className="w-4 h-4" fill="none">
        <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" className="text-foreground/30" />
        <text x="24" y="28" textAnchor="middle" className="fill-foreground/50 text-[10px] font-semibold" style={{ fontFamily: 'system-ui' }}>B</text>
      </svg>
    </div>
  )
}
