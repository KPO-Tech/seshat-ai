import type { ChatMessage } from '../lib/chatTypes'
import { MessageContentBlocks } from './MessageContentBlocks'

export function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <article className="group flex w-full justify-end">
      <div className="flex max-w-[78%] flex-col items-end">
        <div className="rounded-[16px] rounded-br-[5px] border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-3 text-[14px] leading-6 text-[var(--text-primary)] shadow-sm">
          <MessageContentBlocks blocks={message.content} />
        </div>
        <div className="mt-1 text-[11px] font-medium text-[var(--text-faint)] opacity-0 transition-opacity group-hover:opacity-100">
          You
        </div>
      </div>
    </article>
  )
}
