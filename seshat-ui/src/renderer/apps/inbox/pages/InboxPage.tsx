import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  Caution,
  Inbox as InboxIcon,
  LoadingOne,
  Mail,
  Refresh,
  Search,
  Send,
} from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { streamingToContentBlocks, useSessionStore } from '@/stores/session'
import { isRenderableMessage } from '@/components/chat/MessageItem'
import { useChat } from '@/hooks/useChat'
import { useProviders, fetchProviderModels } from '@/hooks/useProviders'
import { useProvidersStore } from '@/stores/providers'
import { SelectorPill, SelectorMenu } from '@/components/ui/SelectorPill'
import type { ProviderModel } from '@/api/types'
import type { Attachment, ChannelAccount, OAuthChannel, Thread, ThreadMessage } from '../api/types'
import { consumeWhatsAppPairStream } from '../api/whatsappPairing'
import { AccountsPanel } from '../components/AccountsPanel'
import { ConnectorsDrawer } from '../components/ConnectorsDrawer'
import { InboxAgentPanel } from '../components/InboxAgentPanel'
import { ThreadDetailPane } from '../components/ThreadDetailPane'
import { ThreadListPane } from '../components/ThreadListPane'
import { WhatsAppPairingModal } from '../components/WhatsAppPairingModal'
import { buildInboxAgentPrompt } from '../lib/agentPrompt'
import { loadChatModelPreference, saveChatModelPreference } from '../lib/chatPreference'
import {
  THREADS_PAGE_SIZE,
  channelLabel,
  displayContact,
} from '../lib/inboxDisplay'
import '../styles/inbox.css'

export function InboxPage() {
  const [view, setView] = useState<'inbox' | 'accounts'>('inbox')
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null)
  const [agentPrompt, setAgentPrompt] = useState('')
  const [pendingAgentMessage, setPendingAgentMessage] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<ChannelAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('open')
  const [channelFilter, setChannelFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [threads, setThreads] = useState<Thread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(false)
  const [threadsLoadingMore, setThreadsLoadingMore] = useState(false)
  const [threadsHasMore, setThreadsHasMore] = useState(false)
  const [threadsOffset, setThreadsOffset] = useState(0)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [messagesLoadingMore, setMessagesLoadingMore] = useState(false)
  const [messagesHasMore, setMessagesHasMore] = useState(false)
  const [messagesOffset, setMessagesOffset] = useState(0)
  const [channelMenuOpen, setChannelMenuOpen] = useState(false)
  const [launchingAgent, setLaunchingAgent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null)

  const [connectorsDrawerOpen, setConnectorsDrawerOpen] = useState(false)
  const [connectingChannel, setConnectingChannel] = useState<OAuthChannel | null>(null)
  const [whatsappPairing, setWhatsappPairing] = useState<{ qr: string | null; error: string | null } | null>(null)
  const pairAbortRef = useRef<AbortController | null>(null)
  const oauthPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelMenuRef = useRef<HTMLDivElement | null>(null)

  // Lets the user pick which provider/model answers Inbox Agent chat
  // messages, mirroring the Knowledge Agent chat's picker - the choice is
  // persisted (see INBOX_CHAT_PREFERENCE_KEY above) since the Inbox Agent's
  // session is reused indefinitely, not reset per visit.
  const { loading: providersLoading } = useProviders()
  const providers = useProvidersStore((s) => s.providers)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModel[]>>({})
  const [loadingModelsFor, setLoadingModelsFor] = useState<string | null>(null)
  const hasAppliedStoredPreference = useRef(false)

  const connectedAccounts = accounts.filter((a) => a.status === 'connected')
  const syncableAccounts = connectedAccounts.filter((account) => account.channel === 'gmail')
  const accountsInError = accounts.filter((a) => a.status === 'error')
  const openCount = threads.filter((t) => t.status === 'open').length
  const availableChannels = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.channel))),
    [accounts],
  )
  const filteredThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return threads.filter((thread) => {
      if (channelFilter !== 'all' && thread.channel !== channelFilter) return false
      if (!q) return true
      return displayContact(thread).toLowerCase().includes(q) || (thread.subject ?? '').toLowerCase().includes(q)
    })
  }, [channelFilter, searchQuery, threads])
  const latestInboxSession = useSessionStore((s) => {
    return s.sessions
      .filter((session) => session.source === 'inbox')
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())[0]
  })
  const agentSession = useSessionStore((s) => (agentSessionId ? s.sessions.find((session) => session.id === agentSessionId) : undefined))
  const agentMessages = useMemo(() => agentSession?.messages.filter(isRenderableMessage) ?? [], [agentSession])
  const { sendMessage: sendAgentMessage, stopMessage: stopAgentMessage, isStreaming: agentStreaming } = useChat(agentSessionId ?? '')

  useEffect(() => {
    if (!agentSessionId && latestInboxSession) setAgentSessionId(latestInboxSession.id)
  }, [agentSessionId, latestInboxSession])

  const selectedModels = useMemo(
    () => (selectedProviderId ? (modelsByProvider[selectedProviderId] ?? []) : []),
    [selectedProviderId, modelsByProvider],
  )
  const hasLoadedSelectedProviderModels = selectedProviderId
    ? Object.prototype.hasOwnProperty.call(modelsByProvider, selectedProviderId)
    : false

  useEffect(() => {
    if (hasAppliedStoredPreference.current || providersLoading || providers.length === 0) return
    hasAppliedStoredPreference.current = true
    const stored = loadChatModelPreference()
    const provider = (stored && providers.find((p) => p.id === stored.providerSettingId))
      ?? providers.find((p) => p.is_default)
      ?? providers[0]
    setSelectedProviderId(provider.id)
    if (stored && stored.providerSettingId === provider.id) setSelectedModelId(stored.modelId)
  }, [providers, providersLoading])

  useEffect(() => {
    if (!selectedProviderId) return
    if (!providers.some((provider) => provider.id === selectedProviderId)) {
      setSelectedProviderId(null)
      setSelectedModelId(null)
    }
  }, [providers, selectedProviderId])

  useEffect(() => {
    if (!selectedProviderId || modelsByProvider[selectedProviderId]) return
    let cancelled = false
    setLoadingModelsFor(selectedProviderId)
    fetchProviderModels(selectedProviderId)
      .then((models) => {
        if (cancelled) return
        setModelsByProvider((current) => ({ ...current, [selectedProviderId]: models }))
      })
      .catch(() => {
        if (cancelled) return
        setModelsByProvider((current) => ({ ...current, [selectedProviderId]: [] }))
      })
      .finally(() => {
        if (!cancelled) setLoadingModelsFor((current) => (current === selectedProviderId ? null : current))
      })
    return () => { cancelled = true }
  }, [modelsByProvider, selectedProviderId])

  useEffect(() => {
    if (!hasLoadedSelectedProviderModels || selectedModelId || selectedModels.length === 0) return
    const def = selectedModels.find((m) => m.is_default) ?? selectedModels[0]
    setSelectedModelId(def.model_id)
  }, [hasLoadedSelectedProviderModels, selectedModelId, selectedModels])

  useEffect(() => {
    if (!selectedModelId || !hasLoadedSelectedProviderModels) return
    if (!selectedModels.some((model) => model.model_id === selectedModelId)) setSelectedModelId(null)
  }, [hasLoadedSelectedProviderModels, selectedModelId, selectedModels])

  useEffect(() => {
    if (!hasAppliedStoredPreference.current) return
    if (selectedProviderId && selectedModelId) {
      saveChatModelPreference({ providerSettingId: selectedProviderId, modelId: selectedModelId })
    }
  }, [selectedProviderId, selectedModelId])

  useEffect(() => {
    if (!channelMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!channelMenuRef.current?.contains(e.target as Node)) setChannelMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [channelMenuOpen])

  useEffect(() => {
    if (!agentSessionId || !pendingAgentMessage) return
    const prompt = pendingAgentMessage
    setPendingAgentMessage(null)
    void sendAgentMessage(prompt, { agentSlug: 'inbox-agent', providerSettingId: selectedProviderId, modelId: selectedModelId })
  }, [agentSessionId, pendingAgentMessage, sendAgentMessage, selectedProviderId, selectedModelId])

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try {
      const res = await api.get<{ accounts: ChannelAccount[] }>('/inbox/accounts')
      setAccounts(res.accounts ?? [])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load inbox accounts.')
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  const loadThreads = useCallback(async (status: string, offset = 0, append = false) => {
    if (append) setThreadsLoadingMore(true)
    else setThreadsLoading(true)
    try {
      const res = await api.get<{ threads: Thread[]; has_more: boolean }>(
        `/inbox/threads?status=${encodeURIComponent(status)}&limit=${THREADS_PAGE_SIZE}&offset=${offset}`,
      )
      const page = res.threads ?? []
      setThreads((prev) => (append ? [...prev, ...page] : page))
      setThreadsHasMore(res.has_more ?? false)
      setThreadsOffset(offset + page.length)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load threads.')
    } finally {
      if (append) setThreadsLoadingMore(false)
      else setThreadsLoading(false)
    }
  }, [])

  const loadThread = useCallback(async (id: string, offset = 0, prepend = false) => {
    if (prepend) setMessagesLoadingMore(true)
    else setThreadLoading(true)
    try {
      const res = await api.get<{ thread: Thread; messages: ThreadMessage[]; messages_has_more: boolean }>(
        `/inbox/threads/${id}?message_offset=${offset}`,
      )
      const page = res.messages ?? []
      setSelectedThread(res.thread)
      setMessages((prev) => (prepend ? [...page, ...prev] : page))
      setMessagesHasMore(res.messages_has_more ?? false)
      setMessagesOffset(offset + page.length)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load thread.')
    } finally {
      if (prepend) setMessagesLoadingMore(false)
      else setThreadLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    void loadThreads(statusFilter)
    setSelectedThreadId(null)
    setSelectedThread(null)
    setMessages([])
  }, [loadThreads, statusFilter])

  useEffect(() => {
    if (selectedThreadId) void loadThread(selectedThreadId)
  }, [loadThread, selectedThreadId])

  useEffect(() => {
    return () => {
      if (oauthPollRef.current) clearInterval(oauthPollRef.current)
      pairAbortRef.current?.abort()
    }
  }, [])

  function selectThread(thread: Thread) {
    setSelectedThreadId(thread.id)
    setError(null)
  }

  async function refreshCurrentThread() {
    await loadAccounts()
    await loadThreads(statusFilter)
    if (selectedThreadId) await loadThread(selectedThreadId)
  }

  function loadMoreThreads() {
    if (threadsLoadingMore || !threadsHasMore) return
    void loadThreads(statusFilter, threadsOffset, true)
  }

  function loadEarlierMessages() {
    if (!selectedThreadId || messagesLoadingMore || !messagesHasMore) return
    void loadThread(selectedThreadId, messagesOffset, true)
  }

  async function handleUpdateStatus(status: string) {
    if (!selectedThreadId) return
    setError(null)
    try {
      await api.patch(`/inbox/threads/${selectedThreadId}`, { status })
      await refreshCurrentThread()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update status.')
    }
  }

  async function handleSyncNow(accountId: string) {
    setSyncingAccountId(accountId)
    setError(null)
    try {
      await api.post(`/inbox/accounts/${accountId}/sync`)
      await refreshCurrentThread()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sync failed.')
    } finally {
      setSyncingAccountId(null)
    }
  }

  async function handleSyncAll() {
    for (const account of syncableAccounts) {
      await handleSyncNow(account.id)
    }
  }

  async function handleDisconnect(accountId: string) {
    setError(null)
    try {
      await api.delete(`/inbox/accounts/${accountId}`)
      await loadAccounts()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to disconnect.')
    }
  }

  async function downloadAttachment(messageId: string, attachment: Attachment) {
    if (!selectedThreadId) return
    try {
      const dataUrl = await api.getFileDataURL(
        `/inbox/threads/${selectedThreadId}/messages/${messageId}/attachments/${attachment.id}`,
      )
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = attachment.filename
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to download attachment.')
    }
  }

  // Shared by gmail/outlook/teams - all three expose the identical
  // "POST oauth/start -> open the system browser -> poll /inbox/accounts
  // for a new row of this channel" shape (see api/inbox.go's
  // handleInbox{Gmail,Microsoft}OAuthStart). A 503 here (BaseOAuthConfig
  // failing) means this deployment never configured that channel's OAuth
  // client - surfaced through the same error banner as any other failure,
  // not a separate "not configured" state, since that's exactly what the
  // backend already reports.
  async function handleConnectOAuthChannel(channel: OAuthChannel) {
    setConnectingChannel(channel)
    setError(null)
    try {
      const started = await api.post<{ authorization_url: string }>(`/inbox/accounts/${channel}/oauth/start`)
      if (window.nexus?.openExternal) {
        await window.nexus.openExternal(started.authorization_url)
      } else {
        window.open(started.authorization_url, '_blank', 'noopener,noreferrer')
      }
      const knownIds = new Set(accounts.map((a) => a.id))
      let attempts = 0
      if (oauthPollRef.current) clearInterval(oauthPollRef.current)
      oauthPollRef.current = setInterval(async () => {
        attempts++
        try {
          const res = await api.get<{ accounts: ChannelAccount[] }>('/inbox/accounts')
          setAccounts(res.accounts ?? [])
          const connected = (res.accounts ?? []).some((a) => !knownIds.has(a.id) && a.channel === channel)
          if (connected) {
            if (oauthPollRef.current) clearInterval(oauthPollRef.current)
            oauthPollRef.current = null
            setConnectingChannel(null)
            setConnectorsDrawerOpen(false)
            await loadThreads(statusFilter)
            return
          }
        } catch {
          // Keep polling until the attempt budget expires.
        }
        if (attempts >= 30 && oauthPollRef.current) {
          clearInterval(oauthPollRef.current)
          oauthPollRef.current = null
          setConnectingChannel(null)
        }
      }, 2000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Unable to start ${channelLabel(channel)} connection.`)
      setConnectingChannel(null)
    }
  }

  async function handleConnectWhatsApp() {
    setWhatsappPairing({ qr: null, error: null })
    setError(null)
    const controller = new AbortController()
    pairAbortRef.current = controller

    const onQR = async (code: string) => {
      try {
        const dataUrl = await QRCode.toDataURL(code, { margin: 1, width: 260 })
        setWhatsappPairing({ qr: dataUrl, error: null })
      } catch {
        // The next QR rotation will retry.
      }
    }
    const onDone = async () => {
      setWhatsappPairing(null)
      await refreshCurrentThread()
    }
    const onError = (message: string) => {
      setWhatsappPairing({ qr: null, error: message })
    }

    void consumeWhatsAppPairStream(controller.signal, onQR, onDone, onError)
  }

  function cancelWhatsAppPairing() {
    pairAbortRef.current?.abort()
    setWhatsappPairing(null)
  }

  async function ensureInboxAgentSession(): Promise<string | null> {
    if (agentSessionId) return agentSessionId
    const existing = useSessionStore.getState().sessions
      .filter((session) => session.source === 'inbox')
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())[0]
    if (existing) {
      setAgentSessionId(existing.id)
      return existing.id
    }
    try {
      const created = await api.post<{ session_id: string; title?: string; created_at?: number; updated_at?: number }>('/sessions', {
        title: 'Inbox Agent',
        source: 'inbox',
      })
      useSessionStore.getState().addSession({
        id: created.session_id,
        title: created.title ?? 'Inbox Agent',
        messages: [],
        createdAt: new Date((created.created_at ?? 0) * 1000 || Date.now()).toISOString(),
        updatedAt: new Date((created.updated_at ?? created.created_at ?? 0) * 1000 || Date.now()).toISOString(),
        source: 'inbox',
      })
      setAgentSessionId(created.session_id)
      return created.session_id
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to start the Inbox Agent chat.')
      return null
    }
  }

  async function handleAskInboxAgentForThread() {
    setLaunchingAgent(true)
    setError(null)
    try {
      const id = await ensureInboxAgentSession()
      if (!id) return
      setPendingAgentMessage(buildInboxAgentPrompt(selectedThread, messages))
    } finally {
      setLaunchingAgent(false)
    }
  }

  async function handleStartInboxReview() {
    setLaunchingAgent(true)
    setError(null)
    try {
      const id = await ensureInboxAgentSession()
      if (!id) return
      setPendingAgentMessage(buildInboxAgentPrompt(selectedThread, messages))
    } finally {
      setLaunchingAgent(false)
    }
  }

  async function handleSendAgentPrompt() {
    const prompt = agentPrompt.trim()
    if (!prompt) return
    const id = await ensureInboxAgentSession()
    if (!id) return
    setAgentPrompt('')
    setPendingAgentMessage(prompt)
  }

  const handleAgentPermissionDecision = useCallback(async (toolUseId: string, approved: boolean, remember = false) => {
    if (!agentSessionId) return
    const current = useSessionStore.getState()
    const nextStreaming = current.getStreaming(agentSessionId).map((block) => {
      if (block.type !== 'tool_use' || block.id !== toolUseId) return block
      return {
        ...block,
        _status: approved ? ('running' as const) : ('failed' as const),
        _approval: undefined,
      }
    })
    current.setStreaming(agentSessionId, nextStreaming)
    const lastAssistant = [...(current.sessions.find((item) => item.id === agentSessionId)?.messages ?? [])]
      .reverse()
      .find((message) => message.role === 'assistant')
    if (lastAssistant?.id) {
      current.updateMessage(agentSessionId, lastAssistant.id, (message) => ({
        ...message,
        content: streamingToContentBlocks(nextStreaming),
      }))
    }
    current.updateAgentState(agentSessionId, { pendingPermission: null })
    try {
      await api.post(`/permissions/${toolUseId}`, { approved, remember, session_id: agentSessionId })
    } catch {
      // The stream will surface the final error if the permission bridge is gone.
    }
  }, [agentSessionId])

  const handleAgentPromptSubmission = useCallback(async (promptId: string, value: unknown) => {
    if (!agentSessionId) return
    const current = useSessionStore.getState()
    const nextStreaming = current.getStreaming(agentSessionId).map((block) => {
      if (block.type !== 'tool_use' || block.name !== 'ask_user_question' || block._prompt?.promptId !== promptId) return block
      return {
        ...block,
        _prompt: undefined,
        _message: 'Waiting for the tool result...',
      }
    })
    current.setStreaming(agentSessionId, nextStreaming)
    const lastAssistant = [...(current.sessions.find((item) => item.id === agentSessionId)?.messages ?? [])]
      .reverse()
      .find((message) => message.role === 'assistant')
    if (lastAssistant?.id) {
      current.updateMessage(agentSessionId, lastAssistant.id, (message) => ({
        ...message,
        content: streamingToContentBlocks(nextStreaming),
      }))
    }
    try {
      await api.post(`/prompts/${promptId}`, { value, session_id: agentSessionId })
    } catch {
      // The stream will surface the final error if the prompt bridge is gone.
    }
  }, [agentSessionId])

  const approveAgentTool = useCallback((toolUseId: string, remember?: boolean) => {
    void handleAgentPermissionDecision(toolUseId, true, remember)
  }, [handleAgentPermissionDecision])

  const denyAgentTool = useCallback((toolUseId: string) => {
    void handleAgentPermissionDecision(toolUseId, false)
  }, [handleAgentPermissionDecision])

  const submitAgentToolPrompt = useCallback((promptId: string, value: unknown) => {
    void handleAgentPromptSubmission(promptId, value)
  }, [handleAgentPromptSubmission])

  return (
    <div className="ib-root">
      <main className="ib-content">
        <section className="ib-toolbar">
          <div className="ib-toolbar-heading">
            <h1>Inbox</h1>
          </div>
          <div className="ib-view-tabs" role="tablist" aria-label="Inbox sections">
            <button type="button" className={view === 'inbox' ? 'active' : ''} onClick={() => setView('inbox')}>
              <InboxIcon size={13} /> Inbox
            </button>
            <button type="button" className={view === 'accounts' ? 'active' : ''} onClick={() => setView('accounts')}>
              <Mail size={13} /> Accounts
            </button>
          </div>
          <div className="ib-toolbar-actions">
            <button type="button" className="ib-action-btn" onClick={handleSyncAll} disabled={syncableAccounts.length === 0 || Boolean(syncingAccountId)}>
              {syncingAccountId ? <LoadingOne size={13} className="spin" /> : <Refresh size={13} />} Sync
            </button>
          </div>
        </section>

        {view === 'inbox' ? (
          <section className="ib-main ib-inbox-page">
            {error && <div className="ib-error-banner"><Caution size={13} /> {error}</div>}
            <div className="ib-search-row">
              <div className="ib-searchbox ib-searchbox-large">
                <Search size={15} />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search visible threads" />
              </div>
              <div className="chat-selector-wrap ib-channel-selector" ref={channelMenuRef}>
                <SelectorPill
                  label={channelFilter === 'all' ? 'All channels' : channelLabel(channelFilter)}
                  icon={<Mail size={12} />}
                  onClick={() => setChannelMenuOpen((current) => !current)}
                />
                {channelMenuOpen && (
                  <SelectorMenu
                    options={[
                      { id: 'all', label: 'All channels' },
                      ...availableChannels.map((channel) => ({ id: channel, label: channelLabel(channel) })),
                    ]}
                    selectedId={channelFilter}
                    align="right"
                    onSelect={(id) => {
                      setChannelFilter(id)
                      setChannelMenuOpen(false)
                    }}
                  />
                )}
              </div>
              <button
                type="button"
                className="ib-action-btn primary"
                onClick={handleStartInboxReview}
                disabled={connectedAccounts.length === 0 || launchingAgent || agentStreaming}
                title="Ask the Inbox Agent to review every connected channel"
              >
                {launchingAgent || agentStreaming ? <LoadingOne size={13} className="spin" /> : <Send size={13} />} Scan inbox
              </button>
            </div>
            <div className="ib-inbox-grid">
              <InboxAgentPanel
                sessionId={agentSessionId ?? undefined}
                messages={agentMessages}
                prompt={agentPrompt}
                isStreaming={agentStreaming}
                selectedProviderId={selectedProviderId}
                selectedModelId={selectedModelId}
                selectedModels={selectedModels}
                providers={providers}
                hasLoadedSelectedProviderModels={hasLoadedSelectedProviderModels}
                loadingModelsFor={loadingModelsFor}
                onPromptChange={setAgentPrompt}
                onSend={handleSendAgentPrompt}
                onStop={() => { void stopAgentMessage() }}
                onProviderSelect={(id) => { setSelectedProviderId(id); setSelectedModelId(null) }}
                onModelSelect={setSelectedModelId}
                onApproveTool={approveAgentTool}
                onDenyTool={denyAgentTool}
                onSubmitToolPrompt={submitAgentToolPrompt}
              />
              <div className="ib-thread-shell">
                <ThreadListPane
                  accountsCount={accounts.length}
                  threads={filteredThreads}
                  selectedThreadId={selectedThreadId}
                  statusFilter={statusFilter}
                  threadsLoading={threadsLoading}
                  threadsHasMore={threadsHasMore}
                  threadsLoadingMore={threadsLoadingMore}
                  onStatusFilterChange={setStatusFilter}
                  onSelectThread={selectThread}
                  onLoadMore={loadMoreThreads}
                  onGoToAccounts={() => setView('accounts')}
                />
                <ThreadDetailPane
                  accountsCount={accounts.length}
                  selectedThreadId={selectedThreadId}
                  selectedThread={selectedThread}
                  messages={messages}
                  threadLoading={threadLoading}
                  messagesHasMore={messagesHasMore}
                  messagesLoadingMore={messagesLoadingMore}
                  launchingAgent={launchingAgent}
                  onAskAgent={handleAskInboxAgentForThread}
                  onUpdateStatus={handleUpdateStatus}
                  onLoadEarlierMessages={loadEarlierMessages}
                  onDownloadAttachment={downloadAttachment}
                />
              </div>
            </div>
          </section>
        ) : (
          <AccountsPanel
            accounts={accounts}
            accountsLoading={accountsLoading}
            connectedCount={connectedAccounts.length}
            accountsInErrorCount={accountsInError.length}
            syncableCount={syncableAccounts.length}
            openCount={openCount}
            syncingAccountId={syncingAccountId}
            error={error}
            onRefresh={loadAccounts}
            onOpenConnectors={() => setConnectorsDrawerOpen(true)}
            onSyncNow={handleSyncNow}
            onDisconnect={handleDisconnect}
          />
        )}
      </main>

      {connectorsDrawerOpen && (
        <ConnectorsDrawer
          accounts={accounts}
          connectingChannel={connectingChannel}
          whatsappPairingActive={Boolean(whatsappPairing)}
          onClose={() => setConnectorsDrawerOpen(false)}
          onConnect={(channel) => {
            if (channel === 'whatsapp') void handleConnectWhatsApp()
            else void handleConnectOAuthChannel(channel)
          }}
        />
      )}

      {whatsappPairing && (
        <WhatsAppPairingModal
          qr={whatsappPairing.qr}
          error={whatsappPairing.error}
          onCancel={cancelWhatsAppPairing}
        />
      )}
    </div>
  )
}
