import type { ChatMessage } from '../lib/chatTypes'
import { MessageContentBlocks } from './MessageContentBlocks'
import { AttachmentList } from '../attachments/AttachmentList'
import { CopyButton } from './MessageActions'

export function UserMessage({ message, onRetry }: { message: ChatMessage; onRetry?: (message: ChatMessage) => void }) {
  const attachments = message.metadata?.attachments ?? []
  const hasText = message.content.length > 0
  const failed = message.status === 'error'
  const sending = message.status === 'sending'
  const copyText = message.content.map((block) => block.type === 'text' ? block.text : '').filter(Boolean).join('\n\n')

  return (
    <article className="group flex w-full justify-end">
      <div className={`flex max-w-[90%] flex-col items-end gap-2 transition-opacity ${sending ? 'opacity-55' : ''}`}>
        {attachments.length > 0 && <AttachmentList attachments={attachments} align="end" />}
        {hasText && <div className={`rounded-[16px] rounded-br-[5px] border px-4 py-3 text-[14px] leading-6 text-[var(--text-primary)] shadow-sm ${failed ? 'border-[var(--accent-danger)]/45 bg-[var(--accent-danger)]/5' : 'border-[var(--border-soft)] bg-[var(--surface-panel)]'}`}>
          <MessageContentBlocks blocks={message.content} />
        </div>}
        {failed && (
          <button
            type="button"
            onClick={() => onRetry?.(message)}
            className="text-[12px] font-semibold text-[var(--accent-danger)] hover:underline"
          >
            Failed to send. Retry
          </button>
        )}
        <div className="mt-1 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          {copyText && <CopyButton text={copyText} />}
          <span className="text-[11px] font-medium text-[var(--text-faint)]">You</span>
        </div>
      </div>
    </article>
  )
}
