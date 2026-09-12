import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useParams, useNavigate } from 'react-router'
import { streamingToContentBlocks, useSessionStore, EMPTY_STREAMING, DEFAULT_AGENT_STATE } from '@/stores/session'
import { useUIStore, buildRightPanelId } from '@/stores/ui'
import { ChatTopBar, CHAT_TOP_BAR_CSS } from '@/components/chat/ChatTopBar'
import { ChatInput, CHAT_INPUT_CSS, type ChatAttachment } from '@/components/chat/ChatInput'
import { MessageItem, MESSAGE_ITEM_CSS, isRenderableMessage } from '@/components/chat/MessageItem'
import { ProviderIcon } from '@/components/ui/ProviderIcon'
import { PlanArtifactCard } from '@/components/chat/plan/PlanArtifactCard'
import { AskUserPanel } from '@/components/chat/AskUserPanel'
import { useToast, ToastStack, TOAST_CSS } from '@/components/ui/Toast'
import { useChat } from '@/hooks/useChat'
import { useProviders, fetchProviderModels } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import { api } from '@/api/client'
import type { Session, ProviderModel, ProviderSetting } from '@/api/types'
import { normalizeSessionMessages } from '@/lib/chat'
import { deleteSession } from '@/lib/deleteSession'
import { serializeConversationMarkdown, conversationFileName } from '@/lib/conversationExport'
import { UNTITLED_SESSION_TITLE } from '@/lib/sessionTitle'
import { renderPDFPagePreviews } from '@/lib/pdfPreview'
import { extractOfficeThumbnail } from '@/lib/officeThumbnail'
import type { AgentState } from '@/stores/session'

function attachmentCategory(file: File): ChatAttachment['category'] {
  if (file.type.startsWith('image/')) return 'images'
  if (
    file.type.includes('pdf') ||
    file.type.includes('document') ||
    file.type.includes('text') ||
    /\.(pdf|doc|docx|txt|md|csv|xls|xlsx|ppt|pptx)$/i.test(file.name)
  ) {
    return 'documents'
  }
  return 'other'
}

function isPDFFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

// DOCX/XLSX may carry a real embedded thumbnail (docProps/thumbnail.*, see
// lib/officeThumbnail.ts) - extracted straight from the raw File object
// client-side, same as PDF page previews below, so the attach card doesn't
// have to wait on the upload/server round trip to show something better
// than the tiny raw-text fallback. PPTX is deliberately excluded: a real
// slide deck's embedded media makes JSZip's synchronous decompression slow
// enough to freeze the UI for the better part of a minute, for a thumbnail
// that's usually missing anyway on agent-generated files - the icon
// fallback in ChatInput/MessageItem is instant and always available.
function isOfficeZipFile(file: File): boolean {
  return /\.(docx|xlsx)$/i.test(file.name)
}

function sentAttachment(file: ChatAttachment) {
  return {
    id: file.id,
    filename: file.filename,
    content_type: file.content_type,
    size: file.size,
    category: file.category,
    local_path: file.local_path,
    preview_url: file.preview_url,
    page_preview_urls: file.page_preview_urls,
  }
}

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

// Rotated through while the agent is reasoning with no specific tool active
// (a plain "thinking" state has nothing more concrete to report) - purely
// decorative vocabulary, swapped on a timer so a long pause between tool
// calls doesn't just sit on one static word the whole time.
const THINKING_WORDS = [
  'Thinking', 'Reasoning', 'Considering', 'Synthesizing', 'Puzzling it out',
  'Mulling it over', 'Weighing options', 'Piecing it together', 'Contemplating',
  'Turning it over', 'Working it out', 'Sketching a plan',
]

function capitalize(text: string): string {
  return text.length > 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

function useRotatingWord(words: string[], active: boolean, intervalMs = 1900): string {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!active) {
      setIndex(0)
      return
    }
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), intervalMs)
    return () => clearInterval(id)
  }, [active, words, intervalMs])
  return words[index] ?? words[0]
}

function agentActivityPhrase(state: AgentState, thinkingWord: string): string {
  // An active tool is the most concrete, logical thing to report - always
  // takes priority over the decorative rotation below.
  if (state.activeTool) return capitalize(TOOL_ACTIVITY_PHRASES[state.activeTool.toolName] ?? 'working')
  if (state.isThinking) return thinkingWord
  // Named setup phase (loading tools, resuming session, searching knowledge)
  // - only shown during the genuine pre-generation gap, since activeTool and
  // isThinking above both already win the instant real activity starts.
  if (state.stage) return state.stage.label
  return 'Working'
}

type ModelChoice = {
  id: string
  providerId: string
  providerName: string
  providerKind: string
  model: ProviderModel
}

function modelChoiceId(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`
}

function splitModelChoiceId(id: string): { providerId: string; modelId: string } | null {
  const separator = id.indexOf('::')
  if (separator <= 0 || separator === id.length - 2) return null
  return {
    providerId: id.slice(0, separator),
    modelId: id.slice(separator + 2),
  }
}

function providerInitials(name: string, kind: string): string {
  const source = name.trim() || kind.trim() || 'AI'
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function providerDisplayName(name: string, kind: string): string {
  const displayName = name.trim()
  const providerKind = kind.trim()
  if (!displayName) return providerKind
  if (!providerKind) return displayName
  if (displayName.toLowerCase() === providerKind.toLowerCase()) return displayName
  return displayName
}

function isChatProviderUsable(provider: ProviderSetting): boolean {
  if (provider.provider === 'ollama') return true
  if (provider.auth_kind === 'oauth') return provider.connection_status === 'connected'
  return provider.has_api_key || provider.connection_status === 'ready'
}

function useLiveActivityForAgent(state: AgentState): { label: string; detail?: string } {
  const isPureThinking = state.isThinking && !state.activeTool
  const thinkingWord = useRotatingWord(THINKING_WORDS, isPureThinking)
  return {
    label: agentActivityPhrase(state, thinkingWord),
    detail: state.activeTool?.message,
  }
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
  const browserOpen = useUIStore((s) =>
    s.rightColumns.some((c) => c.panels.some((p) => p.kind === 'browser' && p.sessionId === id))
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
  const [loadingModelProviderIds, setLoadingModelProviderIds] = useState<string[]>([])
  const [modelLoadError, setModelLoadError] = useState<string | null>(null)
  const [modelRetryNonce, setModelRetryNonce] = useState(0)
  const chatProviders = useMemo(() => providers.filter(isChatProviderUsable), [providers])

  // Init from session once it's available (handles direct URL navigation)
  useEffect(() => {
    if (!session) return
    if (!selectedProviderId && session.providerSettingId) setSelectedProviderId(session.providerSettingId)
    if (!selectedModelId && session.modelId) setSelectedModelId(session.modelId)
  }, [session?.providerSettingId, session?.modelId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load every provider's models so the composer can expose one model picker
  // instead of asking the user to choose a provider first. The selected
  // option still carries providerId internally, so the backend receives the
  // same provider_setting_id + model_id pair as before.
  useEffect(() => {
    const missing = chatProviders.filter((provider) => modelsByProvider[provider.id] === undefined)
    if (missing.length === 0) return
    let cancelled = false
    setModelLoadError(null)
    const missingIds = missing.map((provider) => provider.id)
    setLoadingModelProviderIds((current) => Array.from(new Set([...current, ...missingIds])))

    for (const provider of missing) {
      fetchProviderModels(provider.id)
        .then((models) => {
          if (cancelled) return
          setModelsByProvider((current) => ({ ...current, [provider.id]: models }))
        })
        .catch(() => {
          if (cancelled) return
          setModelsByProvider((current) => ({ ...current, [provider.id]: [] }))
          setModelLoadError('Some model catalogs are unavailable. Check provider settings and retry.')
        })
        .finally(() => {
          if (cancelled) return
          setLoadingModelProviderIds((current) => current.filter((id) => id !== provider.id))
        })
    }
    return () => { cancelled = true }
  }, [chatProviders, modelsByProvider, modelRetryNonce])

  const allModelChoices = useMemo<ModelChoice[]>(() => {
    return chatProviders.flatMap((provider) => (modelsByProvider[provider.id] ?? []).map((model) => ({
      id: modelChoiceId(provider.id, model.model_id),
      providerId: provider.id,
      providerName: provider.name,
      providerKind: provider.provider,
      model,
    })))
  }, [chatProviders, modelsByProvider])

  const selectedModelChoiceId = selectedProviderId && selectedModelId
    ? modelChoiceId(selectedProviderId, selectedModelId)
    : null

  const selectedModelChoice = selectedModelChoiceId
    ? allModelChoices.find((choice) => choice.id === selectedModelChoiceId) ?? null
    : null
  const selectedModelProviderStillLoading = Boolean(
    selectedProviderId &&
    selectedModelId &&
    modelsByProvider[selectedProviderId] === undefined
  )

  // Auto-select first model when the list loads and current selection isn't in it.
  // If the session already carries a provider/model from Home, wait for that
  // provider's catalog before falling back; otherwise whichever provider loads
  // first can briefly replace the visible selection with the wrong model.
  useEffect(() => {
    if (allModelChoices.length === 0) return
    if (selectedModelChoice) return
    if (selectedModelProviderStillLoading) return
    const sessionChoice = session?.providerSettingId && session?.modelId
      ? allModelChoices.find((choice) => choice.providerId === session.providerSettingId && choice.model.model_id === session.modelId)
      : null
    const def = sessionChoice
      ?? allModelChoices.find((choice) => choice.model.is_default)
      ?? allModelChoices[0]
    setSelectedProviderId(def.providerId)
    setSelectedModelId(def.model.model_id)
  }, [allModelChoices, selectedModelChoice, selectedModelProviderStillLoading, session?.providerSettingId, session?.modelId])

  const handleModelSelect = useCallback((choiceId: string) => {
    const choice = splitModelChoiceId(choiceId)
    if (!choice) return
    const provider = providers.find((p) => p.id === choice.providerId)
    const model = modelsByProvider[choice.providerId]?.find((m) => m.model_id === choice.modelId)
    setSelectedProviderId(choice.providerId)
    setSelectedModelId(choice.modelId)
    setModelLoadError(null)
    const label = model?.display_name || choice.modelId
    if (id) {
      void api.patch(`/sessions/${id}`, { provider_setting_id: choice.providerId, model_id: choice.modelId }).catch(() => {})
      updateSession(id, {
        providerSettingId: choice.providerId,
        providerLabel: provider?.name,
        modelId: choice.modelId,
        modelLabel: label,
      })
    }
  }, [id, providers, modelsByProvider, updateSession])

  const handleModelRetry = useCallback(() => {
    setModelLoadError(null)
    setModelsByProvider({})
    setModelRetryNonce((current) => current + 1)
  }, [])

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
  const liveActivity = useLiveActivityForAgent(agentState)
  const [inputValue, setInputValue] = useState('')
  const [selectedCorpusId, setSelectedCorpusId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const browserToolNavigationRef = useRef<string | null>(null)
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
  const isAtBottomRef = useRef(true)
  const scrollRafRef = useRef<number | null>(null)

  function toggleMonitor() {
    if (monitorOpen) {
      closeRightPanel(buildRightPanelId({ kind: 'agent', sessionId: id }))
    } else {
      openRightPanel({ kind: 'agent', title: 'Agent Monitor', sessionId: id })
    }
  }

  function toggleBrowser() {
    if (browserOpen) {
      closeRightPanel(buildRightPanelId({ kind: 'browser', sessionId: id }))
    } else {
      openRightPanel({ kind: 'browser', title: 'Browser', sessionId: id })
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
    const selectedFiles = Array.from(files)
    const pending = selectedFiles.map((file, index): ChatAttachment => ({
      id: `local-${Date.now()}-${index}-${file.name}`,
      filename: file.name,
      content_type: file.type,
      size: file.size,
      category: attachmentCategory(file),
      preview_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      upload_status: 'uploading',
    }))
    setAttachments(current => [...current, ...pending])
    for (const [index, file] of selectedFiles.entries()) {
      const pendingId = pending[index]?.id
      if (isPDFFile(file)) {
        void renderPDFPagePreviews(file, 10)
          .then((previews) => {
            const urls = previews.map((preview) => preview.dataURL)
            setAttachments(current => current.map(attachment => (
              attachment.id === pendingId
                ? { ...attachment, preview_url: urls[0], page_preview_urls: urls }
                : attachment
            )))
          })
          .catch(() => {})
      } else if (isOfficeZipFile(file)) {
        void file.arrayBuffer()
          .then(extractOfficeThumbnail)
          .then((url) => {
            if (!url) return
            setAttachments(current => current.map(attachment => (
              attachment.id === pendingId ? { ...attachment, preview_url: url } : attachment
            )))
          })
          .catch(() => {})
      }
    }
    setUploadingAttachments(true)
    setAttachmentError(null)
    try {
      for (const [index, file] of selectedFiles.entries()) {
        const pendingId = pending[index]?.id
        let pagePreviews: string[] = []
        let officeThumbnail: string | null = null
        if (isPDFFile(file)) {
          pagePreviews = (await renderPDFPagePreviews(file, 10).catch(() => [])).map(preview => preview.dataURL)
        } else if (isOfficeZipFile(file)) {
          officeThumbnail = await file.arrayBuffer().then(extractOfficeThumbnail).catch(() => null)
        }
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
        setAttachments(current => current.map(attachment => (
          attachment.id === pendingId
            ? {
                ...attachment,
                id: item.id,
                filename: item.filename,
                content_type: item.content_type,
                size: item.size,
                category: item.category,
                local_path: item.local_path,
                page_preview_urls: pagePreviews.length > 0 ? pagePreviews : attachment.page_preview_urls,
                preview_url: pagePreviews[0] ?? officeThumbnail ?? attachment.preview_url,
                upload_status: 'uploaded',
              }
            : attachment
        )))
      }
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Attachment upload failed.'
      setAttachmentError(`Attachment upload failed: ${message}`)
      setAttachments(current => current.map(file => (
        pending.some(item => item.id === file.id)
          ? { ...file, upload_status: 'failed', error: message }
          : file
      )))
    } finally {
      setUploadingAttachments(false)
    }
  }, [id])

  const handleRemoveAttachment = useCallback((fileId: string) => {
    setAttachments(current => current.filter(file => file.id !== fileId))
    setAttachmentError(null)
    // Attachments upload to the backend immediately on attach, before the
    // message is ever sent (see handleAttachFiles) - removing one here
    // without also deleting it server-side would leave the file (blob + DB
    // record + workspace copy) orphaned forever, since it was never
    // attached to a sent message for anything else to clean up.
    if (!fileId.startsWith('local-')) {
      void api.delete(`/files/${fileId}`).catch(() => {})
    }
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

  useEffect(() => {
    const tool = agentState.activeTool
    if (!tool?.toolName.startsWith('browser_')) return
    if (!browserOpen) openRightPanel({ kind: 'browser', title: 'Browser', sessionId: id })
    if (tool.toolName !== 'browser_open' && tool.toolName !== 'browser_navigate') return
    const toolBlock = [...streaming].reverse().find((block) => (
      block.type === 'tool_use' &&
      block.name === tool.toolName
    ))
    const input = toolBlock?.type === 'tool_use'
      ? toolBlock.input as Record<string, unknown> | undefined
      : undefined
    const target = typeof input?.url === 'string'
      ? input.url
      : typeof input?.target === 'string'
        ? input.target
        : null
    const navKey = target ? `${tool.toolName}:${target}` : null
    if (target && browserToolNavigationRef.current !== navKey) {
      browserToolNavigationRef.current = navKey
      void window.nexus?.browser?.openUrl(target, 'builtin', id).catch(() => undefined)
    }
  }, [agentState.activeTool?.toolName, browserOpen, openRightPanel, streaming, id])

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
    const draftAgentSlug = session.draftAgentSlug
    const draftFileIds = session.draftFileIds
    const draftAttachments = session.draftAttachments
    updateSession(session.id, { draftPrompt: undefined, draftAgentSlug: undefined, draftFileIds: undefined, draftAttachments: undefined })
    if (session.messages.length === 0) {
      void sendMessage(draft, { fileIds: draftFileIds, attachments: draftAttachments, agentSlug: draftAgentSlug })
      return
    }
    setInputValue(draft)
  }, [sendMessage, session?.draftPrompt, session?.draftAgentSlug, session?.draftFileIds, session?.draftAttachments, session?.id, session?.messages.length, updateSession])

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
  const visibleMessages = session ? session.messages.filter((message, index) => (
    isRenderableMessage(message) ||
    (isStreaming && !pendingPermission && !pendingAskUser && message.role === 'assistant' && index === session.messages.length - 1)
  )) : []

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
  // react-virtual's own default behavior here is the actual source of the
  // "violent" auto-scroll bug: whenever a row above the current scroll
  // offset gets remeasured (e.g. the streaming assistant row growing well
  // past its 120px estimate), it nudges scrollTop to compensate - gated by
  // default only on "not currently scrolling backward", which covers just
  // the instant of a scroll gesture, not "user scrolled up and is sitting
  // still reading while the message below keeps growing". That left the
  // view creeping back toward the bottom underneath the user even after
  // they'd deliberately scrolled away. This isn't a useVirtualizer() option
  // - it's a property set directly on the returned instance - and tying it
  // to the same isAtBottomRef signal the follow-scroll effect below already
  // uses makes both behaviors agree: only adjust for row growth while the
  // user is actually following along.
  rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => isAtBottomRef.current

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
  //
  // Root cause of the "violent"/jerky auto-scroll (2026-08-06 audit): `streaming`
  // gets a new array reference on every single SSE delta (handleStreamChunk in
  // useChat.ts calls store.setStreaming synchronously per token, not batched
  // the way the RAF-throttled message-content sync is) — so during a dense
  // response this effect could call scrollToIndex dozens of times per second,
  // once per token, instead of once per painted frame. Throttling the call
  // itself to at most one per animation frame (mirroring the scheduleSync
  // pattern in useChat.ts) fixes the symptom without needing to touch the
  // streaming state update path. Deliberately no cleanup tied to
  // [visibleMessages.length, streaming]: a cleanup there would cancel the
  // pending RAF on every token before it ever gets a chance to fire, starving
  // the scroll entirely under fast streaming — see the separate unmount-only
  // effect below instead.
  useEffect(() => {
    if (!isAtBottomRef.current || visibleMessages.length === 0) return
    if (scrollRafRef.current !== null) return
    const targetIndex = visibleMessages.length - 1
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      if (isAtBottomRef.current) {
        rowVirtualizer.scrollToIndex(targetIndex, { align: 'end', behavior: 'auto' })
      }
    })
  }, [visibleMessages.length, streaming]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current)
        scrollRafRef.current = null
      }
    }
  }, [])

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
      <ToastStack toasts={toasts} />

      {/* Top Bar */}
      <div className="conv-top-bar">
        <ChatTopBar
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
            const revealThinking = isStreaming && msg.role === 'assistant' && i === visibleMessages.length - 1
            const autoExpandTools = revealThinking
            const showLiveActivity = revealThinking && !pendingPermission && !pendingAskUser
            const showCompleted = justCompleted && msg.role === 'assistant' && i === visibleMessages.length - 1 && !pendingPermission && !pendingAskUser
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
                  revealThinking={revealThinking}
                  autoExpandTools={autoExpandTools}
                  liveActivity={showLiveActivity ? liveActivity : undefined}
                  justCompleted={showCompleted}
                  onApproveTool={onApproveTool}
                  onDenyTool={onDenyTool}
                  onSubmitToolPrompt={onSubmitToolPrompt}
                  onRetryMessage={(text) => { void sendMessage(text) }}
                />
              </div>
            )
          })}
        </div>
      </div>

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
              if (attachments.some(file => file.upload_status === 'uploading')) {
                setAttachmentError('Wait for attachments to finish uploading before sending.')
                return
              }
              const prompt = inputValue.trim() || (attachments.length > 0 ? 'Please analyze the attached file(s).' : '')
              if (!prompt) return
              const fileIds = attachments
                .filter(file => file.upload_status !== 'failed' && !file.id.startsWith('local-'))
                .map(file => file.id)
              const sentAttachments = attachments
                .filter(file => file.upload_status !== 'failed' && !file.id.startsWith('local-'))
                .map(sentAttachment)
              setInputValue('')
              setAttachments([])
              void sendMessage(prompt, {
                corpusId: selectedCorpusId,
                fileIds,
                attachments: sentAttachments,
                providerSettingId: selectedProviderId,
                modelId: selectedModelId,
              })
            }}
            onStop={() => { void stopMessage() }}
            placeholder="Message SeshatOS..."
            isStreaming={isStreaming}
            showInlineStatus={false}
            selectedCorpusId={selectedCorpusId}
            onCorpusChange={setSelectedCorpusId}
            projectPath={session.projectPath}
            onProjectChange={handleProjectChange}
            attachments={attachments}
            onAttachFiles={handleAttachFiles}
            onRemoveAttachment={handleRemoveAttachment}
            isUploadingAttachments={uploadingAttachments}
            attachmentError={attachmentError}
            modelLabel={
              modelLoadError
                ? 'Models unavailable'
                : selectedModelChoice?.model.display_name || selectedModelChoice?.model.model_id || session.modelLabel || 'Model'
            }
            modelIcon={
              selectedModelChoice
                ? <ProviderIcon provider={selectedModelChoice.providerKind} size={13} />
                : undefined
            }
            modelOptions={!modelLoadError ? allModelChoices.map((choice) => ({
              id: choice.id,
              label: choice.model.display_name || choice.model.model_id,
              description: providerDisplayName(choice.providerName, choice.providerKind),
              icon: <ProviderIcon provider={choice.providerKind} size={17} />,
              prefix: providerInitials(choice.providerName, choice.providerKind),
            })) : undefined}
            selectedModelId={selectedModelChoiceId}
            onModelSelect={handleModelSelect}
            modelDisabled={loadingModelProviderIds.length > 0 && allModelChoices.length === 0}
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
${TOAST_CSS}

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
