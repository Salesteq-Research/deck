export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-typing-dot [animation-delay:0ms]" />
      <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-typing-dot [animation-delay:150ms]" />
      <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-typing-dot [animation-delay:300ms]" />
    </div>
  )
}
