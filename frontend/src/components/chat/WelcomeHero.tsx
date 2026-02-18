interface WelcomeHeroProps {
  onSuggestionClick: (question: string) => void
}

const suggestions = [
  "Show me electric vehicles",
  "What's available under CHF 60,000?",
  "Compare the 3 Series vs 4 Series",
  "Which SUVs do you have?",
]

export function WelcomeHero({ onSuggestionClick }: WelcomeHeroProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* BMW Roundel */}
      <div className="relative mb-8">
        <div className="w-20 h-20 rounded-full border-[2.5px] border-foreground/10 flex items-center justify-center">
          <svg viewBox="0 0 96 96" className="w-16 h-16" fill="none">
            <circle cx="48" cy="48" r="46" stroke="currentColor" strokeWidth="1.5" className="text-foreground/15" />
            <circle cx="48" cy="48" r="36" stroke="currentColor" strokeWidth="0.75" className="text-foreground/10" />
            <text x="48" y="54" textAnchor="middle" className="fill-foreground/80 text-[13px] font-semibold tracking-[0.15em]" style={{ fontFamily: 'system-ui' }}>BMW</text>
          </svg>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-[1.75rem] sm:text-[2rem] font-semibold tracking-[-0.03em] text-foreground mb-2">
        Sales Advisor
      </h1>
      <p className="text-[15px] text-foreground/45 text-center max-w-sm mb-10 leading-relaxed">
        Your personal BMW consultant for the Swiss market.
        Ask about vehicles, pricing, or book a test drive.
      </p>

      {/* Suggestion chips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-md">
        {suggestions.map((question) => (
          <button
            key={question}
            onClick={() => onSuggestionClick(question)}
            className="group relative px-5 py-3.5 rounded-2xl text-[13.5px] text-foreground/70 bg-foreground/[0.03] border border-foreground/[0.06] hover:border-foreground/[0.12] hover:bg-foreground/[0.05] transition-all duration-200 text-left active:scale-[0.98]"
          >
            {question}
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/20 group-hover:text-foreground/40 transition-colors text-sm">
              &rarr;
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
