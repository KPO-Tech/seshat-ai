import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useSessionStore, EMPTY_STREAMING, DEFAULT_AGENT_STATE } from '@renderer/stores/session'
import { useUIStore } from '@renderer/stores/ui'
import { isRenderableMessage } from '../messages/MessageItem'
import { ConversationComposer } from '../composer/ConversationComposer'
import { useDraftAttachments } from '../composer/useDraftAttachments'
import { useConversationActions } from './useConversationActions'
import { useConversationModes } from './useConversationModes'
import { useConversationPanels } from './useConversationPanels'
import { ConversationPendingPanels } from './ConversationPendingPanels'
import { useConversationRuntimeActions } from './useConversationRuntimeActions'
import { useConversationScroll } from './useConversationScroll'
import { useConversationSessionLoad } from './useConversationSessionLoad'
import { useConversationModels } from './useConversationModels'
import { ConversationHeader } from './ConversationHeader'
import { ConversationEmpty } from './ConversationEmpty'
import { useLiveActivityForAgent } from '../messages/liveActivity'
import { MessageList } from '../messages/MessageList'
import { useToast, ToastStack } from '@renderer/components/ui/Toast'
import { useChat } from '@renderer/hooks/useChat'
import { UNTITLED_SESSION_TITLE } from '@renderer/lib/sessionTitle'

export function ConversationPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const sessions = useSessionStore((s) => s.sessions)
  const updateSession = useSessionStore((s) => s.updateSession)
  const streaming = useSessionStore((s) => (id ? s.streamingBySession[id] : null) ?? EMPTY_STREAMING)
  const session = sessions.find((s) => s.id === id)
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  const closeRightPanel = useUIStore((s) => s.closeRightPanel)
  const monitorOpen = useUIStore((s) =>
    s.rightColumns.some((c) => c.panels.some((p) => p.kind === 'agent' && p.sessionId === id))
  )
  const browserOpen = useUIStore((s) =>
    s.rightColumns.some((c) => c.panels.some((p) => p.kind === 'browser' && p.sessionId === id))
  )
  const permissionMode = useUIStore((s) => s.permissionMode)
  const togglePermissionMode = useUIStore((s) => s.togglePermissionMode)
  const setPermissionMode = useUIStore((s) => s.setPermissionMode)

  const {
    allModelChoices,
    selectedProviderId,
    selectedModelId,
    selectedModelChoice,
    selectedModelChoiceId,
    loadingModelProviderIds,
    modelLoadError,
    handleModelSelect,
    handleModelRetry,
  } = useConversationModels({ sessionId: id, session, updateSession })

  const {
    handlePermissionModeSelect,
    handleExecutionModeSelect,
    handleProjectChange,
  } = useConversationModes({
    sessionId: id,
    setPermissionMode,
    updateSession,
  })

  const agentState = useSessionStore((s) => (id ? s.agentStates[id] : null) ?? DEFAULT_AGENT_STATE)
  const pendingPermission = agentState.pendingPermission
  const isPlanPending = pendingPermission?.toolName === 'exit_plan_mode'
  const pendingPlan = useSessionStore((s) => (id ? s.getPendingPlan(id) : undefined))
  const pendingAskUser = streaming.find(
    (b) => b.type === 'tool_use' && b.name === 'ask_user_question' && b._prompt
  ) ?? null
  const liveActivity = useLiveActivityForAgent(agentState)
  const [inputValue, setInputValue] = useState('')
  const [selectedCorpusId, setSelectedCorpusId] = useState<string | null>(null)
  const {
    attachments,
    uploadingAttachments,
    attachmentError,
    setAttachmentError,
    clearAttachments,
    handleAttachFiles,
    handleRemoveAttachment,
    hasUploadingAttachments,
    uploadedFileIds,
    sentAttachments,
  } = useDraftAttachments(id)
  const { toasts, show: showToast } = useToast()
  // Brief "done" checkmark after a genuinely successful turn - fires only
  // from useChat's actual commit path (see onTurnSuccess below), never on
  // isStreaming's falling edge alone, since that also fires on failure and
  // would otherwise flash a success checkmark on an errored turn.
  const [justCompleted, setJustCompleted] = useState(false)
  const { sendMessage, stopMessage, isStreaming } = useChat(id || '', {
    onCompaction: (preTokens, postTokens) => {
      const saved = preTokens - postTokens
      showToast(`Compacted conversation - saved ${saved.toLocaleString()} tokens (${preTokens.toLocaleString()} → ${postTokens.toLocaleString()})`, 'info')
    },
    onTurnSuccess: () => {
      setJustCompleted(true)
      setTimeout(() => setJustCompleted(false), 1500)
    },
  })
  const {
    toggleMonitor,
    toggleBrowser,
    handleDelete,
    handleExport,
    handleShare,
  } = useConversationActions({
    sessionId: id,
    session,
    monitorOpen,
    browserOpen,
    openRightPanel,
    closeRightPanel,
    navigateHome: () => navigate('/'),
  })

  useConversationPanels({
    sessionId: id,
    agentState,
    streaming,
    monitorOpen,
    browserOpen,
    isPlanPending,
    pendingPlan,
    openRightPanel,
  })

  useConversationSessionLoad({
    sessionId: id,
    session,
    updateSession,
    sendMessage,
    setInputValue,
  })

  // session can go away mid-render (e.g. deleting the currently-open
  // conversation re-renders this component before navigate('/') takes
  // effect) - every hook below must still run the same way regardless, so
  // the "session not found" return sits after all of them, not before.
  const visibleMessages = session ? session.messages.filter((message, index) => (
    isRenderableMessage(message) ||
    (isStreaming && !pendingPermission && !pendingAskUser && message.role === 'assistant' && index === session.messages.length - 1)
  )) : []

  const {
    handlePlanProceed,
    handlePlanDeny,
    onApproveTool,
    onDenyTool,
    onSubmitToolPrompt,
  } = useConversationRuntimeActions({
    sessionId: id,
    pendingPermission,
    sendMessage,
    onBlocked: (message) => showToast(message, 'err'),
  })

  // Virtual list - renders only the rows visible in the viewport.
  const { scrollRef, rowVirtualizer } = useConversationScroll({
    messageCount: visibleMessages.length,
    streaming,
  })

  if (!session) {
    return <ConversationEmpty />
  }

  return (
    <div className="conv-root">
      <style>{CONV_CSS}</style>
      <ToastStack toasts={toasts} />

      <ConversationHeader
        title={session.title || UNTITLED_SESSION_TITLE}
        executionMode={agentState.executionMode}
        onExecutionModeChange={handleExecutionModeSelect}
        monitorOpen={monitorOpen}
        onToggleMonitor={toggleMonitor}
        browserOpen={browserOpen}
        onToggleBrowser={toggleBrowser}
        permissionMode={permissionMode}
        onTogglePermission={togglePermissionMode}
        onPermissionModeSelect={handlePermissionModeSelect}
        onExport={handleExport}
        onShare={handleShare}
        onDelete={handleDelete}
      />

      <MessageList
        sessionId={id}
        messages={visibleMessages}
        scrollRef={scrollRef}
        rowVirtualizer={rowVirtualizer}
        blurred={isPlanPending}
        isStreaming={isStreaming}
        pendingPermission={pendingPermission}
        pendingAskUser={pendingAskUser}
        liveActivity={liveActivity}
        justCompleted={justCompleted}
        onApproveTool={onApproveTool}
        onDenyTool={onDenyTool}
        onSubmitToolPrompt={onSubmitToolPrompt}
        onRetryMessage={(text) => { void sendMessage(text) }}
      />

      <ConversationPendingPanels
        sessionId={id}
        pendingPlan={pendingPlan}
        pendingAskUser={pendingAskUser?.type === 'tool_use' ? pendingAskUser : null}
        onPlanProceed={handlePlanProceed}
        onPlanReject={handlePlanDeny}
        onSubmitToolPrompt={onSubmitToolPrompt}
      />

      <ConversationComposer
        inputValue={inputValue}
        setInputValue={setInputValue}
        selectedCorpusId={selectedCorpusId}
        setSelectedCorpusId={setSelectedCorpusId}
        projectPath={session.projectPath}
        onProjectChange={handleProjectChange}
        attachments={attachments}
        onAttachFiles={handleAttachFiles}
        onRemoveAttachment={handleRemoveAttachment}
        uploadingAttachments={uploadingAttachments}
        attachmentError={attachmentError}
        setAttachmentError={setAttachmentError}
        hasUploadingAttachments={hasUploadingAttachments}
        clearAttachments={clearAttachments}
        uploadedFileIds={uploadedFileIds}
        sentAttachments={sentAttachments}
        sendMessage={sendMessage}
        stopMessage={stopMessage}
        isStreaming={isStreaming}
        selectedProviderId={selectedProviderId}
        selectedModelId={selectedModelId}
        sessionModelLabel={session.modelLabel}
        selectedModelChoice={selectedModelChoice}
        selectedModelChoiceId={selectedModelChoiceId}
        allModelChoices={allModelChoices}
        loadingModelProviderIds={loadingModelProviderIds}
        modelLoadError={modelLoadError}
        handleModelSelect={handleModelSelect}
        handleModelRetry={handleModelRetry}
      />
    </div>
  )
}

const CONV_CSS = `
.conv-root {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: color-mix(in srgb, var(--color-bg) 68%, var(--color-surface));
  min-height: 0;
  overflow: hidden;
}

.conv-top-bar {
  padding: 5px 16px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border-subtle);
  background: color-mix(in srgb, var(--color-bg) 78%, var(--color-surface));
}

.conv-messages {
  flex: 1;
  overflow-y: auto;
  padding: 22px 0 18px;
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
  max-width: 880px;
  margin: 0 auto;
  padding: 0 18px;
  box-sizing: border-box;
}

.conv-input-area {
  padding: 0 16px 14px;
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--color-bg) 66%, var(--color-surface)) 72%,
    transparent
  );
  flex-shrink: 0;
}

.conv-input-inner {
  max-width: 860px;
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
