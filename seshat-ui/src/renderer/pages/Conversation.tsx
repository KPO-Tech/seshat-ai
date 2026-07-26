import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useParams, useNavigate } from 'react-router-dom'
import { streamingToContentBlocks, useSessionStore, EMPTY_STREAMING, DEFAULT_AGENT_STATE } from '@/stores/session'
import { useUIStore, buildRightPanelId } from '@/stores/ui'
import { ChatTopBar, CHAT_TOP_BAR_CSS } from '@/components/chat/ChatTopBar'
import { ChatInput, CHAT_INPUT_CSS, type ChatAttachment } from '@/components/chat/ChatInput'
import { MessageItem, MESSAGE_ITEM_CSS, isRenderableMessage } from '@/components/chat/MessageItem'
import { PlanArtifactCard } from '@/components/chat/plan/PlanArtifactCard'
import { AskUserPanel } from '@/components/chat/AskUserPanel'
import { useChat } from '@/hooks/useChat'
import { useProviders, fetchProviderModels } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import { api } from '@/api/client'
import type { Session, ProviderModel } from '@/api/types'
import { normalizeSessionMessages } from '@/lib/chat'
import { deleteSession } from '@/lib/deleteSession'
import { serializeConversationMarkdown, conversationFileName } from '@/lib/conversationExport'
import { UNTITLED_SESSION_TITLE } from '@/lib/sessionTitle'
import type { AgentState } from '@/stores/session'

// Present-continuous fragments for "SeshatOS is ___" - a tool-aware status
// line shown in the transcript itself while a turn is running, instead of
// leaving the user staring at an empty message area with only a small
// status string tucked into the input toolbar.
const TOOL_ACTIVITY_PHRASES: Record<string, string> = {
  write: 'writing a file', file_write: 'writing a file',
  edit: 'editing a file', file_edit: 'editing a file',
  bash: 'running a command',
  read: 'reading a file', file_read: 'reading a file', read_file: 'reading a file',
  glob: 'searching files', grep: 'searching code', list_directory: 'browsing files',
  web_search: 'searching the web', web_fetch: 'fetching a page',
  task_create: 'planning tasks', task_update: 'updating tasks',
  submit_plan: 'writing the plan', exit_plan_mode: 'wrapping up the plan',
  agent: 'delegating to a sub-agent', spawn_agent: 'delegating to a sub-agent',
  generate_image: 'generating an image', tts: 'generating audio', stt: 'transcribing audio',
}

function agentActivityPhrase(state: AgentState): string {
  if (state.activeTool) return TOOL_ACTIVITY_PHRASES[state.activeTool.toolName] ?? 'working'
  if (state.isThinking) return 'thinking'
  return 'working'
}

function AgentStatusIndicator({ state }: { state: AgentState }) {
  const phrase = agentActivityPhrase(state)
  const detail = state.activeTool?.message
  return (
    <div className="conv-status-row">
      <span className="conv-status-dots">
        <span /><span /><span />
      </span>
      <span className="conv-status-text" key={phrase}>
        SeshatOS is {phrase}{detail ? ` - ${detail}` : '...'}
      </span>
    </div>
  )
}

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
  const monitorOpen = useUIStore((s) =>
    s.rightColumns.some((c) => c.panels.some((p) => p.kind === 'agent' && p.sessionId === id))
  )
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
  const [modelLoadError, setModelLoadError] = useState<string | null>(null)
  const [modelRetryNonce, setModelRetryNonce] = useState(0)

  // Init from session once it's available (handles direct URL navigation)
  useEffect(() => {
    if (!session) return
    if (!selectedProviderId && session.providerSettingId) setSelectedProviderId(session.providerSettingId)
    if (!selectedModelId && session.modelId) setSelectedModelId(session.modelId)
  }, [session?.providerSettingId, session?.modelId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load models when provider changes
  useEffect(() => {
    if (!selectedProviderId || (modelsByProvider[selectedProviderId] !== undefined && !modelLoadError)) return
    let cancelled = false
    setLoadingModelsFor(selectedProviderId)
    setModelLoadError(null)
    fetchProviderModels(selectedProviderId)
      .then((models) => {
        if (cancelled) return
        setModelsByProvider((c) => ({ ...c, [selectedProviderId]: models }))
      })
      .catch(() => {
        if (cancelled) return
        setModelsByProvider((c) => ({ ...c, [selectedProviderId]: [] }))
        setModelLoadError('Models unavailable for this provider. Check the provider settings and try again.')
      })
      .finally(() => { if (!cancelled) setLoadingModelsFor((c) => (c === selectedProviderId ? null : c)) })
    return () => { cancelled = true }
  }, [selectedProviderId, modelRetryNonce]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setModelLoadError(null)
    const label = providers.find((p) => p.id === providerId)?.name
    if (id) {
      void api.patch(`/sessions/${id}`, { provider_setting_id: providerId }).catch(() => {})
      updateSession(id, { providerSettingId: providerId, providerLabel: label, modelId: undefined, modelLabel: undefined })
    }
  }, [id, providers, updateSession])

  const handleModelSelect = useCallback((modelId: string) => {
    setSelectedModelId(modelId)
    setModelLoadError(null)
    const models = selectedProviderId ? (modelsByProvider[selectedProviderId] ?? []) : []
    const label = models.find((m) => m.model_id === modelId)?.display_name || modelId
    if (id && selectedProviderId) {
      void api.patch(`/sessions/${id}`, { provider_setting_id: selectedProviderId, model_id: modelId }).catch(() => {})
      updateSession(id, { modelId, modelLabel: label })
    }
  }, [id, selectedProviderId, modelsByProvider, updateSession])

  const handleModelRetry = useCallback(() => {
    if (!selectedProviderId) return
    setModelLoadError(null)
    setModelsByProvider((current) => {
      const next = { ...current }
      delete next[selectedProviderId]
      return next
    })
    setModelRetryNonce((current) => current + 1)
  }, [selectedProviderId])

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
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { sendMessage, stopMessage, isStreaming } = useChat(id || '')
  const isAtBottomRef = useRef(true)

  function toggleMonitor() {
    if (monitorOpen) {
      closeRightPanel(buildRightPanelId({ kind: 'agent', sessionId: id }))
    } else {
      openRightPanel({ kind: 'agent', title: 'Agent Monitor', sessionId: id })
    }
  }

  async function handleDelete() {
    if (!id) return
    await deleteSession(id).catch(() => {})
    navigate('/')
  }

  async function handleExport() {
    if (!session) return
    const markdown = serializeConversationMarkdown(session)
    await window.nexus?.saveFile?.(conversationFileName(session), markdown).catch(() => {})
  }

  async function handleShare() {
    if (!session) return
    const markdown = serializeConversationMarkdown(session)
    await navigator.clipboard.writeText(markdown).catch(() => {})
  }

  const handleAttachFiles = useCallback(async (files: FileList) => {
    if (!files.length || !id) return
    setUploadingAttachments(true)
    setAttachmentError(null)
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
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Attachment upload failed.'
      setAttachmentError(`Attachment upload failed: ${message}`)
    } finally {
      setUploadingAttachments(false)
    }
  }, [id])

  const handleRemoveAttachment = useCallback((fileId: string) => {
    setAttachments(current => current.filter(file => file.id !== fileId))
    setAttachmentError(null)
  }, [])

  // Agent Monitor is opt-in for entering a conversation or resolving a plan
  // (the user opens it explicitly via toggleMonitor). task_create is the one
  // deliberate exception: tasks render as a quiet, foldable line in the
  // transcript (see SILENT_TOOLS), not their own card, so without this
  // there'd be no visible feedback that a task list was even created, let
  // alone a way to watch it progress.
  useEffect(() => {
    if (!id || agentState.activeTool?.toolName !== 'task_create' || monitorOpen) return
    openRightPanel({ kind: 'agent', title: 'Agent Monitor', sessionId: id })
  }, [id, agentState.activeTool?.toolName, monitorOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open the plan review panel when the agent calls exit_plan_mode
  // without a structured PlanDocument (no submit_plan): PlanEditorPanel
  // falls back to rendering the raw plan text in this case, so there's no
  // inline PlanArtifactCard to click through first.
  useEffect(() => {
    if (!id || !isPlanPending || pendingPlan) return
    openRightPanel({ kind: 'plan', title: 'Implementation Plan', sessionId: id })
  }, [id, isPlanPending, pendingPlan]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session?.draftPrompt || !session.id) return
    const draft = session.draftPrompt
    const draftFileIds = session.draftFileIds
    updateSession(session.id, { draftPrompt: undefined, draftFileIds: undefined })
    if (session.messages.length === 0) {
      void sendMessage(draft, { fileIds: draftFileIds })
      return
    }
    setInputValue(draft)
  }, [sendMessage, session?.draftPrompt, session?.draftFileIds, session?.id, session?.messages.length, updateSession])

  const sessionHasData = Boolean(session && (session.messages.length > 0 || session.draftPrompt))

  useEffect(() => {
    if (!id) return
    if (sessionHasData) return

    let cancelled = false
    void api.get<Session>(`/sessions/${id}`)
      .then((detail) => {
        if (cancelled) return
        // Guard: the session may have been deleted while the fetch was in flight.
        // Don't re-add it to the store - that would create a ghost session.
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
        // upsertSession no longer sets activeId - do it explicitly here so the
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

  // session can go away mid-render (e.g. deleting the currently-open
  // conversation re-renders this component before navigate('/') takes
  // effect) - every hook below must still run the same way regardless, so
  // the "session not found" return sits after all of them, not before.
  const visibleMessages = session ? session.messages.filter(isRenderableMessage) : []

  // Stable callbacks - identity won't change between renders so React.memo on
  // MessageItem can actually skip re-renders.
  const handlePermissionDecision = useCallback(async (toolUseId: string, approved: boolean, remember = false) => {
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
      await api.post(`/permissions/${toolUseId}`, { approved, remember, session_id: id })
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
      } catch { /* silent - engine will still unblock via permission approval */ }
    }
    if (pendingPermission?.toolName === 'exit_plan_mode') {
      // Legacy path: the model already called exit_plan_mode itself and is
      // blocked waiting on exactly this permission - resolving it unblocks
      // that turn directly.
      await handlePermissionDecision(pendingPermission.toolUseId, true)
      return
    }
    // submit_plan doesn't block the turn (RequiresPermission: false) - by
    // the time the plan reaches review, the model's turn has already ended
    // and nothing is listening on a permission channel. The only way to
    // tell it the plan is approved is a new turn - see submit_plan's own
    // prompt ("you will receive a confirmation message - then call
    // exit_plan_mode").
    await sendMessage('The plan has been approved. Proceed with implementation: call exit_plan_mode, then execute the plan.')
  }, [id, pendingPermission, handlePermissionDecision, sendMessage])

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
        _message: 'Waiting for the tool result...',
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

  const onApproveTool = useCallback((toolUseId: string, remember?: boolean) => { void handlePermissionDecision(toolUseId, true, remember) }, [handlePermissionDecision])
  const onDenyTool = useCallback((toolUseId: string) => { void handlePermissionDecision(toolUseId, false) }, [handlePermissionDecision])
  const onSubmitToolPrompt = useCallback((promptId: string, value: unknown) => { void handlePromptSubmission(promptId, value) }, [handlePromptSubmission])

  // Virtual list - renders only the rows visible in the viewport.
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

  if (!session) {
    return (
      <div className="conv-empty">
        <p>Conversation not found</p>
        <button onClick={() => navigate('/')}>Return Home</button>
      </div>
    )
  }

  return (
    <div className="conv-root">
      <style>{CONV_CSS}</style>

      {/* Top Bar */}
      <div className="conv-top-bar">
        <ChatTopBar
          title={session.title || UNTITLED_SESSION_TITLE}
          executionMode={agentState.executionMode}
          onExecutionModeChange={handleExecutionModeSelect}
          monitorOpen={monitorOpen}
          onToggleMonitor={toggleMonitor}
          permissionMode={permissionMode}
          onTogglePermission={togglePermissionMode}
          onPermissionModeSelect={handlePermissionModeSelect}
          onExport={handleExport}
          onShare={handleShare}
          onDelete={handleDelete}
        />
      </div>

      {/* Messages (virtualised) */}
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

      {/* Live agent status - tool-aware, shown in the transcript while a turn
           is running. Hidden once a permission or ask_user_question is
           pending: at that point the agent isn't "thinking" anymore, it's
           blocked on the user's own decision - showing both left the status
           looking stuck ("SeshatOS is thinking...") long after the real ball
           was in the user's court. */}
      {isStreaming && !pendingPermission && !pendingAskUser && (
        <div style={{ padding: '0 16px 8px', display: 'flex', justifyContent: 'center' }}>
          <AgentStatusIndicator state={agentState} />
        </div>
      )}

      {/* Plan artifact card - shown above input only while a plan is
           pending review. Once it's validated/rejected, the tool call's own
           inline rendering (SilentToolView swaps in PlanArtifactCard for
           submit_plan) stays in the transcript as the permanent, reopenable
           record - no need for a second copy here after the fact. */}
      {id && pendingPlan && (
        <div style={{ padding: '0 16px 8px', display: 'flex', justifyContent: 'center' }}>
          <PlanArtifactCard plan={pendingPlan} sessionId={id} onProceed={handlePlanProceed} />
        </div>
      )}

      {/* AskUser panel - docked above the input, one question at a time,
           instead of a banner pointing back into the transcript. The tool
           call's own inline rendering (AskUserToolView) steps aside to a
           small placeholder while this is showing (see its own comment). */}
      {pendingAskUser && pendingAskUser.type === 'tool_use' && pendingAskUser._prompt && (
        <AskUserPanel tool={pendingAskUser} onSubmitPrompt={onSubmitToolPrompt} />
      )}

      {/* Input */}
      <div className="conv-input-area">
        <div className="conv-input-inner">
          <ChatInput
            value={inputValue}
            onChange={setInputValue}
            onSend={() => {
              const prompt = inputValue.trim() || (attachments.length > 0 ? 'Please analyze the attached file(s).' : '')
              if (!prompt) return
              const fileIds = attachments.map(file => file.id)
              setInputValue('')
              setAttachments([])
              void sendMessage(prompt, { corpusId: selectedCorpusId, fileIds })
            }}
            onStop={() => { void stopMessage() }}
            placeholder="Message SeshatOS..."
            isStreaming={isStreaming}
            statusText={agentState.activeTool?.message || (isStreaming ? 'SeshatOS is running...' : undefined)}
            selectedCorpusId={selectedCorpusId}
            onCorpusChange={setSelectedCorpusId}
            projectPath={session.projectPath}
            onProjectChange={handleProjectChange}
            attachments={attachments}
            onAttachFiles={handleAttachFiles}
            onRemoveAttachment={handleRemoveAttachment}
            isUploadingAttachments={uploadingAttachments}
            attachmentError={attachmentError}
            providerLabel={providers.find((p) => p.id === selectedProviderId)?.name || session.providerLabel || 'Provider'}
            modelLabel={
              modelLoadError
                ? 'Models unavailable'
                : selectedModels.find((m) => m.model_id === selectedModelId)?.display_name || session.modelLabel || 'Model'
            }
            providerOptions={providers.map((p) => ({ id: p.id, label: p.name }))}
            modelOptions={
              !modelLoadError && selectedProviderId && Object.prototype.hasOwnProperty.call(modelsByProvider, selectedProviderId)
                ? selectedModels.map((m) => ({ id: m.model_id, label: m.display_name || m.model_id }))
                : undefined
            }
            selectedProviderId={selectedProviderId}
            selectedModelId={selectedModelId}
            onProviderSelect={handleProviderSelect}
            onModelSelect={handleModelSelect}
            modelDisabled={loadingModelsFor === selectedProviderId}
            modelError={modelLoadError}
            onModelRetry={handleModelRetry}
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
  padding: 11px 17px;
  flex-shrink: 0;
}

.conv-messages {
  flex: 1;
  overflow-y: auto;
  padding: 28px 0;
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
  padding: 0 17px;
  box-sizing: border-box;
}

.conv-status-row {
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: 860px;
  width: 100%;
  padding: 8px 13px;
  border-radius: 10px;
  background: rgba(239, 124, 47, 0.06);
  border: 1px solid rgba(239, 124, 47, 0.16);
}

.conv-status-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.conv-status-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: conv-status-bounce 1s ease-in-out infinite;
}

.conv-status-dots span:nth-child(2) { animation-delay: 0.15s; }
.conv-status-dots span:nth-child(3) { animation-delay: 0.3s; }

@keyframes conv-status-bounce {
  0%, 80%, 100% { opacity: 0.35; transform: scale(0.75); }
  40%           { opacity: 1; transform: scale(1); }
}

.conv-status-text {
  font-size: 12px;
  color: var(--color-accent);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  animation: conv-status-fade 0.25s ease;
}

@keyframes conv-status-fade {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 1; transform: translateY(0); }
}

.conv-input-area {
  padding: 0 17px 10px;
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
