import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useParams, useNavigate } from 'react-router-dom'
import { streamingToContentBlocks, useSessionStore, EMPTY_STREAMING, DEFAULT_AGENT_STATE } from '@/stores/session'
import { useUIStore } from '@/stores/ui'
import { ChatTopBar, CHAT_TOP_BAR_CSS } from '@/components/chat/ChatTopBar'
import { ChatInput, CHAT_INPUT_CSS, type ChatAttachment } from '@/components/chat/ChatInput'
import { MessageItem, MESSAGE_ITEM_CSS, isRenderableMessage } from '@/components/chat/MessageItem'
import { PlanArtifactCard } from '@/components/chat/plan/PlanArtifactCard'
import { useChat } from '@/hooks/useChat'
import { useProviders, fetchProviderModels } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import { api } from '@/api/client'
import type { Session, ProviderModel } from '@/api/types'
import { normalizeSessionMessages } from '@/lib/chat'

export function Conversation() {
  const { id } = useParams()
  const navigate = useNavigate()
  const sessions = useSessionStore((s) => s.sessions)
  const updateSession = useSessionStore((s) => s.updateSession)
  const upsertSession = useSessionStore((s) => s.upsertSession)
  const setActive = useSessionStore((s) => s.setActive)
  const streaming = useSessionStore((s) => (id ? s.streamingBySession[id] : null) ?? EMPTY_STREAMING)
  const session = sessions.find((s) => s.id === id)
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  const closeRightPanel = useUIStore((s) => s.closeRightPanel)
  const rightPanel = useUIStore((s) => s.rightPanel)
  const permissionMode = useUIStore((s) => s.permissionMode)
  const togglePermissionMode = useUIStore((s) => s.togglePermissionMode)
  const setPermissionMode = useUIStore((s) => s.setPermissionMode)

  // Provider / model live selectors
  useProviders()
  const providers = useProvidersStore((s) => s.providers)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModel[]>>({})
  const [loadingModelsFor, setLoadingModelsFor] = useState<string | null>(null)

  // Init from session once it's available (handles direct URL navigation)
  useEffect(() => {
    if (!session) return
    if (!selectedProviderId && session.providerSettingId) setSelectedProviderId(session.providerSettingId)
    if (!selectedModelId && session.modelId) setSelectedModelId(session.modelId)
  }, [session?.providerSettingId, session?.modelId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load models when provider changes
  useEffect(() => {
    if (!selectedProviderId || modelsByProvider[selectedProviderId] !== undefined) return
    let cancelled = false
    setLoadingModelsFor(selectedProviderId)
    fetchProviderModels(selectedProviderId)
      .then((models) => { if (!cancelled) setModelsByProvider((c) => ({ ...c, [selectedProviderId]: models })) })
      .catch(() => { if (!cancelled) setModelsByProvider((c) => ({ ...c, [selectedProviderId]: [] })) })
      .finally(() => { if (!cancelled) setLoadingModelsFor((c) => (c === selectedProviderId ? null : c)) })
    return () => { cancelled = true }
  }, [selectedProviderId]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedModels = useMemo(
    () => (selectedProviderId ? (modelsByProvider[selectedProviderId] ?? []) : []),
    [selectedProviderId, modelsByProvider],
  )

  // Auto-select first model when the list loads and current selection isn't in it
  useEffect(() => {
    const loaded = selectedProviderId && Object.prototype.hasOwnProperty.call(modelsByProvider, selectedProviderId)
    if (!loaded || selectedModels.length === 0) return
    if (selectedModelId && selectedModels.some((m) => m.model_id === selectedModelId)) return
    const def = selectedModels.find((m) => m.is_default) ?? selectedModels[0]
    setSelectedModelId(def.model_id)
  }, [selectedModels, selectedProviderId, modelsByProvider]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleProviderSelect = useCallback((providerId: string) => {
    setSelectedProviderId(providerId)
    setSelectedModelId(null)
    const label = providers.find((p) => p.id === providerId)?.name
    if (id) {
      void api.patch(`/sessions/${id}`, { provider_setting_id: providerId }).catch(() => {})
      updateSession(id, { providerSettingId: providerId, providerLabel: label, modelId: undefined, modelLabel: undefined })
    }
  }, [id, providers, updateSession])

  const handleModelSelect = useCallback((modelId: string) => {
    setSelectedModelId(modelId)
    const models = selectedProviderId ? (modelsByProvider[selectedProviderId] ?? []) : []
    const label = models.find((m) => m.model_id === modelId)?.display_name || modelId
    if (id && selectedProviderId) {
      void api.patch(`/sessions/${id}`, { provider_setting_id: selectedProviderId, model_id: modelId }).catch(() => {})
      updateSession(id, { modelId, modelLabel: label })
    }
  }, [id, selectedProviderId, modelsByProvider, updateSession])

  const handlePermissionModeSelect = useCallback((mode: import('@/stores/ui').UIPermissionMode) => {
    setPermissionMode(mode)
    if (id) {
      void api.patch(`/sessions/${id}`, { permission_mode: mode }).catch(() => {})
    }
  }, [id, setPermissionMode])

  // Host-forced execution mode ("plan"/"execute"), distinct from permission
  // mode, and lives only on the ChatInput button, not the top-bar shield.
  // Optimistically updates the session's live agent state so the control
  // reflects the choice immediately, then persists it server-side; applied
  // to the SDK session ahead of the *next* turn (see seshat-backend's
  // Session.ForcePlanMode()/ClearPlanMode() wiring).
  const handleExecutionModeSelect = useCallback((mode: 'execute' | 'plan') => {
    if (!id) return
    useSessionStore.getState().updateAgentState(id, { executionMode: mode })
    void api.patch(`/sessions/${id}`, { execution_mode: mode }).catch(() => {})
  }, [id])

  const handleProjectChange = useCallback((path: string) => {
    if (!id) return
    updateSession(id, { projectPath: path })
    void api.patch(`/sessions/${id}`, { project_path: path }).catch(() => {})
  }, [id, updateSession])

  const agentState = useSessionStore((s) => (id ? s.agentStates[id] : null) ?? DEFAULT_AGENT_STATE)
  const pendingPermission = agentState.pendingPermission
  const isPlanPending = pendingPermission?.toolName === 'exit_plan_mode'
  const pendingPlan = useSessionStore((s) => (id ? s.getPendingPlan(id) : undefined))
  const pendingAskUser = streaming.find(
    (b) => b.type === 'tool_use' && b.name === 'ask_user_question' && b._prompt
  ) ?? null
  const [inputValue, setInputValue] = useState('')
  const [selectedCorpusId, setSelectedCorpusId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { sendMessage, stopMessage, isStreaming } = useChat(id || '')
  const isAtBottomRef = useRef(true)

  const monitorOpen = rightPanel.open && rightPanel.kind === 'agent'

  function toggleMonitor() {
    if (monitorOpen) {
      closeRightPanel()
    } else {
      openRightPanel({ kind: 'agent', title: 'Agent Monitor', sessionId: id, width: 380 })
    }
  }

  const handleAttachFiles = useCallback(async (files: FileList) => {
    if (!files.length || !id) return
    setUploadingAttachments(true)
    try {
      const uploaded: ChatAttachment[] = []
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append('file', file)
        const item = await api.upload<{
          id: string
          filename: string
          content_type?: string
          size?: number
          category?: 'images' | 'documents' | 'other'
          local_path?: string
        }>(`/sessions/${id}/files`, form)
        uploaded.push({
          id: item.id,
          filename: item.filename,
          content_type: item.content_type,
          size: item.size,
          category: item.category,
          local_path: item.local_path,
        })
      }
      if (uploaded.length > 0) {
        setAttachments(current => [...current, ...uploaded])
      }
    } finally {
      setUploadingAttachments(false)
    }
  }, [id])

  const handleRemoveAttachment = useCallback((fileId: string) => {
    setAttachments(current => current.filter(file => file.id !== fileId))
  }, [])

  // Auto-open Agent Monitor panel when entering a conversation
  useEffect(() => {
    if (!id) return
    if (rightPanel.open && rightPanel.kind === 'agent' && rightPanel.sessionId === id) return
    openRightPanel({ kind: 'agent', title: 'Agent Monitor', sessionId: id, width: 380 })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open the plan review panel when the agent calls exit_plan_mode
  // without a structured PlanDocument (no submit_plan): PlanEditorPanel
  // falls back to rendering the raw plan text in this case, so there's no
  // inline PlanArtifactCard to click through first.
  useEffect(() => {
    if (!id || !isPlanPending || pendingPlan) return
    if (rightPanel.open && rightPanel.kind === 'plan' && rightPanel.sessionId === id) return
    openRightPanel({ kind: 'plan', title: 'Implementation Plan', sessionId: id, width: 520 })
  }, [id, isPlanPending, pendingPlan]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll on new messages and on each streaming token
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [session?.messages, streaming])

  useEffect(() => {
    if (!session?.draftPrompt || !session.id) return
    const draft = session.draftPrompt
    updateSession(session.id, { draftPrompt: undefined })
    if (session.messages.length === 0) {
      void sendMessage(draft)
      return
    }
    setInputValue(draft)
  }, [sendMessage, session?.draftPrompt, session?.id, session?.messages.length, updateSession])

  const sessionHasData = Boolean(session && (session.messages.length > 0 || session.draftPrompt))

  useEffect(() => {
    if (!id) return
    if (sessionHasData) return

    let cancelled = false
    void api.get<Session>(`/sessions/${id}`)
      .then((detail) => {
        if (cancelled) return
        // Guard: the session may have been deleted while the fetch was in flight.
        // Don't re-add it to the store — that would create a ghost session.
        const { sessions } = useSessionStore.getState()
        if (!sessions.find((s) => s.id === detail.session_id)) return
        upsertSession({
          id: detail.session_id,
          title: detail.title || 'Untitled conversation',
          messages: normalizeSessionMessages(detail.messages ?? []),
          createdAt: new Date((detail.created_at ?? 0) * 1000).toISOString(),
          providerSettingId: detail.provider_setting_id,
          modelId: detail.model_id,
          permissionMode: detail.permission_mode,
          executionOrigin: detail.execution_origin,
          workspacePath: detail.workspace_path,
          projectPath: detail.project_path,
        })
        // Restore the session's stored permission mode into the UI.
        if (detail.permission_mode) {
          useUIStore.getState().setPermissionMode(detail.permission_mode as import('@/stores/ui').UIPermissionMode)
        }
        // upsertSession no longer sets activeId — do it explicitly here so the
        // sidebar highlights the correct session on direct-URL navigation.
        setActive(detail.session_id)
      })
      .catch(() => {
        // Leave the existing "Conversation not found" UI path if the fetch fails.
      })

    return () => {
      cancelled = true
    }
  }, [id, sessionHasData, upsertSession])

  if (!session) {
    return (
      <div className="conv-empty">
        <p>Conversation not found</p>
        <button onClick={() => navigate('/')}>Return Home</button>
      </div>
    )
  }

  const visibleMessages = session.messages.filter(isRenderableMessage)

  // Stable callbacks — identity won't change between renders so React.memo on
  // MessageItem can actually skip re-renders.
  const handlePermissionDecision = useCallback(async (toolUseId: string, approved: boolean) => {
    if (!id) return
    const current = useSessionStore.getState()
    const nextStreaming = current.getStreaming(id).map((block) => {
      if (block.type !== 'tool_use' || block.id !== toolUseId) return block
      return {
        ...block,
        _status: approved ? ('running' as const) : ('failed' as const),
        _approval: undefined,
      }
    })
    current.setStreaming(id, nextStreaming)
    const lastAssistant = [...(current.sessions.find((item) => item.id === id)?.messages ?? [])]
      .reverse()
      .find((message) => message.role === 'assistant')
    if (lastAssistant?.id) {
      current.updateMessage(id, lastAssistant.id, (message) => ({
        ...message,
        content: streamingToContentBlocks(nextStreaming),
      }))
    }
    current.updateAgentState(id, { pendingPermission: null })
    try {
      await api.post(`/permissions/${toolUseId}`, { approved, session_id: id })
    } catch {
      // The stream handler will surface the terminal error if the approval bridge is gone.
    }
  }, [id])

  const handlePlanProceed = useCallback(async (planId: string) => {
    if (!id) return
    // Mark the plan as validated in the store and on the server
    const store = useSessionStore.getState()
    const plan = store.getPlan(id, planId)
    if (plan && plan.status === 'pending') {
      try {
        const updated = await api.patch<import('@/api/types').PlanDocument>(`/plans/${planId}`, { status: 'validated' })
        store.upsertPlan(id, updated)
      } catch { /* silent — engine will still unblock via permission approval */ }
    }
    // Approve the exit_plan_mode permission gate if it's the pending one
    if (pendingPermission?.toolName === 'exit_plan_mode') {
      await handlePermissionDecision(pendingPermission.toolUseId, true)
    }
  }, [id, pendingPermission, handlePermissionDecision])

  const handlePromptSubmission = useCallback(async (promptId: string, value: unknown) => {
    if (!id) return
    const current = useSessionStore.getState()
    const nextStreaming = current.getStreaming(id).map((block) => {
      if (block.type !== 'tool_use' || block.name !== 'ask_user_question' || block._prompt?.promptId !== promptId) {
        return block
      }
      return {
        ...block,
        _prompt: undefined,
        _message: 'Waiting for the tool result…',
      }
    })
    current.setStreaming(id, nextStreaming)
    const lastAssistant = [...(current.sessions.find((item) => item.id === id)?.messages ?? [])]
      .reverse()
      .find((message) => message.role === 'assistant')
    if (lastAssistant?.id) {
      current.updateMessage(id, lastAssistant.id, (message) => ({
        ...message,
        content: streamingToContentBlocks(nextStreaming),
      }))
    }
    try {
      await api.post(`/prompts/${promptId}`, { value, session_id: id })
    } catch {
      // The stream will surface the terminal error if the bridge is gone.
    }
  }, [id])

  const onApproveTool = useCallback((toolUseId: string) => { void handlePermissionDecision(toolUseId, true) }, [handlePermissionDecision])
  const onDenyTool = useCallback((toolUseId: string) => { void handlePermissionDecision(toolUseId, false) }, [handlePermissionDecision])
  const onSubmitToolPrompt = useCallback((promptId: string, value: unknown) => { void handlePromptSubmission(promptId, value) }, [handlePromptSubmission])

  // Virtual list — renders only the rows visible in the viewport.
  const rowVirtualizer = useVirtualizer({
    count: visibleMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    overscan: 8,
    measureElement: (el) => el.getBoundingClientRect().height,
  })

  // Track whether the user is at the bottom so we only auto-scroll when they are.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function onScroll() {
      if (!el) return
      isAtBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 60
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll to bottom on new messages or streaming tokens, but only if already near bottom.
  useEffect(() => {
    if (!isAtBottomRef.current || visibleMessages.length === 0) return
    rowVirtualizer.scrollToIndex(visibleMessages.length - 1, { align: 'end', behavior: 'auto' })
  }, [visibleMessages.length, streaming]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="conv-root">
      <style>{CONV_CSS}</style>

      {/* ── Top Bar ── */}
      <div className="conv-top-bar">
        <ChatTopBar
          providerLabel={providers.find((p) => p.id === selectedProviderId)?.name || session.providerLabel || 'Provider'}
          modelLabel={selectedModels.find((m) => m.model_id === selectedModelId)?.display_name || session.modelLabel || 'Model'}
          providerOptions={providers.map((p) => ({ id: p.id, label: p.name }))}
          modelOptions={
            selectedProviderId && Object.prototype.hasOwnProperty.call(modelsByProvider, selectedProviderId)
              ? selectedModels.map((m) => ({ id: m.model_id, label: m.display_name || m.model_id }))
              : undefined
          }
          selectedProviderId={selectedProviderId}
          selectedModelId={selectedModelId}
          onProviderSelect={handleProviderSelect}
          onModelSelect={handleModelSelect}
          modelDisabled={loadingModelsFor === selectedProviderId}
          monitorOpen={monitorOpen}
          onToggleMonitor={toggleMonitor}
          permissionMode={permissionMode}
          onTogglePermission={togglePermissionMode}
          onPermissionModeSelect={handlePermissionModeSelect}
          executionMode={agentState.executionMode}
        />
      </div>

      {/* ── Messages (virtualised) ── */}
      <div className={`conv-messages${isPlanPending ? ' conv-messages--blurred' : ''}`} ref={scrollRef}>
        <div
          className="conv-messages-inner"
          style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const msg = visibleMessages[virtualRow.index]
            const i = virtualRow.index
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="conv-virtual-row"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${virtualRow.start}px)` }}
              >
                <MessageItem
                  message={msg}
                  sessionId={id}
                  showAvatar={msg.role === 'assistant' ? i === 0 || visibleMessages[i - 1]?.role !== 'assistant' : true}
                  compact={msg.role === 'assistant' && i > 0 && visibleMessages[i - 1]?.role === 'assistant'}
                  onApproveTool={onApproveTool}
                  onDenyTool={onDenyTool}
                  onSubmitToolPrompt={onSubmitToolPrompt}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Plan artifact card — shown above input when a plan is pending ── */}
      {id && pendingPlan && (
        <div style={{ padding: '0 16px 8px', display: 'flex', justifyContent: 'center' }}>
          <PlanArtifactCard plan={pendingPlan} sessionId={id} onProceed={handlePlanProceed} />
        </div>
      )}

      {/* ── AskUser pending banner ── */}
      {pendingAskUser && pendingAskUser.type === 'tool_use' && pendingAskUser._prompt && (
        <div className="conv-ask-banner">
          <span className="conv-ask-dot" />
          <span className="conv-ask-text">
            {pendingAskUser._prompt.message || 'The agent is waiting for your answer — scroll up to respond.'}
          </span>
        </div>
      )}

      {/* ── Input ── */}
      <div className="conv-input-area">
        <div className="conv-input-inner">
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSend={() => {
              const prompt = inputValue.trim()
              if (!prompt) return
              const fileIds = attachments.map(file => file.id)
              setInputValue('')
              setAttachments([])
              void sendMessage(prompt, { corpusId: selectedCorpusId, fileIds })
            }}
            onStop={() => { void stopMessage() }}
            placeholder="Message SeshatOS..."
            showAutoButton
            isStreaming={isStreaming}
            statusText={agentState.activeTool?.message || (isStreaming ? 'SeshatOS is running…' : undefined)}
            selectedCorpusId={selectedCorpusId}
            onCorpusChange={setSelectedCorpusId}
            executionMode={agentState.executionMode === 'pair_programming' ? 'execute' : agentState.executionMode}
            onExecutionModeChange={handleExecutionModeSelect}
            projectPath={session.projectPath}
            onProjectChange={handleProjectChange}
            attachments={attachments}
            onAttachFiles={handleAttachFiles}
            onRemoveAttachment={handleRemoveAttachment}
            isUploadingAttachments={uploadingAttachments}
          />
        </div>
      </div>
    </div>
  )
}

const CONV_CSS = `
${CHAT_TOP_BAR_CSS}
${CHAT_INPUT_CSS}
${MESSAGE_ITEM_CSS}

.conv-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg);
  min-height: 0;
  overflow: hidden;
}

.conv-top-bar {
  padding: 16px 24px;
  flex-shrink: 0;
}

.conv-messages {
  flex: 1;
  overflow-y: auto;
  padding: 40px 0;
  transition: filter 0.25s ease;
}

.conv-messages--blurred {
  filter: blur(3px);
  pointer-events: none;
  user-select: none;
}

.conv-messages-inner {
  /* sizing handled via inline style (virtualizer height) */
}

.conv-virtual-row {
  max-width: 860px;
  margin: 0 auto;
  padding: 0 24px;
  box-sizing: border-box;
}

.conv-ask-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 24px 8px;
  padding: 9px 14px;
  border-radius: 10px;
  background: rgba(239, 124, 47, 0.08);
  border: 1px solid rgba(239, 124, 47, 0.22);
  flex-shrink: 0;
}

.conv-ask-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-accent);
  flex-shrink: 0;
  animation: ask-pulse 1.4s ease-in-out infinite;
}

@keyframes ask-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.75); }
}

.conv-ask-text {
  font-size: 13px;
  color: var(--color-accent);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conv-input-area {
  padding: 0 24px 14px;
  background: linear-gradient(to top, var(--color-bg) 70%, transparent);
  flex-shrink: 0;
}

.conv-input-inner {
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}

.conv-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

`
