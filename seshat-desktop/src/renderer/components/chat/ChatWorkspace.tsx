import type { User } from '@renderer/api/types'
import { ChatInput } from './ChatInput'
import { MessageList } from './MessageList'
import { useChatWorkspace } from './useChatWorkspace'

export function ChatWorkspace({ user }: { user: User }) {
  const { activeSession, streaming, isStreaming, loading, error, send, stop } = useChatWorkspace()
  const displayName = user.display_name || user.email
  const isEmpty = !activeSession || activeSession.messages.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between px-7">
        <button type="button" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[15px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
          Seshat
          <ChevronDownIcon />
        </button>
        {isStreaming && (
          <button
            type="button"
            onClick={() => void stop()}
            className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
          >
            Stop
          </button>
        )}
      </header>

      {isEmpty ? (
        <section className="flex flex-1 items-center justify-center overflow-hidden px-8 pb-14 pt-2">
          <div className="w-full max-w-[960px]">
            <div className="text-center">
              <p className="mb-3 text-[13px] font-semibold text-[var(--text-muted)]">Signed in as {displayName}</p>
              <h1 className="font-serif text-[52px] font-normal leading-[1.08] tracking-normal text-[var(--text-primary)]">
                Where should we begin?
              </h1>
            </div>
            <div className="mx-auto mt-8 max-w-[900px]">
              <ChatInput disabled={isStreaming || loading} onSend={(text) => void send(text)} />
              {error && <div className="mt-4 rounded-lg border border-[var(--accent-danger)]/40 bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">{error}</div>}
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <MessageList messages={activeSession.messages} streaming={streaming} isStreaming={isStreaming} />
          </section>
          <footer className="shrink-0 border-t border-transparent px-8 pb-5">
            <div className="mx-auto max-w-[820px]">
              {error && <div className="mb-3 rounded-lg border border-[var(--accent-danger)]/40 bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">{error}</div>}
              <ChatInput compact disabled={isStreaming || loading} onSend={(text) => void send(text)} />
            </div>
          </footer>
        </>
      )}
    </div>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 5.5 3 3 3-3" />
    </svg>
  )
}
