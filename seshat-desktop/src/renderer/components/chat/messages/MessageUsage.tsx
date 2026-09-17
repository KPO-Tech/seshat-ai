import type { TokenUsage } from '../lib/chatTypes'

type MessageUsageProps = {
  usage?: TokenUsage
  turnNumber?: number
  stopReason?: string
  contextWindow?: number
}

export function MessageUsage({ usage, turnNumber, stopReason, contextWindow }: MessageUsageProps) {
  const input = usage?.input_tokens ?? 0
  const output = usage?.output_tokens ?? 0
  const total = usage?.total_tokens ?? input + output
  // OpenAI and Anthropic responses report a cache hit under different
  // field names (cached_tokens vs. cache_read_input_tokens) - never both at
  // once, so summing is safe.
  const cached = (usage?.cached_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0)
  const cacheWrite = usage?.cache_creation_input_tokens ?? 0
  const reasoning = usage?.reasoning_tokens ?? 0
  // Context window is the model's static capacity (from its provider
  // catalog entry), not per-turn telemetry - the backend doesn't send a
  // "tokens remaining" figure, so this approximates it from the turn's own
  // input token count against that capacity.
  const contextPercent = contextWindow && input > 0 ? Math.round((input / contextWindow) * 100) : null
  const chips = [
    turnNumber ? `Turn ${turnNumber}` : null,
    total > 0 ? `${formatCount(total)} tokens` : null,
    input > 0 ? `${formatCount(input)} in` : null,
    output > 0 ? `${formatCount(output)} out` : null,
    reasoning > 0 ? `${formatCount(reasoning)} reasoning` : null,
    cached > 0 ? `${formatCount(cached)} cached` : null,
    cacheWrite > 0 ? `${formatCount(cacheWrite)} cache write` : null,
    contextPercent !== null ? `${contextPercent}% of ${formatCount(contextWindow!)} context` : null,
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
