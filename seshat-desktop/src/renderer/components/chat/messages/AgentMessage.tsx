import type { ChatMessage } from '../lib/chatTypes'
import { MessageContentBlocks } from './MessageContentBlocks'
import { MessageUsage } from './MessageUsage'

type AgentMessageProps = {
  sessionId?: string
  message: ChatMessage
  live?: boolean
}

export function AgentMessage({ sessionId, message, live = false }: AgentMessageProps) {
  const failed = message.status === 'error'
  const hasContent = message.content.some((block) => {
    if (block.type === 'text') return block.text.trim()
    if (block.type === 'thinking') return block.thinking.trim()
    if (block.type === 'tool_use') return true
    return false
  })
  const hasUsage = Boolean(message.usage || message.turn_number || message.stop_reason)

  if (!live && !failed && !hasContent && !hasUsage) return null

  return (
    <article className="group flex w-full flex-col gap-2">
      <div className={failed
        ? 'rounded-xl border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/5 px-4 py-3 text-[13px] font-semibold leading-6 text-[var(--accent-danger)]'
        : 'min-w-0 text-[14px] leading-7 text-[var(--text-primary)]'
      }>
        {hasContent ? <MessageContentBlocks sessionId={sessionId} blocks={message.content} live={live} /> : <AgentGenerating />}
      </div>
      <MessageUsage usage={message.usage} turnNumber={message.turn_number} stopReason={message.stop_reason} />
    </article>
  )
}

function AgentGenerating() {
  return (
    <div className="flex h-7 items-center gap-2 text-[13px] font-medium text-[var(--text-muted)]">
      <AgentSpinner />
      <span>Thinking</span>
    </div>
  )
}

function AgentSpinner() {
  return (
    <span className="relative flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
      <span className="absolute size-4 animate-ping rounded-full bg-[var(--accent-primary)]/25" />
      <span className="absolute size-4 animate-spin rounded-full border border-[var(--border-soft)] border-t-[var(--accent-primary)]" />
      <span className="size-1.5 rounded-full bg-[var(--accent-primary)] shadow-[0_0_12px_var(--accent-primary)]" />
    </span>
  )
}
