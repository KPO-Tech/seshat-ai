import type { ChatMessage } from './chatTypes'
import { MessageContentBlocks } from './MessageContentBlocks'
import { MessageUsage } from './MessageUsage'

type AgentMessageProps = {
  message: ChatMessage
  live?: boolean
}

export function AgentMessage({ message, live = false }: AgentMessageProps) {
  const failed = message.status === 'error'
  const hasContent = message.content.some((block) => {
    if (block.type === 'text') return block.text.trim()
    if (block.type === 'thinking') return block.thinking.trim()
    if (block.type === 'tool_use') return true
    return false
  })

  return (
    <article className="group flex w-full flex-col gap-2">
      <div className="flex min-h-7 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[11px] font-bold text-[var(--accent-primary)]">
            S
          </span>
          <span className="truncate text-[14px] font-semibold text-[var(--text-primary)]">Seshat</span>
          <AgentStatus live={live} failed={failed} />
        </div>
        <MessageUsage usage={message.usage} turnNumber={message.turn_number} stopReason={message.stop_reason} />
      </div>

      <div className={failed
        ? 'rounded-xl border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/5 px-4 py-3 text-[13px] font-semibold leading-6 text-[var(--accent-danger)]'
        : 'min-w-0 text-[14px] leading-7 text-[var(--text-primary)]'
      }>
        {hasContent ? <MessageContentBlocks blocks={message.content} /> : <EmptyAgentState live={live} />}
      </div>
    </article>
  )
}

function AgentStatus({ live, failed }: { live: boolean; failed: boolean }) {
  if (failed) {
    return <span className="rounded-full bg-[var(--accent-danger)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-danger)]">Failed</span>
  }
  if (!live) return null
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-primary)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-primary)]">
      <span className="size-1.5 animate-pulse rounded-full bg-[var(--accent-primary)]" />
      Working
    </span>
  )
}

function EmptyAgentState({ live }: { live: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-[var(--text-muted)]">
      {live && <span className="size-2 animate-pulse rounded-full bg-[var(--accent-primary)]" />}
      {live ? 'Seshat is working...' : 'No response yet.'}
    </span>
  )
}
