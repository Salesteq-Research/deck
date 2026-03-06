export function TypingIndicator({ dotClassName }: { dotClassName?: string }) {
  const dot = dotClassName || 'bg-foreground/70'
  return (
    <div className="flex items-center gap-1.5 px-1 py-1">
      <span className={`w-2 h-2 rounded-full ${dot} animate-typing-dot [animation-delay:0ms]`} />
      <span className={`w-2 h-2 rounded-full ${dot} animate-typing-dot [animation-delay:200ms]`} />
      <span className={`w-2 h-2 rounded-full ${dot} animate-typing-dot [animation-delay:400ms]`} />
    </div>
  )
}
