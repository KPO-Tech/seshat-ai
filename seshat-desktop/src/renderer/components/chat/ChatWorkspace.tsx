import { useEffect, useRef } from 'react'
import type { User } from '@renderer/api/types'
import { useBrowserStore } from '@renderer/stores/browser'
import { CHAT_MIN_WIDTH } from '@renderer/stores/rightPanel'
import { useTerminalStore } from '@renderer/stores/terminal'
import { useTaskStore } from '@renderer/stores/tasks'
import { useAgentStore } from '@renderer/stores/agents'
import { AgentProfileSelect } from './AgentProfileSelect'
import { ChatInput } from './ChatInput'
import { ChatTopBar } from './ChatTopBar'
import { RightPanelHost } from './RightPanelHost'
import { useAgentProfiles } from './lib/useAgentProfiles'
import { useChatModels } from './lib/useChatModels'
import { useChatWorkspace } from './lib/useChatWorkspace'
import { MessageList } from './messages/MessageList'
import { FilePreviewOverlay } from './attachments/FilePreviewOverlay'

export function ChatWorkspace({ user }: { user: User }) {
  const { activeSession, streaming, isStreaming, loading, error, executionMode, permissionMode, compactionNotice, send, stop, setExecutionMode, setPermissionMode } = useChatWorkspace()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const displayName = user.display_name || user.email
  const isEmpty = !activeSession || activeSession.messages.length === 0
  const models = useChatModels(activeSession?.modelId)
  const selectedModel = models.selected
  const agentProfiles = useAgentProfiles()
  const sendOptions = selectedModel || agentProfiles.selected
    ? { providerSettingId: selectedModel?.providerSettingId, modelId: selectedModel?.modelId, agentSlug: agentProfiles.selected?.slug }
    : undefined
  const ingestBrowserBlocks = useBrowserStore((state) => state.ingestBlocks)
  const ingestTaskBlocks = useTaskStore((state) => state.ingestBlocks)
  const ingestAgentBlocks = useAgentStore((state) => state.ingestBlocks)
  const attachTerminalSession = useTerminalStore((state) => state.attachSession)

  useEffect(() => {
    if (!activeSession?.id) return
    void attachTerminalSession(activeSession.id)
  }, [activeSession?.id, attachTerminalSession])

  useEffect(() => {
    if (!activeSession?.id) return
    ingestBrowserBlocks(activeSession.id, activeSession.messages.flatMap((message) => message.content))
    ingestTaskBlocks(activeSession.id, activeSession.messages.flatMap((message) => message.content))
    ingestAgentBlocks(activeSession.id, activeSession.messages.flatMap((message) => message.content))
  }, [activeSession?.id, activeSession?.messages, ingestAgentBlocks, ingestBrowserBlocks, ingestTaskBlocks])

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" style={{ minWidth: CHAT_MIN_WIDTH }}>
      <header className="flex h-14 shrink-0 items-center justify-between px-7">
        <AgentProfileSelect
          choices={agentProfiles.choices}
          value={agentProfiles.selectedSlug}
          loading={agentProfiles.loading}
          disabled={loading || isStreaming}
          onChange={agentProfiles.setSelectedSlug}
        />
        <ChatTopBar
          executionMode={executionMode}
          onExecutionModeChange={(mode) => void setExecutionMode(mode)}
          permissionMode={permissionMode}
          onPermissionModeChange={(mode) => void setPermissionMode(mode)}
          disabled={loading || isStreaming}
          sessionId={activeSession?.id}
        />
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
                modelChoices={models.choices}
                selectedModelId={models.selectedId}
                modelsLoading={models.loading}
                streaming={isStreaming}
                onModelChange={models.setSelectedId}
                onSend={(text, files) => send(text, sendOptions, files)}
                onStop={() => void stop()}
              />
              {error && <div className="mt-4 rounded-lg border border-[var(--accent-danger)]/40 bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">{error}</div>}
            </div>
          </div>
        </section>
      ) : (
        <>
          <section ref={scrollContainerRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            <MessageList
              containerRef={scrollContainerRef}
              sessionId={activeSession.id}
              messages={activeSession.messages}
              streaming={streaming}
              isStreaming={isStreaming}
              onRetry={(message) => {
                const text = message.content
                  .filter((block) => block.type === 'text')
                  .map((block) => block.text)
                  .join('\n\n')
                void send(text, sendOptions, [], message.metadata?.attachments ?? [])
              }}
              contextWindow={selectedModel?.contextWindow}
            />
          </section>
          <footer className="shrink-0 border-t border-transparent px-8 pb-5 pt-4">
            <div className="mx-auto max-w-[820px]">
              {compactionNotice && (
                <div className="mb-3 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--text-secondary)]">
                  Compacted conversation. Saved {(compactionNotice.preTokens - compactionNotice.postTokens).toLocaleString()} tokens ({compactionNotice.preTokens.toLocaleString()} to {compactionNotice.postTokens.toLocaleString()})
                </div>
              )}
              {error && <div className="mb-3 rounded-lg border border-[var(--accent-danger)]/40 bg-[var(--surface-panel)] px-4 py-3 text-[13px] font-semibold text-[var(--accent-danger)]">{error}</div>}
              <ChatInput
                compact
                modelChoices={models.choices}
                selectedModelId={models.selectedId}
                modelsLoading={models.loading}
                streaming={isStreaming}
                onModelChange={models.setSelectedId}
                onSend={(text, files) => send(text, sendOptions, files)}
                onStop={() => void stop()}
              />
            </div>
          </footer>
        </>
      )}
      <FilePreviewOverlay />
    </div>
    {activeSession && <RightPanelHost sessionId={activeSession.id} />}
    </div>
  )
}
