import { Car } from 'lucide-react'

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
    <div className="flex flex-col items-center justify-center py-10 sm:py-16 px-2">
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 sm:mb-6">
        <Car className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
      </div>
      <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-2">BMW Sales Advisor</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-6 sm:mb-8 px-2">
        Your personal BMW consultant. Ask me about available vehicles, pricing, features, and find your perfect BMW.
      </p>
      <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center gap-2 w-full max-w-lg px-2">
        {suggestions.map((question) => (
          <button
            key={question}
            onClick={() => onSuggestionClick(question)}
            className="px-4 py-2.5 sm:py-2 rounded-full border border-border text-sm text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors active:scale-95"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  )
}
