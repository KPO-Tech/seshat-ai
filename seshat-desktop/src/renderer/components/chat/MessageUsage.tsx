import type { TokenUsage } from './chatTypes'

type MessageUsageProps = {
  usage?: TokenUsage
  turnNumber?: number
  stopReason?: string
}

export function MessageUsage({ usage, turnNumber, stopReason }: MessageUsageProps) {
  const input = usage?.input_tokens ?? 0
  const output = usage?.output_tokens ?? 0
  const total = usage?.total_tokens ?? input + output
  const chips = [
    turnNumber ? `Turn ${turnNumber}` : null,
    total > 0 ? `${formatCount(total)} tokens` : null,
    input > 0 ? `${formatCount(input)} in` : null,
    output > 0 ? `${formatCount(output)} out` : null,
    stopReason ? humanize(stopReason) : null
  ].filter(Boolean)

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip}
          className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--text-muted)]"
        >
          {chip}
        </span>
      ))}
    </div>
  )
}

function formatCount(value: number) {
  if (value < 1000) return String(value)
  if (value < 1000000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return `${(value / 1000000).toFixed(1)}m`
}

function humanize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}
