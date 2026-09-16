import { useEffect } from 'react'
import type { User } from '@renderer/api/types'
import { useTerminalStore } from '@renderer/stores/terminal'
import type { ChatExecutionMode } from './lib/chatTypes'
import { ChatInput } from './ChatInput'
import { useChatModels } from './lib/useChatModels'
import { useChatWorkspace } from './lib/useChatWorkspace'
import { MessageList } from './messages/MessageList'

export function ChatWorkspace({ user }: { user: User }) {
  const { activeSession, streaming, isStreaming, loading, error, executionMode, send, stop, setExecutionMode } = useChatWorkspace()
  const displayName = user.display_name || user.email
  const isEmpty = !activeSession || activeSession.messages.length === 0
  const models = useChatModels(activeSession?.modelId)
  const selectedModel = models.selected
  const attachTerminalSession = useTerminalStore((state) => state.attachSession)

  useEffect(() => {
    if (!activeSession?.id) return
    void attachTerminalSession(activeSession.id)
  }, [activeSession?.id, attachTerminalSession])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between px-7">
        {/* Future workflow selector: Seshat should choose the agent runtime flow, e.g. Plan, Execute, Tools, or custom workflows. */}
        <button type="button" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[15px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
          Seshat
          <ChevronDownIcon />
        </button>
        <div className="flex items-center gap-2">
          <ExecutionModeToggle mode={executionMode} disabled={loading || isStreaming} onChange={(mode) => void setExecutionMode(mode)} />
          {isStreaming && (
            <button
              type="button"
              onClick={() => void stop()}
              className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
            >
              Stop
            </button>
          )}
        </div>
      </header>

      {isEmpty ? (
        <section className="flex flex-1 items-start justify-center overflow-hidden px-8 pb-14 pt-[clamp(72px,18vh,160px)]">
          <div className="w-full">
            <div className="text-center">
              <div className="mb-3 flex items-center justify-center gap-2 text-[13px] font-semibold text-[var(--text-muted)]">
                <span className="size-1.5 rounded-full bg-[var(--accent-primary)] shadow-[0_0_16px_var(--accent-primary)]" />
                <span>Signed in as {displayName}</span>
              </div>
              <h1 className="font-serif text-[clamp(42px,4.1vw,58px)] font-normal leading-[1.08] tracking-normal text-[var(--text-primary)]">
                Where should we <span className="text-[var(--accent-primary)]">begin?</span>
              </h1>
            </div>
            <div className="mx-auto mt-8 w-[78%] max-w-[900px] min-w-0">
              <ChatInput
                disabled={isStreaming || loading}
                modelChoices={models.choices}
                selectedModelId={models.selectedId}
                modelsLoading={models.loading}
                onModelChange={models.setSelectedId}
                onSend={(text) => void send(text, selectedModel ? { providerSettingId: selectedModel.providerSettingId, modelId: selectedModel.modelId } : undefined)}
              />
              {error && <div className="mt-4 rounded-lg border border-[var(--accent-danger)]/40 bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">{error}</div>}
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <MessageList sessionId={activeSession.id} messages={activeSession.messages} streaming={streaming} isStreaming={isStreaming} />
          </section>
          <footer className="shrink-0 border-t border-transparent px-8 pb-5">
            <div className="mx-auto max-w-[820px]">
              {error && <div className="mb-3 rounded-lg border border-[var(--accent-danger)]/40 bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">{error}</div>}
              <ChatInput
                compact
                disabled={isStreaming || loading}
                modelChoices={models.choices}
                selectedModelId={models.selectedId}
                modelsLoading={models.loading}
                onModelChange={models.setSelectedId}
                onSend={(text) => void send(text, selectedModel ? { providerSettingId: selectedModel.providerSettingId, modelId: selectedModel.modelId } : undefined)}
              />
            </div>
          </footer>
        </>
      )}
    </div>
  )
}

function ExecutionModeToggle({
  mode,
  disabled,
  onChange
}: {
  mode: ChatExecutionMode
  disabled?: boolean
  onChange: (mode: ChatExecutionMode) => void
}) {
  const nextMode = mode === 'plan' ? 'execute' : 'plan'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(nextMode)}
      className="flex h-8 items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 text-[12px] font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
      title={mode === 'plan' ? 'Plan mode' : 'Execute mode'}
    >
      <span className={`size-1.5 rounded-full ${mode === 'plan' ? 'bg-[var(--accent-primary)] shadow-[0_0_12px_var(--accent-primary)]' : 'bg-[var(--text-muted)]'}`} />
      {mode === 'plan' ? 'Plan' : 'Execute'}
    </button>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 5.5 3 3 3-3" />
    </svg>
  )
}
