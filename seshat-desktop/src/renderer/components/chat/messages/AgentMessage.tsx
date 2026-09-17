import type { ChatMessage } from '../lib/chatTypes'
import { MessageContentBlocks } from './MessageContentBlocks'
import { MessageUsage } from './MessageUsage'
import { AttachmentList } from '../attachments/AttachmentList'
import { CopyButton } from './MessageActions'

type AgentMessageProps = {
  sessionId?: string
  message: ChatMessage
  live?: boolean
}

export function AgentMessage({ sessionId, message, live = false }: AgentMessageProps) {
  const failed = message.status === 'error'
  const stopped = message.status === 'stopped'
  const hasContent = message.content.some((block) => {
    if (block.type === 'text') return block.text.trim()
    if (block.type === 'thinking') return block.thinking.trim()
    if (block.type === 'tool_use') return true
    return false
  })
  const hasUsage = Boolean(message.usage || message.turn_number || message.stop_reason)
  const attachments = message.metadata?.attachments ?? []
  const hasToolUse = message.content.some((block) => block.type === 'tool_use')
  const copyText = message.content.map((block) => block.type === 'text' ? block.text : '').filter(Boolean).join('\n\n')
  const canCopy = !live && !hasToolUse && Boolean(copyText)

  if (!live && !failed && !hasContent && !hasUsage && attachments.length === 0) return null

  return (
    <article className="group flex w-full flex-col gap-2">
      {attachments.length > 0 && <AttachmentList attachments={attachments} />}
      <div className={failed
        ? 'rounded-xl border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/5 px-4 py-3 text-[13px] font-semibold leading-6 text-[var(--accent-danger)]'
        : 'min-w-0 text-[14px] leading-7 text-[var(--text-primary)]'
      }>
        {hasContent ? <MessageContentBlocks sessionId={sessionId} blocks={message.content} live={live} /> : attachments.length === 0 ? <AgentGenerating /> : null}
      </div>
      {stopped && <StoppedIndicator />}
      {canCopy && (
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <CopyButton text={copyText} />
        </div>
      )}
      <MessageUsage usage={message.usage} turnNumber={message.turn_number} stopReason={message.stop_reason} />
    </article>
  )
}

function StoppedIndicator() {
  return (
    <div className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-muted)]">
      <span className="size-1.5 rounded-full bg-[var(--text-muted)]" />
      <span>Stopped</span>
    </div>
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
