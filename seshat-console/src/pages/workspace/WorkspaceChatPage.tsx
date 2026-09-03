import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Select, Space, Tooltip, Typography } from 'antd'
import { ArrowDownOutlined, PlusOutlined, SendOutlined, StopFilled } from '@ant-design/icons'
import { useAgentPresetsList } from '@/api/agentPresets'
import { useUsableProviderSettingsList } from '@/api/providerSettings'
import { ProviderIcon } from '@/components/ProviderIcon'
import { WorkspaceChatMessage } from '@/components/workspace/WorkspaceChatMessage'
import { useProviderCatalog, getProviderLabel, getProviderModels } from '@/api/providerCatalog'
import { createWorkspaceChatMessage, createWorkspaceChatSession } from '@/features/workspaceChat/storage'
import { fetchWorkspaceChatSession, streamWorkspaceChat, type WorkspaceChatSessionHistory } from '@/features/workspaceChat/transport'
import { clearStoredSessionId, getStoredSessionId, setStoredSessionId } from '@/features/workspaceChat/localSession'
import type { WorkspaceChatEvent, WorkspaceChatSession, WorkspaceTraceStep } from '@/features/workspaceChat/types'
import { useAuthStore } from '@/store/auth'
import { useWorkspaceOrganizationStore } from '@/store/workspaceOrganization'
import { palette } from '@/theme/tokens'

function generateID(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

// Applies one streamed event to the trailing (in-progress) assistant
// message of a session, returning a new session object - events arrive
// fast enough during generation that this needs to stay a cheap,
// allocation-light immutable update, not a deep clone.
function applyEventToSession(
  session: WorkspaceChatSession,
  event: WorkspaceChatEvent,
  activeThinkingIdRef: { current: string | null },
): WorkspaceChatSession {
  const messages = session.messages
  const lastIndex = messages.length - 1
  if (lastIndex < 0 || messages[lastIndex].role !== 'assistant') return session
  const last = messages[lastIndex]
  const trace = last.trace ?? []

  switch (event.type) {
    case 'thinking_delta': {
      const delta = event.delta ?? ''
      if (!delta) return session
      const activeId = activeThinkingIdRef.current
      const activeIndex = activeId ? trace.findIndex((step) => step.id === activeId) : -1
      let nextTrace: WorkspaceTraceStep[]
      if (activeIndex >= 0) {
        nextTrace = trace.map((step, index) => (index === activeIndex ? { ...step, content: (step.content ?? '') + delta } : step))
      } else {
        const newStep: WorkspaceTraceStep = { id: generateID('trace'), kind: 'thinking', status: 'completed', content: delta }
        activeThinkingIdRef.current = newStep.id
        nextTrace = [...trace, newStep]
      }
      return replaceLastMessage(session, { ...last, trace: nextTrace })
    }
    case 'text_delta': {
      activeThinkingIdRef.current = null
      const delta = event.delta ?? ''
      if (!delta) return session
      return replaceLastMessage(session, { ...last, content: last.content + delta })
    }
    case 'tool_progress': {
      activeThinkingIdRef.current = null
      const tool = event.tool
      if (!tool) return session
      const index = trace.findIndex((step) => step.id === tool.tool_use_id)
      const updatedStep: WorkspaceTraceStep = {
        id: tool.tool_use_id || generateID('trace'),
        kind: 'tool',
        status: (tool.stage as WorkspaceTraceStep['status']) ?? 'running',
        toolName: tool.name,
        query: tool.query,
        summary: tool.summary,
        input: tool.input,
        result: tool.result,
        durationMs: tool.duration_ms,
        webSearch: tool.web_search,
      }
      const nextTrace = index >= 0 ? trace.map((step, i) => (i === index ? { ...step, ...updatedStep } : step)) : [...trace, updatedStep]
      return replaceLastMessage(session, { ...last, trace: nextTrace })
    }
    case 'done': {
      return replaceLastMessage(session, { ...last, status: 'complete' })
    }
    case 'error': {
      return replaceLastMessage(session, {
        ...last,
        status: 'error',
        content: last.content || event.message || 'Something went wrong.',
      })
    }
    default:
      return session
  }
}

function replaceLastMessage(session: WorkspaceChatSession, updated: WorkspaceChatSession['messages'][number]): WorkspaceChatSession {
  const messages = session.messages.slice(0, -1).concat(updated)
  return { ...session, messages, updatedAt: new Date().toISOString() }
}

// Rebuilds a session from persisted history by replaying each assistant
// turn's stored event log through the exact same reducer used for live
// streaming - so a reloaded conversation ends up with identical content and
// trace to how it looked live, instead of duplicating that logic server-side.
function buildSessionFromHistory(history: WorkspaceChatSessionHistory, organizationId: string): WorkspaceChatSession {
  const activeThinkingIdRef = { current: null as string | null }
  const historyMessages = history.messages ?? []
  const fallbackTimestamp = new Date().toISOString()

  let session: WorkspaceChatSession = {
    id: history.id ?? generateID('wchat'),
    title: history.title || 'New chat',
    createdAt: historyMessages[0]?.created_at ?? fallbackTimestamp,
    updatedAt: historyMessages[historyMessages.length - 1]?.created_at ?? fallbackTimestamp,
    messages: [],
    config: {
      organizationId,
      providerSettingId: null,
      modelId: '',
      agentPresetId: null,
      corpusId: null,
      permissionMode: '',
      executionOrigin: 'interactive',
    },
  }

  for (const historyMessage of historyMessages) {
    if (historyMessage.role !== 'assistant') {
      session = {
        ...session,
        messages: [
          ...session.messages,
          {
            id: generateID('wmsg'),
            role: 'user',
            content: historyMessage.content ?? '',
            createdAt: historyMessage.created_at ?? fallbackTimestamp,
            status: 'complete',
          },
        ],
      }
      continue
    }

    activeThinkingIdRef.current = null
    session = {
      ...session,
      messages: [
        ...session.messages,
        {
          id: generateID('wmsg'),
          role: 'assistant',
          content: '',
          createdAt: historyMessage.created_at ?? fallbackTimestamp,
          status: 'draft',
          trace: [],
        },
      ],
    }
    for (const event of historyMessage.events ?? []) {
      session = applyEventToSession(session, event, activeThinkingIdRef)
    }
    // A successful turn never persists a "done" event (see
    // workspacechat.Service.StreamChat) - an error event already flips
    // status itself, so anything still "draft" after replay finished normally.
    const lastIndex = session.messages.length - 1
    if (session.messages[lastIndex].status === 'draft') {
      session = replaceLastMessage(session, { ...session.messages[lastIndex], status: 'complete' })
    }
  }

  return session
}

const NEAR_BOTTOM_THRESHOLD_PX = 120

// AppLayout's Content is the app's one scrollable region (header/sidebar
// are fixed) - a plain class lookup is enough since it's a singleton per
// page, no need to thread a ref down through the router/Outlet.
function getScrollContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.console-content')
}

export function WorkspaceChatPage() {
  const organizations = useAuthStore((state) => state.organizations)
  const selectedOrganizationId = useWorkspaceOrganizationStore((state) => state.organizationId)
  const activeOrganizationId = selectedOrganizationId ?? organizations[0]?.id ?? undefined

  const [chatSession, setChatSession] = useState<WorkspaceChatSession | null>(null)
  const [draftPrompt, setDraftPrompt] = useState('')
  const [selectedProviderSettingId, setSelectedProviderSettingId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedAgentPresetId, setSelectedAgentPresetId] = useState<string | null>(null)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const activeThinkingIdRef = useRef<string | null>(null)
  const pendingEventsRef = useRef<WorkspaceChatEvent[]>([])
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const providerSettings = useUsableProviderSettingsList(activeOrganizationId)
  const agentPresets = useAgentPresetsList(activeOrganizationId)
  const providerCatalog = useProviderCatalog()

  function stopStreaming() {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    pendingEventsRef.current = []
    activeThinkingIdRef.current = null
  }

  // Streamed text/thinking deltas can arrive many times a second. Applying
  // each one as its own setState (re-rendering, and re-parsing the whole
  // accumulated markdown answer via ReactMarkdown) every single time was
  // saturating the main thread during longer generations - it looked like
  // the page had frozen, including scroll input getting stuck for whole
  // seconds. Buffering events and flushing them as one state update every
  // FLUSH_INTERVAL_MS keeps the same per-event ordering/semantics while
  // capping how often that expensive work happens.
  const FLUSH_INTERVAL_MS = 80

  function flushPendingEvents() {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    const events = pendingEventsRef.current
    if (events.length === 0) return
    pendingEventsRef.current = []
    setChatSession((current) => {
      if (!current) return current
      let next = current
      for (const event of events) {
        next = applyEventToSession(next, event, activeThinkingIdRef)
      }
      return next
    })
  }

  function enqueueEvent(event: WorkspaceChatEvent) {
    pendingEventsRef.current.push(event)
    if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(flushPendingEvents, FLUSH_INTERVAL_MS)
    }
  }

  // Tries to reattach to the conversation this browser last had open for
  // this organization (survives a refresh, per user request - not a full
  // conversation history list) before falling back to a fresh session.
  useEffect(() => {
    stopStreaming()
    setDraftPrompt('')
    setComposerError(null)
    setIsGenerating(false)

    if (!activeOrganizationId) {
      setChatSession(null)
      return
    }

    const orgId = activeOrganizationId
    const storedSessionId = getStoredSessionId(orgId)
    if (!storedSessionId) {
      const next = createWorkspaceChatSession({ organizationId: orgId })
      setStoredSessionId(orgId, next.id)
      setChatSession(next)
      return
    }

    let cancelled = false
    setIsLoadingHistory(true)
    fetchWorkspaceChatSession(storedSessionId)
      .then((history) => {
        if (cancelled) return
        if (history) {
          setChatSession(buildSessionFromHistory(history, orgId))
          return
        }
        clearStoredSessionId(orgId)
        const next = createWorkspaceChatSession({ organizationId: orgId })
        setStoredSessionId(orgId, next.id)
        setChatSession(next)
      })
      .catch(() => {
        if (cancelled) return
        const next = createWorkspaceChatSession({ organizationId: orgId })
        setStoredSessionId(orgId, next.id)
        setChatSession(next)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeOrganizationId])

  useEffect(() => {
    const settings = providerSettings.data ?? []
    if (settings.length === 0) {
      setSelectedProviderSettingId(null)
      return
    }
    if (selectedProviderSettingId && settings.some((setting) => setting.id === selectedProviderSettingId)) return
    const fallback = settings.find((setting) => setting.is_default) ?? settings[0]
    setSelectedProviderSettingId(fallback.id ?? null)
  }, [providerSettings.data, selectedProviderSettingId])

  const selectedProviderSetting = (providerSettings.data ?? []).find((setting) => setting.id === selectedProviderSettingId) ?? null
  const modelOptions = useMemo(
    () => getProviderModels(providerCatalog.data, selectedProviderSetting?.provider, selectedProviderSetting?.default_model),
    [providerCatalog.data, selectedProviderSetting?.provider, selectedProviderSetting?.default_model],
  )

  useEffect(() => {
    if (modelOptions.length === 0) {
      setSelectedModelId(null)
      return
    }
    if (selectedModelId && modelOptions.some((option) => option.id === selectedModelId)) return
    const fallback = selectedProviderSetting?.default_model && modelOptions.some((option) => option.id === selectedProviderSetting.default_model)
      ? selectedProviderSetting.default_model
      : modelOptions[0]?.id
    setSelectedModelId(fallback ?? null)
  }, [modelOptions, selectedModelId, selectedProviderSetting?.default_model])

  useEffect(() => {
    const presets = agentPresets.data ?? []
    if (presets.length === 0) {
      setSelectedAgentPresetId(null)
      return
    }
    if (selectedAgentPresetId && presets.some((preset) => preset.id === selectedAgentPresetId)) return
    setSelectedAgentPresetId(null)
  }, [agentPresets.data, selectedAgentPresetId])

  useEffect(() => {
    const el = getScrollContainer()
    // Scrolling the container to its own bottom (rather than
    // scrollIntoView on a trailing sentinel) matters here: scrollIntoView
    // aligns the sentinel's edge with the viewport edge and ignores the
    // sticky composer that follows it in the DOM, which pushed the
    // composer out of view during generation. Going straight to
    // scrollHeight always reveals whatever is actually last (composer
    // included, since it's sticky within this same container).
    if (isPinnedToBottom && el) el.scrollTop = el.scrollHeight
  }, [chatSession?.messages, isPinnedToBottom])

  useEffect(() => {
    const el = getScrollContainer()
    if (!el) return
    function handleScroll() {
      if (!el) return
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      setIsPinnedToBottom(distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => () => stopStreaming(), [])

  const providerOptions = (providerSettings.data ?? []).map((setting) => ({
    label: (
      <Space size={10} align="center">
        <ProviderIcon provider={setting.provider ?? 'provider'} size={22} />
        <span>{getProviderLabel(providerCatalog.data, setting.provider)}</span>
      </Space>
    ),
    value: setting.id!,
  }))

  const agentOptions = (agentPresets.data ?? []).map((preset) => ({
    label: preset.name || preset.slug || preset.id || 'Agent preset',
    value: preset.id!,
  }))

  const currentTitle = chatSession?.title && chatSession.title !== 'Untitled scenario' ? chatSession.title : 'New chat'
  const hasMessages = Boolean(chatSession && chatSession.messages.length > 0)

  // stopStreaming() alone only tears down the fetch/reducer plumbing - it
  // never touches isGenerating or the in-flight draft message, which was
  // fine as long as it only ran on cleanup paths (org switch, unmount,
  // handleReset - each already resets that state some other way). Wiring
  // it to a live Stop button needed both of those handled here instead,
  // otherwise the composer would stay stuck showing a spinner and the
  // draft message would stay 'draft' (and thus "Generating…") forever.
  const handleStop = () => {
    stopStreaming()
    setIsGenerating(false)
    setChatSession((current) => {
      if (!current) return current
      const lastIndex = current.messages.length - 1
      if (lastIndex < 0) return current
      const last = current.messages[lastIndex]
      if (last.role !== 'assistant' || last.status !== 'draft') return current
      return replaceLastMessage(current, { ...last, status: 'complete', content: last.content || '_Stopped._' })
    })
  }

  const handleReset = () => {
    stopStreaming()
    setIsGenerating(false)
    const next = createWorkspaceChatSession({
      organizationId: activeOrganizationId ?? null,
      providerSettingId: selectedProviderSettingId,
      modelId: selectedModelId ?? '',
      agentPresetId: selectedAgentPresetId,
    })
    if (activeOrganizationId) setStoredSessionId(activeOrganizationId, next.id)
    setChatSession(next)
    setDraftPrompt('')
    setComposerError(null)
  }

  const handleSend = () => {
    const content = draftPrompt.trim()
    if (!content || isGenerating || isLoadingHistory) return
    if (!activeOrganizationId) {
      setComposerError('Select an organization before sending a prompt.')
      return
    }
    if (!selectedProviderSetting) {
      setComposerError('Select a provider before sending a prompt.')
      return
    }
    if (!selectedModelId) {
      setComposerError('Select a model before sending a prompt.')
      return
    }

    setComposerError(null)
    setDraftPrompt('')
    activeThinkingIdRef.current = null

    const userMessage = createWorkspaceChatMessage({ role: 'user', content, status: 'complete' })
    const assistantMessage = createWorkspaceChatMessage({ role: 'assistant', content: '', status: 'draft' })
    assistantMessage.trace = []

    // Read straight from this render's chatSession rather than a variable
    // assigned inside the setChatSession updater below - React doesn't
    // guarantee that updater runs synchronously before the next line, so
    // sessionId could still be empty when streamWorkspaceChat is called.
    const baseSession = chatSession ?? createWorkspaceChatSession({ organizationId: activeOrganizationId })
    const sessionId = baseSession.id
    if (!chatSession) setStoredSessionId(activeOrganizationId, sessionId)
    const nextTitle = baseSession.messages.length === 0 ? content.slice(0, 72) || 'New chat' : baseSession.title

    setChatSession({
      ...baseSession,
      title: nextTitle,
      updatedAt: new Date().toISOString(),
      config: {
        ...baseSession.config,
        organizationId: activeOrganizationId,
        providerSettingId: selectedProviderSetting.id ?? null,
        modelId: selectedModelId,
        agentPresetId: selectedAgentPresetId,
      },
      messages: [...baseSession.messages, userMessage, assistantMessage],
    })

    const controller = new AbortController()
    abortControllerRef.current = controller
    setIsGenerating(true)
    setIsPinnedToBottom(true)

    streamWorkspaceChat(
      {
        sessionId,
        organizationId: activeOrganizationId,
        provider: selectedProviderSetting.provider ?? '',
        model: selectedModelId,
        message: content,
      },
      (event) => enqueueEvent(event),
      controller.signal,
    )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : 'Failed to reach the server.'
        enqueueEvent({ type: 'error', message })
      })
      .finally(() => {
        flushPendingEvents()
        if (abortControllerRef.current === controller) {
          setIsGenerating(false)
          abortControllerRef.current = null
        }
      })
  }

  // This page's real job is pre-rollout validation, not day-to-day
  // productivity - an admin uses it to confirm a provider/MCP server/
  // connector/corpus is actually reachable before an employee ever sees it
  // via seshat-desktop. Starters reflect that: one per thing that can be
  // misconfigured (Providers, MCP Servers, Connectors, Knowledge), each
  // prompt phrased so the model's own reply is the pass/fail signal.
  const STARTER_PROMPTS = [
    {
      icon: '🔌',
      label: 'Test this provider',
      sub: 'Confirm the selected LLM responds',
      prompt: 'Reply with a short hello and tell me exactly which model you are, to confirm this provider is wired up correctly.',
    },
    {
      icon: '🛠️',
      label: 'Test MCP servers',
      sub: 'Confirm registered MCP tools are reachable',
      prompt: 'List every tool and MCP server currently available to you, then call one of them to confirm it actually works end-to-end.',
    },
    {
      icon: '🔗',
      label: 'Test a connector',
      sub: 'Confirm an OAuth-connected account works',
      prompt: 'Run a web search for today\'s date and summarize one result, to confirm the web search connector is working.',
    },
    {
      icon: '📚',
      label: 'Test knowledge search',
      sub: 'Confirm RAG retrieval from a corpus',
      prompt: 'Search the knowledge base for anything indexed and quote a short snippet back to me, to confirm RAG retrieval is working.',
    },
  ]

  const handleSelectPrompt = (promptText: string) => {
    setDraftPrompt(promptText)
  }

  return (
    <div className="workspace-chat-page">
      <div className="workspace-chat-page__inner">
        <div className="workspace-chat-topbar">
          <span className="workspace-chat-title">{currentTitle}</span>

          <Space size={10} wrap>
            {agentOptions.length > 0 ? (
              <Select
                value={selectedAgentPresetId ?? undefined}
                onChange={(value) => setSelectedAgentPresetId(value ?? null)}
                allowClear
                placeholder="Default agent"
                options={agentOptions}
                className="workspace-chat-select workspace-chat-select--top"
                popupMatchSelectWidth={false}
              />
            ) : null}
            {hasMessages ? (
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                onClick={handleReset}
                className="workspace-chat-topbar__action"
              >
                New chat
              </Button>
            ) : null}
          </Space>
        </div>

        <div className="workspace-chat-stage">
          {isLoadingHistory ? (
            <div className="workspace-chat-empty">
              <Typography.Text type="secondary">Loading conversation…</Typography.Text>
            </div>
          ) : hasMessages ? (
            <div className="workspace-chat-thread">
              {chatSession?.messages.map((message) => (
                <WorkspaceChatMessage key={message.id} message={message} />
              ))}
            </div>
          ) : (
            <div className="workspace-chat-empty">
              <div className="workspace-chat-empty__badge">
                <span>✦</span> Workspace Assistant
              </div>
              <Typography.Title level={2} className="workspace-chat-empty__title">
                How can I help you today?
              </Typography.Title>
              <Typography.Text className="workspace-chat-empty__copy">
                Validate a provider, MCP server, connector or knowledge corpus here before your team uses it in Seshat Desktop.
              </Typography.Text>

              <div className="workspace-prompt-chips">
                {STARTER_PROMPTS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="workspace-prompt-chip"
                    onClick={() => handleSelectPrompt(item.prompt)}
                  >
                    <span className="workspace-prompt-chip__icon">{item.icon}</span>
                    <div className="workspace-prompt-chip__content">
                      <span className="workspace-prompt-chip__label">{item.label}</span>
                      <span className="workspace-prompt-chip__sub">{item.sub}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {!isPinnedToBottom && hasMessages ? (
          <Button
            shape="circle"
            className="workspace-chat-scroll-button"
            icon={<ArrowDownOutlined />}
            onClick={() => {
              const el = getScrollContainer()
              el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
            }}
            aria-label="Scroll to latest message"
          />
        ) : null}

        <div className="workspace-chat-composer-wrap">
          <div className="workspace-chat-composer">
            <Input.TextArea
              value={draftPrompt}
              autoSize={{ minRows: 1, maxRows: 8 }}
              variant="borderless"
              placeholder="Ask anything or request an action..."
              className="workspace-chat-composer__input"
              disabled={isLoadingHistory}
              onChange={(event) => setDraftPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  handleSend()
                }
              }}
            />

            <div className="workspace-chat-composer__toolbar">
              <div className="workspace-chat-composer__tools">
                <Tooltip title="Attach files (coming soon)">
                  <Button
                    type="text"
                    icon={<PlusOutlined />}
                    className="workspace-chat-composer__attach"
                    aria-label="Attach files"
                  />
                </Tooltip>
              </div>

              <div className="workspace-chat-composer__selectors">
                <Select
                  value={selectedProviderSettingId ?? undefined}
                  onChange={(value) => {
                    setSelectedProviderSettingId(value ?? null)
                    setComposerError(null)
                  }}
                  placeholder="Provider"
                  options={providerOptions}
                  className="workspace-chat-select workspace-chat-select--composer workspace-chat-select--provider"
                  popupMatchSelectWidth={false}
                  disabled={isGenerating}
                  variant="borderless"
                  size="small"
                />
                <Select
                  value={selectedModelId ?? undefined}
                  onChange={(value) => {
                    setSelectedModelId(value ?? null)
                    setComposerError(null)
                  }}
                  placeholder="Model"
                  options={modelOptions.map((model) => ({
                    label: model.label,
                    value: model.id,
                    title: model.description,
                    description: model.description,
                  }))}
                  optionRender={(option) => (
                    <div className="workspace-model-option">
                      <span className="workspace-model-option__label">{option.label}</span>
                      {option.data.description ? (
                        <span className="workspace-model-option__description">{option.data.description}</span>
                      ) : null}
                    </div>
                  )}
                  popupMatchSelectWidth={280}
                  className="workspace-chat-select workspace-chat-select--composer"
                  disabled={modelOptions.length === 0 || isGenerating}
                  variant="borderless"
                  size="small"
                />

                <Tooltip title={isGenerating ? 'Stop generating' : 'Send message'}>
                  <Button
                    type="primary"
                    danger={isGenerating}
                    icon={isGenerating ? <StopFilled /> : <SendOutlined />}
                    className="workspace-chat-composer__send"
                    onClick={isGenerating ? handleStop : handleSend}
                    disabled={isLoadingHistory || (!isGenerating && !draftPrompt.trim())}
                  />
                </Tooltip>
              </div>
            </div>
          </div>

          {composerError ? (
            <div style={{ marginTop: 8, padding: '4px 8px', borderRadius: 6, background: palette.dangerSoft, color: palette.danger, fontSize: 12.5 }}>
              {composerError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
