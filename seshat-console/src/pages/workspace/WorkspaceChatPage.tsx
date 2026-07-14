import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, Select, Space, Tooltip, Typography } from 'antd'
import { ArrowDownOutlined, DownOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons'
import { useAgentPresetsList } from '@/api/agentPresets'
import { useProviderSettingsList } from '@/api/providerSettings'
import { ProviderIcon } from '@/components/ProviderIcon'
import { WorkspaceChatMessage } from '@/components/workspace/WorkspaceChatMessage'
import { getProviderLabel, getProviderModels } from '@/lib/providerCatalog'
import { createWorkspaceChatMessage, createWorkspaceChatSession } from '@/features/workspaceChat/storage'
import { streamWorkspaceChat } from '@/features/workspaceChat/transport'
import type { WorkspaceChatEvent, WorkspaceChatSession, WorkspaceTraceStep } from '@/features/workspaceChat/types'
import { useAuthStore } from '@/store/auth'
import { useWorkspaceOrganizationStore } from '@/store/workspaceOrganization'

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

const NEAR_BOTTOM_THRESHOLD_PX = 120

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

  const abortControllerRef = useRef<AbortController | null>(null)
  const activeThinkingIdRef = useRef<string | null>(null)
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null)

  const providerSettings = useProviderSettingsList(activeOrganizationId)
  const agentPresets = useAgentPresetsList(activeOrganizationId)

  useEffect(() => {
    abortControllerRef.current?.abort()
    const next = createWorkspaceChatSession({ organizationId: activeOrganizationId ?? null })
    setChatSession(next)
    setDraftPrompt('')
    setComposerError(null)
    setIsGenerating(false)
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
    () => getProviderModels(selectedProviderSetting?.provider, selectedProviderSetting?.default_model),
    [selectedProviderSetting?.provider, selectedProviderSetting?.default_model],
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
    if (isPinnedToBottom) bottomSentinelRef.current?.scrollIntoView({ block: 'end' })
  }, [chatSession?.messages, isPinnedToBottom])

  useEffect(() => {
    function handleScroll() {
      const distanceFromBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight
      setIsPinnedToBottom(distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => () => abortControllerRef.current?.abort(), [])

  const providerOptions = (providerSettings.data ?? []).map((setting) => ({
    label: (
      <Space size={10} align="center">
        <ProviderIcon provider={setting.provider ?? 'provider'} size={22} />
        <span>{getProviderLabel(setting.provider)}</span>
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

  const handleReset = () => {
    abortControllerRef.current?.abort()
    setIsGenerating(false)
    const next = createWorkspaceChatSession({
      organizationId: activeOrganizationId ?? null,
      providerSettingId: selectedProviderSettingId,
      modelId: selectedModelId ?? '',
      agentPresetId: selectedAgentPresetId,
    })
    setChatSession(next)
    setDraftPrompt('')
    setComposerError(null)
  }

  const handleSend = () => {
    const content = draftPrompt.trim()
    if (!content || isGenerating) return
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
      (event) => {
        setChatSession((current) => (current ? applyEventToSession(current, event, activeThinkingIdRef) : current))
      },
      controller.signal,
    )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : 'Failed to reach the server.'
        setChatSession((current) => (current ? applyEventToSession(current, { type: 'error', message }, activeThinkingIdRef) : current))
      })
      .finally(() => {
        if (abortControllerRef.current === controller) {
          setIsGenerating(false)
          abortControllerRef.current = null
        }
      })
  }

  return (
    <div className="workspace-chat-page">
      <div className="workspace-chat-page__inner">
        <div className="workspace-chat-topbar">
          <button className="workspace-chat-title" type="button">
            <span>{currentTitle}</span>
            <DownOutlined />
          </button>

          <Space size={12} wrap>
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
            <Button type="text" icon={<PlusOutlined />} onClick={handleReset} className="workspace-chat-topbar__action">
              New chat
            </Button>
          </Space>
        </div>

        <div className="workspace-chat-stage">
          {hasMessages ? (
            <div className="workspace-chat-thread">
              {chatSession?.messages.map((message) => (
                <WorkspaceChatMessage key={message.id} message={message} />
              ))}
              <div ref={bottomSentinelRef} />
            </div>
          ) : (
            <div className="workspace-chat-empty">
              <Typography.Title level={2} style={{ margin: 0 }}>
                Start a real chat flow
              </Typography.Title>
              <Typography.Text type="secondary" className="workspace-chat-empty__copy">
                Talk to a real LLM using this organization's configured providers, with web search, knowledge search, and document
                reading available as tools.
              </Typography.Text>
            </div>
          )}
        </div>

        {!isPinnedToBottom && hasMessages ? (
          <Button
            shape="circle"
            className="workspace-chat-scroll-button"
            icon={<ArrowDownOutlined />}
            onClick={() => bottomSentinelRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })}
            aria-label="Scroll to latest message"
          />
        ) : null}

        <div className="workspace-chat-composer-wrap">
          <div className="workspace-chat-composer">
            <Input.TextArea
              value={draftPrompt}
              autoSize={{ minRows: 1, maxRows: 8 }}
              variant="borderless"
              placeholder="Write a message..."
              className="workspace-chat-composer__input"
              onChange={(event) => setDraftPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  handleSend()
                }
              }}
            />

            <div className="workspace-chat-composer__toolbar">
              <Button type="text" icon={<PlusOutlined />} className="workspace-chat-composer__icon" />

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
                />
              </div>

              <Tooltip title={isGenerating ? 'Generating…' : 'Send'}>
                <Button
                  type="text"
                  icon={<SendOutlined />}
                  className="workspace-chat-composer__send"
                  onClick={handleSend}
                  loading={isGenerating}
                  disabled={isGenerating}
                />
              </Tooltip>
            </div>
          </div>

          {composerError ? <Typography.Text type="danger">{composerError}</Typography.Text> : null}
        </div>
      </div>
    </div>
  )
}
