function getScoreColor(score: number) {
  if (score >= 70) return 'text-emerald-400'
  if (score >= 40) return 'text-amber-400'
  return 'text-muted-foreground'
}

export function ScoreBadge({ score }: { score: number }) {
  return (
    <span className={`text-xs font-bold tabular-nums ${getScoreColor(score)}`}>
      {score}
    </span>
  )
}
