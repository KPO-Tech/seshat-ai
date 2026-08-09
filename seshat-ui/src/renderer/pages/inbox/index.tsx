import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import {
  AlarmClock,
  Caution,
  CheckOne,
  Close,
  Flag,
  Inbox as InboxIcon,
  LoadingOne,
  Mail,
  Message,
  Paperclip,
  Plus,
  Refresh,
  Robot,
  Save,
  Search,
  Send,
  Setting,
} from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { streamingToContentBlocks, useSessionStore } from '@/stores/session'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import { ChatInput, CHAT_INPUT_CSS } from '@/components/chat/ChatInput'
import { MessageItem, MESSAGE_ITEM_CSS, isRenderableMessage } from '@/components/chat/MessageItem'
import { useChat } from '@/hooks/useChat'

type ChannelAccount = {
  id: string
  channel: 'gmail' | 'whatsapp' | string
  display_name: string
  external_account_id: string
  status: string
  last_synced_at?: number
  last_error?: string
  created_at: number
}

type Contact = {
  id: string
  external_id: string
  display_name: string
  avatar_url?: string
}

type Thread = {
  id: string
  channel_account_id: string
  channel: string
  contact: Contact
  subject?: string
  status: 'open' | 'handled' | 'snoozed' | 'escalated' | string
  priority_score: number
  last_message_at: number
}

type Attachment = {
  id: string
  filename: string
  content_type: string
  size: number
}

type ThreadMessage = {
  id: string
  thread_id: string
  direction: 'inbound' | 'outbound' | string
  body_text: string
  attachments?: Attachment[]
  is_draft: boolean
  sent_at: number
}

const THREADS_PAGE_SIZE = 50

const STATUS_TABS: Array<{ id: string; label: string }> = [
  { id: 'open', label: 'Open' },
  { id: 'snoozed', label: 'Snoozed' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'handled', label: 'Handled' },
]

function channelIcon(channel: string, size = 13) {
  return channel === 'gmail' ? <Mail size={size} /> : <Message size={size} />
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(ts?: number): string {
  if (!ts) return 'Never'
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusTone(status: string): 'ok' | 'bad' | 'wait' {
  if (status === 'connected') return 'ok'
  if (status === 'error' || status === 'disconnected') return 'bad'
  return 'wait'
}

function displayContact(thread: Thread): string {
  return thread.contact.display_name || thread.contact.external_id || 'Unknown contact'
}

export function InboxPage() {
  const [view, setView] = useState<'triage' | 'accounts' | 'agent'>('triage')
  const [advancedOpen, setAdvancedOpen] = useState(false)
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
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [launchingAgent, setLaunchingAgent] = useState(false)
  const [automationCreating, setAutomationCreating] = useState(false)
  const [automationNotice, setAutomationNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null)

  const [gmailConnecting, setGmailConnecting] = useState(false)
  const [whatsappPairing, setWhatsappPairing] = useState<{ qr: string | null; error: string | null } | null>(null)
  const pairAbortRef = useRef<AbortController | null>(null)
  const gmailPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const agentScrollRef = useRef<HTMLDivElement | null>(null)

  const connectedAccounts = accounts.filter((a) => a.status === 'connected')
  const syncableAccounts = connectedAccounts.filter((account) => account.channel === 'gmail')
  const accountsInError = accounts.filter((a) => a.status === 'error')
  const openCount = threads.filter((t) => t.status === 'open').length
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
    const el = agentScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [agentMessages.length, agentStreaming])

  useEffect(() => {
    if (!agentSessionId && latestInboxSession) setAgentSessionId(latestInboxSession.id)
  }, [agentSessionId, latestInboxSession])

  useEffect(() => {
    if (!agentSessionId || !pendingAgentMessage) return
    const prompt = pendingAgentMessage
    setPendingAgentMessage(null)
    void sendAgentMessage(prompt, { agentSlug: 'inbox-agent' })
  }, [agentSessionId, pendingAgentMessage, sendAgentMessage])

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
      if (gmailPollRef.current) clearInterval(gmailPollRef.current)
      pairAbortRef.current?.abort()
    }
  }, [])

  function selectThread(thread: Thread) {
    setSelectedThreadId(thread.id)
    setReplyText('')
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

  async function handleReply(send: boolean) {
    if (!selectedThreadId || !replyText.trim()) return
    setSending(true)
    setError(null)
    try {
      await api.post(`/inbox/threads/${selectedThreadId}/reply`, { body: replyText.trim(), send })
      setReplyText('')
      await refreshCurrentThread()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save the reply.')
    } finally {
      setSending(false)
    }
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

  async function handleConnectGmail() {
    setGmailConnecting(true)
    setError(null)
    try {
      const started = await api.post<{ authorization_url: string }>('/inbox/accounts/gmail/oauth/start')
      if (window.nexus?.openExternal) {
        await window.nexus.openExternal(started.authorization_url)
      } else {
        window.open(started.authorization_url, '_blank', 'noopener,noreferrer')
      }
      const knownIds = new Set(accounts.map((a) => a.id))
      let attempts = 0
      if (gmailPollRef.current) clearInterval(gmailPollRef.current)
      gmailPollRef.current = setInterval(async () => {
        attempts++
        try {
          const res = await api.get<{ accounts: ChannelAccount[] }>('/inbox/accounts')
          setAccounts(res.accounts ?? [])
          const connected = (res.accounts ?? []).some((a) => !knownIds.has(a.id) && a.channel === 'gmail')
          if (connected) {
            if (gmailPollRef.current) clearInterval(gmailPollRef.current)
            gmailPollRef.current = null
            setGmailConnecting(false)
            await loadThreads(statusFilter)
            return
          }
        } catch {
          // Keep polling until the attempt budget expires.
        }
        if (attempts >= 30 && gmailPollRef.current) {
          clearInterval(gmailPollRef.current)
          gmailPollRef.current = null
          setGmailConnecting(false)
        }
      }, 2000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to start Gmail connection.')
      setGmailConnecting(false)
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
      setView('agent')
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

  async function handleCreateInboxReviewJob() {
    setAutomationCreating(true)
    setAutomationNotice(null)
    setError(null)
    try {
      await api.post('/automation/jobs', {
        name: 'Inbox review',
        description: 'Review open Inbox threads and prepare triage suggestions.',
        trigger_type: 'cron',
        cron_expr: '0 9 * * 1-5',
        execution_target: 'cloud',
        prompt: [
          'Run the Inbox Agent review.',
          '',
          'Review connected inbox channels, summarize open threads that need attention, and prepare draft replies when useful.',
          'Never send messages automatically. Escalate uncertain or sensitive conversations.',
        ].join('\n'),
        configuration: {
          agent_slug: 'inbox-agent',
          product: 'inbox',
          mode: 'draft_only',
        },
      })
      setAutomationNotice('Inbox review job created on Seshat Server.')
    } catch (err) {
      setAutomationNotice(err instanceof ApiError ? err.message : 'Seshat Server automation is not available.')
    } finally {
      setAutomationCreating(false)
    }
  }

  return (
    <div className="ib-root">
      <style>{INBOX_CSS}</style>
      <main className="ib-content">
        <section className="ib-toolbar">
          <div className="ib-toolbar-heading">
            <h1>Inbox</h1>
          </div>
          <div className="ib-view-tabs" role="tablist" aria-label="Inbox sections">
            <button type="button" className={view === 'triage' ? 'active' : ''} onClick={() => setView('triage')}>
              <InboxIcon size={13} /> Triage
            </button>
            <button type="button" className={view === 'accounts' ? 'active' : ''} onClick={() => setView('accounts')}>
              <Mail size={13} /> Accounts
            </button>
            <button type="button" className={view === 'agent' ? 'active' : ''} onClick={() => setView('agent')}>
              <Robot size={13} /> Agent
            </button>
          </div>
          <div className="ib-toolbar-actions">
            <button type="button" className="ib-action-btn" onClick={handleSyncAll} disabled={syncableAccounts.length === 0 || Boolean(syncingAccountId)}>
              {syncingAccountId ? <LoadingOne size={13} className="spin" /> : <Refresh size={13} />} Sync
            </button>
            <button type="button" className="ib-action-btn" onClick={() => setAdvancedOpen(true)}>
              <Setting size={13} /> Advanced
            </button>
          </div>
        </section>

        {view === 'triage' ? (
          <section className="ib-main ib-main-triage">
            {error && <div className="ib-error-banner"><Caution size={13} /> {error}</div>}
            <div className="ib-search-row">
              <div className="ib-searchbox ib-searchbox-large">
                <Search size={15} />
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search visible threads" />
              </div>
              <div className="ib-channel-tabs ib-channel-tabs-inline">
                <button type="button" className={channelFilter === 'all' ? 'active' : ''} onClick={() => setChannelFilter('all')}>All</button>
                <button type="button" className={channelFilter === 'gmail' ? 'active' : ''} onClick={() => setChannelFilter('gmail')}>Gmail</button>
                <button type="button" className={channelFilter === 'whatsapp' ? 'active' : ''} onClick={() => setChannelFilter('whatsapp')}>WhatsApp</button>
              </div>
            </div>
            <div className="ib-thread-shell">
              <div className="ib-thread-list-pane">
                <div className="ib-status-tabs">
                  {STATUS_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      className={statusFilter === tab.id ? 'active' : ''}
                      onClick={() => setStatusFilter(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="ib-thread-list">
                  {threadsLoading && <div className="ib-empty"><LoadingOne size={16} className="spin" /></div>}
                  {!threadsLoading && accounts.length === 0 && (
                    <div className="ib-empty ib-empty-connect">
                      <InboxIcon size={28} />
                      <strong>No inbox connected</strong>
                      <span>Connect a channel to start syncing conversations.</span>
                      <div>
                        <button type="button" className="ib-action-btn primary" onClick={handleConnectGmail} disabled={gmailConnecting}>
                          {gmailConnecting ? <LoadingOne size={13} className="spin" /> : <Plus size={13} />} Gmail
                        </button>
                        <button type="button" className="ib-action-btn primary" onClick={handleConnectWhatsApp}>
                          <Plus size={13} /> WhatsApp
                        </button>
                      </div>
                    </div>
                  )}
                  {!threadsLoading && accounts.length > 0 && filteredThreads.length === 0 && (
                    <div className="ib-empty">No matching {statusFilter} threads.</div>
                  )}
                  {filteredThreads.map((thread) => (
                    <button
                      key={thread.id}
                      className={`ib-thread-item ${selectedThreadId === thread.id ? 'selected' : ''}`}
                      onClick={() => selectThread(thread)}
                    >
                      <span className="ib-thread-channel">{channelIcon(thread.channel)}</span>
                      <span className="ib-thread-copy">
                        <strong>{displayContact(thread)}</strong>
                        <small>{thread.subject || `${thread.channel} conversation`}</small>
                      </span>
                      <span className={`ib-priority ${thread.priority_score >= 0.65 ? 'high' : ''}`}>{thread.priority_score.toFixed(2)}</span>
                      <time>{formatDate(thread.last_message_at)}</time>
                    </button>
                  ))}
                  {!threadsLoading && threadsHasMore && (
                    <button type="button" className="ib-load-more" onClick={loadMoreThreads} disabled={threadsLoadingMore}>
                      {threadsLoadingMore ? <LoadingOne size={13} className="spin" /> : 'Load more'}
                    </button>
                  )}
                </div>
              </div>

              <div className="ib-detail-pane">
                {!selectedThreadId && (
                  <div className="ib-empty ib-empty-detail">
                    {accounts.length === 0 ? (
                      <>
                        <InboxIcon size={36} />
                        <strong>Connect an inbox</strong>
                        <span>Gmail and WhatsApp conversations will appear here once a channel is connected.</span>
                      </>
                    ) : (
                      <>
                        <Message size={36} />
                        <strong>Select a thread</strong>
                        <span>Read the conversation, review attachments, draft a reply, or mark the thread handled.</span>
                      </>
                    )}
                  </div>
                )}
                {selectedThreadId && threadLoading && <div className="ib-empty"><LoadingOne size={16} className="spin" /></div>}
                {selectedThreadId && !threadLoading && selectedThread && (
                  <>
                    <div className="ib-detail-header">
                      <div className="ib-detail-title">
                        <strong>{displayContact(selectedThread)}</strong>
                        <span>{selectedThread.subject || `${selectedThread.channel} conversation`}</span>
                      </div>
                      <div className="ib-detail-actions">
                        <button type="button" onClick={handleAskInboxAgentForThread} disabled={launchingAgent} title="Ask Inbox Agent">
                          {launchingAgent ? <LoadingOne size={13} className="spin" /> : <Robot size={13} />} Agent
                        </button>
                        <button type="button" onClick={() => handleUpdateStatus('handled')} title="Mark handled">
                          <CheckOne size={13} /> Handled
                        </button>
                        <button type="button" onClick={() => handleUpdateStatus('snoozed')} title="Snooze">
                          <AlarmClock size={13} /> Snooze
                        </button>
                        <button type="button" onClick={() => handleUpdateStatus('escalated')} title="Escalate">
                          <Flag size={13} /> Escalate
                        </button>
                      </div>
                    </div>
                    <div className="ib-messages">
                      {messagesHasMore && (
                        <button type="button" className="ib-load-more" onClick={loadEarlierMessages} disabled={messagesLoadingMore}>
                          {messagesLoadingMore ? <LoadingOne size={13} className="spin" /> : 'Load earlier messages'}
                        </button>
                      )}
                      {messages.map((message) => (
                        <div key={message.id} className={`ib-message ${message.direction} ${message.is_draft ? 'draft' : ''}`}>
                          <div className="ib-message-meta">
                            <span>{message.direction === 'outbound' ? 'You' : displayContact(selectedThread)}</span>
                            {message.is_draft && <em>Draft</em>}
                          </div>
                          {message.body_text && <p>{message.body_text}</p>}
                          {message.attachments && message.attachments.length > 0 && (
                            <div className="ib-attachments">
                              {message.attachments.map((attachment) => (
                                <button
                                  key={attachment.id}
                                  type="button"
                                  className="ib-attachment-chip"
                                  onClick={() => downloadAttachment(message.id, attachment)}
                                  title={`Download ${attachment.filename}`}
                                >
                                  <Paperclip size={12} />
                                  <span className="ib-attachment-name">{attachment.filename}</span>
                                  <span className="ib-attachment-size">{formatAttachmentSize(attachment.size)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <time>{formatDate(message.sent_at)}</time>
                        </div>
                      ))}
                    </div>
                    <div className="ib-composer">
                      <textarea
                        placeholder="Write a reply..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={4}
                      />
                      <div className="ib-composer-actions">
                        <button type="button" onClick={() => handleReply(false)} disabled={sending || !replyText.trim()}>
                          <Save size={13} /> Save Draft
                        </button>
                        <button type="button" className="primary" onClick={() => handleReply(true)} disabled={sending || !replyText.trim()}>
                          <Send size={13} /> Send
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        ) : view === 'accounts' ? (
          <section className="ib-accounts-page">
            {error && <div className="ib-error-banner"><Caution size={13} /> {error}</div>}
            <div className="ib-accounts-topline">
              <span>Accounts</span>
              <button type="button" className="ib-action-btn" onClick={loadAccounts} disabled={accountsLoading}>
                {accountsLoading ? <LoadingOne size={13} className="spin" /> : <Refresh size={13} />} Refresh
              </button>
              <button type="button" className="ib-action-btn primary" onClick={handleConnectGmail} disabled={gmailConnecting}>
                {gmailConnecting ? <LoadingOne size={13} className="spin" /> : <Plus size={13} />} Gmail
              </button>
              <button type="button" className="ib-action-btn primary" onClick={handleConnectWhatsApp}>
                <Plus size={13} /> WhatsApp
              </button>
            </div>

            <div className="ib-account-summary">
              <StatusTile label="Accounts" value={String(accounts.length)} />
              <StatusTile label="Connected" value={String(connectedAccounts.length)} tone="ok" />
              <StatusTile label="Needs Action" value={String(accountsInError.length)} tone={accountsInError.length > 0 ? 'bad' : 'ok'} />
              <StatusTile label="Syncable" value={String(syncableAccounts.length)} />
              <StatusTile label="Visible Open" value={String(openCount)} />
            </div>

            <div className="ib-accounts-grid">
              {accountsLoading ? (
                <div className="ib-account-empty"><LoadingOne size={18} className="spin" /> Loading accounts</div>
              ) : accounts.length === 0 ? (
                <div className="ib-account-empty">
                  <InboxIcon size={28} />
                  <strong>No account connected</strong>
                  <span>Connect Gmail or WhatsApp to start syncing conversations.</span>
                </div>
              ) : (
                accounts.map((account) => (
                  <article key={account.id} className={`ib-account-card ${statusTone(account.status)}`}>
                    <div className="ib-account-card-icon">{channelIcon(account.channel, 20)}</div>
                    <div className="ib-account-card-copy">
                      <strong>{account.display_name || account.external_account_id}</strong>
                      <span>{account.channel}</span>
                    </div>
                    <span className={`ib-account-status ${statusTone(account.status)}`}>{account.status}</span>
                    <div className="ib-account-meta">
                      <span>Last sync</span>
                      <strong>{formatDate(account.last_synced_at)}</strong>
                    </div>
                    {account.last_error && <div className="ib-account-error"><Caution size={12} /> {account.last_error}</div>}
                    <div className="ib-account-card-actions">
                      {account.channel === 'gmail' && (
                        <button type="button" onClick={() => handleSyncNow(account.id)} disabled={syncingAccountId === account.id}>
                          {syncingAccountId === account.id ? <LoadingOne size={12} className="spin" /> : <Refresh size={12} />} Sync
                        </button>
                      )}
                      <button type="button" onClick={() => handleDisconnect(account.id)}>
                        <Close size={12} /> Disconnect
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : (
          <section className="ib-agent-page">
            {error && <div className="ib-error-banner"><Caution size={13} /> {error}</div>}
            <div className="ib-agent-grid">
              <section className="ib-agent-panel-card ib-agent-chat-card">
                <div className="ib-panel-headline">
                  <Robot size={16} />
                  <strong>Agent workspace</strong>
                </div>
                <div className="ib-agent-transcript" ref={agentScrollRef}>
                  {agentMessages.length === 0 ? (
                    <div className="ib-agent-empty">
                      <Robot size={30} />
                      <strong>Inbox Agent ready</strong>
                      <span>Ask it to review open threads, summarize a selected conversation, or prepare draft replies.</span>
                    </div>
                  ) : (
                    agentMessages.map((message) => (
                      <MessageItem
                        key={message.id}
                        message={message}
                        sessionId={agentSessionId ?? undefined}
                        compact
                        onApproveTool={approveAgentTool}
                        onDenyTool={denyAgentTool}
                        onSubmitToolPrompt={submitAgentToolPrompt}
                      />
                    ))
                  )}
                </div>
                <ChatInput
                  value={agentPrompt}
                  onChange={setAgentPrompt}
                  onSend={handleSendAgentPrompt}
                  onStop={() => { void stopAgentMessage() }}
                  placeholder="Ask the Inbox Agent..."
                  maxHeight={120}
                  isStreaming={agentStreaming}
                  statusText={agentStreaming ? 'Inbox Agent is working' : undefined}
                  providerDisabled
                  modelDisabled
                />
              </section>

              <section className="ib-agent-panel-card">
                <div className="ib-panel-headline">
                  <AlarmClock size={16} />
                  <strong>Automation</strong>
                </div>
                <div className="ib-agent-rule">
                  <span>Manual review</span>
                  <strong>{connectedAccounts.length > 0 ? 'Available' : 'Connect inbox'}</strong>
                </div>
                <div className="ib-agent-rule">
                  <span>When new message arrives</span>
                  <strong>Suggest triage only</strong>
                </div>
                <div className="ib-agent-rule">
                  <span>Recurring review</span>
                  <strong>Needs Seshat Server</strong>
                </div>
                <div className="ib-agent-rule disabled">
                  <span>Auto send replies</span>
                  <strong>Disabled</strong>
                </div>
                <p className="ib-agent-note">
                  Full 24/7 automation needs backend rules plus server scheduling. The desktop agent can assist while the app is running.
                </p>
                {automationNotice && <div className="ib-agent-automation-notice">{automationNotice}</div>}
                <button type="button" className="ib-action-btn primary" onClick={handleStartInboxReview} disabled={connectedAccounts.length === 0 || launchingAgent || agentStreaming}>
                  {launchingAgent || agentStreaming ? <LoadingOne size={13} className="spin" /> : <Send size={13} />} Start inbox review
                </button>
                <button type="button" className="ib-action-btn" onClick={handleCreateInboxReviewJob} disabled={automationCreating}>
                  {automationCreating ? <LoadingOne size={13} className="spin" /> : <AlarmClock size={13} />} Create weekday review
                </button>
              </section>

              <section className="ib-agent-panel-card">
                <div className="ib-panel-headline">
                  <Flag size={16} />
                  <strong>Current scope</strong>
                </div>
                <div className="ib-agent-rule">
                  <span>Selected thread</span>
                  <strong>{selectedThread ? displayContact(selectedThread) : 'None'}</strong>
                </div>
                <div className="ib-agent-rule">
                  <span>Connected channels</span>
                  <strong>{connectedAccounts.length}</strong>
                </div>
                <div className="ib-agent-rule">
                  <span>Visible open threads</span>
                  <strong>{openCount}</strong>
                </div>
                <div className="ib-agent-rule">
                  <span>Accounts needing action</span>
                  <strong>{accountsInError.length}</strong>
                </div>
              </section>
            </div>
          </section>
        )}
      </main>

      {advancedOpen && (
        <InboxAdvancedPanel
          accounts={accounts}
          connectedCount={connectedAccounts.length}
          onClose={() => setAdvancedOpen(false)}
        />
      )}

      {whatsappPairing && (
        <div className="ib-modal-backdrop">
          <div className="ib-modal">
            <h3>Connect WhatsApp</h3>
            <p>Scan this QR code from WhatsApp Settings, Linked Devices, Link a Device.</p>
            {whatsappPairing.qr ? (
              <img src={whatsappPairing.qr} alt="WhatsApp pairing QR code" width={260} height={260} />
            ) : whatsappPairing.error ? (
              <div className="ib-error-banner"><Caution size={13} /> {whatsappPairing.error}</div>
            ) : (
              <div className="ib-empty"><LoadingOne size={20} className="spin" /></div>
            )}
            <button type="button" className="ib-action-btn" onClick={cancelWhatsAppPairing}>
              <Close size={13} /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function InboxAdvancedPanel({
  accounts,
  connectedCount,
  onClose,
}: {
  accounts: ChannelAccount[]
  connectedCount: number
  onClose: () => void
}) {
  const gmailCount = accounts.filter((account) => account.channel === 'gmail').length
  const whatsappCount = accounts.filter((account) => account.channel === 'whatsapp').length

  return (
    <aside className="ib-advanced-panel" aria-label="Inbox advanced settings">
      <div className="ib-advanced-head">
        <div>
          <h2>Advanced</h2>
          <span>Inbox settings</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close advanced settings">
          <WindowCloseIcon size={14} />
        </button>
      </div>

      <section className="ib-advanced-section">
        <h3>Channels</h3>
        <div className="ib-advanced-row">
          <span>Connected accounts</span>
          <strong>{connectedCount}</strong>
        </div>
        <div className="ib-advanced-row">
          <span>Gmail</span>
          <strong>{gmailCount}</strong>
        </div>
        <div className="ib-advanced-row">
          <span>WhatsApp</span>
          <strong>{whatsappCount}</strong>
        </div>
      </section>

      <section className="ib-advanced-section">
        <h3>Agent Safety</h3>
        <label className="ib-toggle-row">
          <span>
            <strong>Draft first</strong>
            <small>Replies stay reviewable before sending.</small>
          </span>
          <input type="checkbox" checked readOnly />
        </label>
        <label className="ib-toggle-row">
          <span>
            <strong>Require approval</strong>
            <small>Sending remains gated by confirmation.</small>
          </span>
          <input type="checkbox" checked readOnly />
        </label>
        <label className="ib-toggle-row disabled">
          <span>
            <strong>Auto triage rules</strong>
            <small>Needs backend rules and scheduler support.</small>
          </span>
          <input type="checkbox" disabled />
        </label>
      </section>

      <section className="ib-advanced-section">
        <h3>Runtime</h3>
        <div className="ib-advanced-row">
          <span>Gmail sync</span>
          <strong>Manual</strong>
        </div>
        <div className="ib-advanced-row">
          <span>WhatsApp</span>
          <strong>Live</strong>
        </div>
        <div className="ib-advanced-note">
          Cloud scheduling will belong to Seshat Server when Inbox automation moves to 24/7.
        </div>
      </section>

      <section className="ib-advanced-section">
        <h3>Coming Next</h3>
        <div className="ib-advanced-row muted">
          <span>Server search</span>
          <strong>Needed</strong>
        </div>
        <div className="ib-advanced-row muted">
          <span>Rules</span>
          <strong>Needed</strong>
        </div>
        <div className="ib-advanced-row muted">
          <span>Signatures</span>
          <strong>Needed</strong>
        </div>
      </section>
    </aside>
  )
}

function StatusTile({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className={`ib-status-tile ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function buildInboxAgentPrompt(thread: Thread | null, messages: ThreadMessage[]): string {
  if (!thread) {
    return [
      'Open the Inbox Agent.',
      '',
      'Please review my connected inbox accounts, list the open threads that need attention, and suggest the next triage actions.',
      'Prefer drafts over sending. Do not send any message unless I explicitly confirm the final text.',
    ].join('\n')
  }

  const recentMessages = messages.slice(-12).map((message) => {
    const author = message.direction === 'outbound' ? 'Me' : displayContact(thread)
    const draft = message.is_draft ? ' draft' : ''
    const attachments = message.attachments?.length
      ? ` Attachments: ${message.attachments.map((attachment) => attachment.filename).join(', ')}.`
      : ''
    return `- ${author}${draft} at ${formatDate(message.sent_at)}: ${message.body_text || '(no text)'}${attachments}`
  })

  return [
    'Open the Inbox Agent on this specific thread.',
    '',
    `Thread ID: ${thread.id}`,
    `Channel: ${thread.channel}`,
    `Contact: ${displayContact(thread)}`,
    `Subject: ${thread.subject || '(none)'}`,
    `Current status: ${thread.status}`,
    `Priority score: ${thread.priority_score.toFixed(2)}`,
    '',
    'Task:',
    '1. Read the canonical thread with inbox_get_thread before making recommendations.',
    '2. Summarize the situation and identify the next best action.',
    '3. If a reply is appropriate, draft it with inbox_draft_reply. Do not send it unless I explicitly confirm.',
    '',
    'Visible recent messages from the UI:',
    recentMessages.length > 0 ? recentMessages.join('\n') : '(no messages loaded in the UI yet)',
  ].join('\n')
}

async function consumeWhatsAppPairStream(
  signal: AbortSignal,
  onQR: (code: string) => void,
  onDone: () => void,
  onError: (message: string) => void,
) {
  try {
    if (window.nexus?.http) {
      const started = await window.nexus.http.startStream({ path: '/inbox/accounts/whatsapp/pair', method: 'POST' })
      if ('error' in started) {
        onError(started.error)
        return
      }
      const { streamId } = started
      await new Promise<void>((resolve) => {
        const unsubscribe = window.nexus.http!.onStreamEvent(streamId, ({ name, data }) => {
          if (name === 'qr' && typeof data.code === 'string') onQR(data.code)
          else if (name === 'done') {
            unsubscribe()
            onDone()
            resolve()
          } else if (name === 'error') {
            unsubscribe()
            onError(typeof data.error === 'string' ? data.error : 'Pairing failed.')
            resolve()
          }
        })
        signal.addEventListener('abort', () => {
          unsubscribe()
          void window.nexus?.http?.cancelStream(streamId).catch(() => {})
          resolve()
        })
      })
      return
    }

    const token = useAuthStore.getState().token
    const res = await fetch(`http://127.0.0.1:8090/api/v1/inbox/accounts/whatsapp/pair`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
    })
    if (!res.ok || !res.body) {
      onError(`HTTP ${res.status}`)
      return
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let eventName = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventName = line.slice(7).trim()
          continue
        }
        if (line === '') {
          eventName = ''
          continue
        }
        if (!line.startsWith('data: ')) continue
        let parsed: Record<string, unknown>
        try {
          parsed = JSON.parse(line.slice(6).trim())
        } catch {
          continue
        }
        if (eventName === 'qr' && typeof parsed.code === 'string') onQR(parsed.code)
        else if (eventName === 'done') {
          onDone()
          return
        } else if (eventName === 'error') {
          onError(typeof parsed.error === 'string' ? parsed.error : 'Pairing failed.')
          return
        }
      }
    }
  } catch (err) {
    if (signal.aborted) return
    onError(err instanceof Error ? err.message : 'Pairing failed.')
  }
}

const INBOX_CSS = `
${CHAT_INPUT_CSS}
${MESSAGE_ITEM_CSS}

.ib-root {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--color-surface);
  color: var(--color-text);
  overflow: hidden;
  position: relative;
}

.ib-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ib-toolbar {
  min-height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  padding: 0 var(--space-8);
  border-bottom: 1px solid var(--color-border-subtle);
}

.ib-toolbar-heading {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  flex-shrink: 0;
}

.ib-toolbar h1 {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 700;
  line-height: 1.2;
}

.ib-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 var(--space-5);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.ib-action-btn:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-text);
}

.ib-action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.ib-toolbar-actions {
  display: flex;
  gap: var(--space-4);
}

.ib-action-btn.primary {
  background: var(--color-cta);
  border-color: transparent;
  color: white;
}

.ib-view-tabs {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.ib-view-tabs button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 34px;
  min-width: 96px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  font-weight: 800;
  cursor: pointer;
}

.ib-view-tabs button:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.ib-view-tabs button.active {
  color: var(--color-text);
  border-color: rgba(239, 124, 47, 0.55);
  background: rgba(239, 124, 47, 0.12);
  box-shadow: inset 0 -2px 0 var(--color-cta);
}

.ib-main-triage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 24px 24px;
}

.ib-search-row {
  display: grid;
  grid-template-columns: minmax(320px, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.ib-searchbox-large {
  height: 40px;
  max-width: 720px;
}

.ib-searchbox-large input {
  font-size: var(--font-size-sm);
}

.ib-channel-tabs-inline {
  width: 260px;
}

.ib-accounts-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 22px 28px 40px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ib-accounts-topline {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  flex-wrap: wrap;
}

.ib-accounts-topline span {
  margin-right: auto;
  color: var(--color-text);
  font-size: var(--font-size-base);
  font-weight: 800;
}

.ib-account-summary {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.ib-accounts-grid {
  flex: 1;
  min-height: 260px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
  align-content: start;
}

.ib-agent-page {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 26px 28px 40px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.ib-agent-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(420px, 1.45fr) minmax(280px, 0.75fr) minmax(260px, 0.7fr);
  gap: 14px;
}

.ib-agent-panel-card {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ib-agent-chat-card {
  min-height: 560px;
  border-color: rgba(239, 124, 47, 0.45);
  background: rgba(239, 124, 47, 0.055);
}

.ib-agent-chat-card .chat-input-shell {
  flex-shrink: 0;
}

.ib-agent-transcript {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  background: var(--color-surface);
  padding: 16px;
}

.ib-agent-transcript .message-item {
  max-width: 100%;
}

.ib-agent-empty {
  height: 100%;
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-muted);
  text-align: center;
}

.ib-agent-empty strong {
  color: var(--color-text);
  font-size: var(--font-size-base);
}

.ib-agent-empty span {
  max-width: 360px;
  font-size: var(--font-size-sm);
  line-height: 1.45;
}

.ib-panel-headline {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--color-text);
  font-size: var(--font-size-base);
}

.ib-panel-headline svg {
  color: var(--color-cta);
}

.ib-agent-panel-card p {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.ib-agent-prompt-box,
.ib-agent-rule {
  border: 1px solid var(--color-border-subtle);
  border-radius: 7px;
  background: var(--color-surface);
  padding: 12px 14px;
}

.ib-agent-prompt-box span,
.ib-agent-rule span {
  display: block;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.ib-agent-prompt-box strong,
.ib-agent-rule strong {
  display: block;
  margin-top: 5px;
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.ib-agent-rule {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ib-agent-rule strong {
  margin-top: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ib-agent-rule.disabled {
  opacity: 0.55;
}

.ib-agent-note {
  margin-top: auto !important;
  border-top: 1px solid var(--color-border-subtle);
  padding-top: 14px;
}

.ib-agent-automation-notice {
  border: 1px solid rgba(239, 124, 47, 0.28);
  border-radius: 7px;
  background: rgba(239, 124, 47, 0.08);
  color: var(--color-text-secondary);
  padding: 10px 12px;
  font-size: var(--font-size-xs);
  line-height: 1.45;
}

.ib-account-card {
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  padding: 16px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
}

.ib-account-card.ok { border-color: rgba(111, 183, 123, 0.34); }
.ib-account-card.bad { border-color: rgba(239, 68, 68, 0.34); }

.ib-account-card-icon {
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
  color: var(--color-cta);
}

.ib-account-card-copy {
  min-width: 0;
}

.ib-account-card-copy strong,
.ib-account-card-copy span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ib-account-card-copy strong {
  font-size: var(--font-size-base);
}

.ib-account-card-copy span {
  margin-top: 4px;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  text-transform: capitalize;
}

.ib-account-status {
  height: 24px;
  display: inline-flex;
  align-items: center;
  padding: 0 9px;
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
  font-weight: 850;
  text-transform: capitalize;
}

.ib-account-status.ok {
  color: var(--color-success);
  background: rgba(111, 183, 123, 0.12);
}

.ib-account-status.bad {
  color: var(--color-error);
  background: rgba(239, 68, 68, 0.12);
}

.ib-account-meta {
  grid-column: 2 / 4;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding-top: 4px;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.ib-account-meta strong {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.ib-account-error {
  grid-column: 1 / 4;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 10px;
  border-radius: 7px;
  background: rgba(239, 68, 68, 0.1);
  color: var(--color-error);
  font-size: var(--font-size-xs);
}

.ib-account-card-actions {
  grid-column: 1 / 4;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--color-border-subtle);
  padding-top: 12px;
}

.ib-account-card-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 800;
  cursor: pointer;
}

.ib-account-card-actions button:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-text);
}

.ib-account-card-actions button:disabled {
  opacity: 0.55;
  cursor: default;
}

.ib-account-empty {
  grid-column: 1 / -1;
  min-height: 220px;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  color: var(--color-text-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
  font-size: var(--font-size-sm);
}

.ib-account-empty strong {
  color: var(--color-text);
  font-size: var(--font-size-base);
}

.ib-advanced-panel {
  position: absolute;
  top: 56px;
  right: 0;
  bottom: 0;
  width: min(440px, 34vw);
  min-width: 360px;
  z-index: 18;
  background: var(--color-bg);
  border-left: 1px solid var(--color-border);
  box-shadow: -28px 0 48px rgba(0, 0, 0, 0.22);
  overflow-y: auto;
}

.ib-advanced-head {
  min-height: 84px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.ib-advanced-head h2 {
  margin: 0;
  font-size: var(--font-size-lg);
}

.ib-advanced-head span {
  display: block;
  margin-top: 5px;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.ib-advanced-head button {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  cursor: pointer;
}

.ib-advanced-head button:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.ib-advanced-section {
  padding: 20px 22px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.ib-advanced-section h3 {
  margin: 0 0 14px;
  font-size: var(--font-size-base);
}

.ib-advanced-row {
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  margin-bottom: 8px;
}

.ib-advanced-row strong {
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
}

.ib-advanced-row.muted strong {
  color: var(--color-text-muted);
}

.ib-toggle-row {
  min-height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 12px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 7px;
  background: var(--color-surface);
  margin-bottom: 8px;
}

.ib-toggle-row strong,
.ib-toggle-row small {
  display: block;
}

.ib-toggle-row strong {
  font-size: var(--font-size-xs);
}

.ib-toggle-row small {
  margin-top: 3px;
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
  line-height: 1.4;
}

.ib-toggle-row input {
  width: 18px;
  height: 18px;
  accent-color: var(--color-cta);
}

.ib-toggle-row.disabled {
  opacity: 0.55;
}

.ib-advanced-note {
  padding: 11px 12px;
  border: 1px solid rgba(239, 124, 47, 0.3);
  border-radius: 7px;
  background: rgba(239, 124, 47, 0.08);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.ib-dashboard {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 330px minmax(0, 1fr);
  overflow: hidden;
}

.ib-sidebar {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  border-right: 1px solid var(--color-border-subtle);
  background: var(--color-bg);
  padding: var(--space-7);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.ib-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--space-7);
  gap: var(--space-5);
}

.ib-status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ib-status-tile {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: 10px;
}

.ib-status-tile span {
  display: block;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ib-status-tile strong {
  display: block;
  margin-top: 4px;
  font-size: var(--font-size-lg);
}

.ib-status-tile.ok strong { color: var(--color-success); }
.ib-status-tile.bad strong { color: var(--color-error); }

.ib-panel {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
}

.ib-panel-head {
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 var(--space-5);
  border-bottom: 1px solid var(--color-border-subtle);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ib-panel-head button,
.ib-account-row button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text-secondary);
  width: 28px;
  height: 28px;
  cursor: pointer;
}

.ib-panel-head button:hover,
.ib-account-row button:hover:not(:disabled) {
  background: var(--color-hover);
  color: var(--color-text);
}

.ib-connect-empty,
.ib-inline-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 18px 14px;
  color: var(--color-text-muted);
  font-size: 12px;
  text-align: center;
}

.ib-connect-empty strong {
  color: var(--color-text-secondary);
}

.ib-connect-empty span {
  line-height: 1.4;
}

.ib-account-list {
  display: flex;
  flex-direction: column;
}

.ib-account-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 9px;
  align-items: center;
  min-height: 54px;
  padding: 9px 10px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.ib-account-row:last-child { border-bottom: 0; }

.ib-account-row.ok .ib-account-icon { color: var(--color-success); }
.ib-account-row.bad .ib-account-icon { color: var(--color-error); }

.ib-account-copy {
  min-width: 0;
}

.ib-account-copy strong,
.ib-account-copy span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ib-account-copy strong {
  font-size: 12px;
}

.ib-account-copy span {
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: 10px;
}

.ib-filter-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}

.ib-searchbox {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-bg);
  color: var(--color-text-muted);
}

.ib-searchbox input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--color-text);
  font-size: 12px;
}

.ib-channel-tabs,
.ib-status-tabs {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  border: 1px solid var(--color-border);
  border-radius: 7px;
  overflow: hidden;
}

.ib-channel-tabs button,
.ib-status-tabs button {
  min-width: 0;
  height: 32px;
  border: 0;
  border-right: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.ib-channel-tabs button:last-child,
.ib-status-tabs button:last-child {
  border-right: 0;
}

.ib-channel-tabs button.active,
.ib-status-tabs button.active {
  background: rgba(239, 124, 47, 0.12);
  color: var(--color-text);
}

.ib-agent-panel {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 12px;
}

.ib-agent-panel strong,
.ib-agent-panel span {
  display: block;
}

.ib-agent-panel strong {
  font-size: 12px;
}

.ib-agent-panel span {
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: 11px;
  line-height: 1.35;
}

.ib-agent-panel button {
  border: 0;
  border-radius: 6px;
  height: 28px;
  padding: 0 10px;
  background: var(--color-cta);
  color: white;
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.ib-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 7px;
  border: 1px solid rgba(239, 68, 68, 0.25);
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 12px;
}

.ib-thread-shell {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 340px minmax(0, 1fr);
  gap: var(--space-6);
  overflow: hidden;
}

.ib-thread-list-pane,
.ib-detail-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  overflow: hidden;
}

.ib-status-tabs {
  flex-shrink: 0;
  border-width: 0 0 1px 0;
  border-radius: 0;
}

.ib-thread-list {
  flex: 1;
  overflow-y: auto;
}

.ib-thread-item {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  min-height: 62px;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.ib-thread-item:hover,
.ib-thread-item.selected {
  background: rgba(239, 124, 47, 0.08);
}

.ib-thread-channel {
  color: var(--color-text-muted);
}

.ib-thread-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ib-thread-copy strong,
.ib-thread-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ib-thread-copy strong {
  font-size: 12px;
}

.ib-thread-copy small,
.ib-thread-item time {
  color: var(--color-text-muted);
  font-size: 10px;
}

.ib-priority {
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 2px 6px;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 850;
}

.ib-priority.high {
  color: var(--color-warning, #d97706);
  border-color: rgba(217,119,6,0.35);
  background: rgba(217,119,6,0.08);
}

.ib-load-more {
  display: block;
  width: 100%;
  padding: 9px 12px;
  border: 0;
  border-bottom: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 11px;
  text-align: center;
  cursor: pointer;
}

.ib-load-more:hover { color: var(--color-text); }
.ib-load-more:disabled { opacity: 0.5; cursor: default; }

.ib-detail-header {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.ib-detail-title {
  min-width: 0;
}

.ib-detail-title strong,
.ib-detail-title span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ib-detail-title strong {
  font-size: 14px;
}

.ib-detail-title span {
  margin-top: 2px;
  color: var(--color-text-muted);
  font-size: 11px;
}

.ib-detail-actions {
  display: flex;
  gap: 6px;
}

.ib-detail-actions button,
.ib-composer-actions button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 9px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.ib-detail-actions button:hover,
.ib-composer-actions button:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-hover);
}

.ib-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ib-message {
  max-width: 82%;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
}

.ib-message.outbound {
  align-self: flex-end;
  background: rgba(239, 124, 47, 0.12);
}

.ib-message.draft {
  opacity: 0.75;
  border-style: dashed;
}

.ib-message-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 800;
}

.ib-message-meta em {
  font-style: normal;
  color: var(--color-cta);
  text-transform: uppercase;
}

.ib-message p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.ib-message time {
  display: block;
  margin-top: 5px;
  color: var(--color-text-muted);
  font-size: 10px;
}

.ib-attachments {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 7px;
}

.ib-attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}

.ib-attachment-chip:hover {
  color: var(--color-text);
  border-color: var(--color-primary);
}

.ib-attachment-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ib-attachment-size {
  flex-shrink: 0;
  color: var(--color-text-muted);
}

.ib-composer {
  flex-shrink: 0;
  border-top: 1px solid var(--color-border-subtle);
  padding: 10px 14px;
}

.ib-composer textarea {
  width: 100%;
  resize: vertical;
  min-height: 84px;
  max-height: 180px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 12.5px;
  padding: 9px 10px;
  font-family: inherit;
  outline: none;
}

.ib-composer textarea:focus {
  border-color: var(--color-primary);
}

.ib-composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.ib-composer-actions button.primary {
  background: var(--color-cta);
  border-color: transparent;
  color: white;
}

.ib-composer-actions button:disabled {
  opacity: 0.5;
  cursor: default;
}

.ib-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 12px;
  padding: 24px;
  text-align: center;
}

.ib-empty-detail {
  flex-direction: column;
  gap: 9px;
}

.ib-empty-detail strong {
  color: var(--color-text);
  font-size: 16px;
}

.ib-empty-detail span {
  max-width: 320px;
  line-height: 1.45;
}

.ib-empty-connect {
  min-height: 220px;
  padding: 28px 18px;
}

.ib-empty-connect strong {
  color: var(--color-text);
  font-size: var(--font-size-base);
}

.ib-empty-connect span {
  max-width: 230px;
  line-height: 1.45;
}

.ib-empty-connect div {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.ib-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}

.ib-modal {
  width: 340px;
  padding: 24px;
  border-radius: 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.ib-modal h3 {
  margin: 0;
  font-size: 15px;
}

.ib-modal p {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.ib-modal img {
  border-radius: 8px;
}

.spin {
  animation: ib-spin 1s linear infinite;
}

@keyframes ib-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 1180px) {
  .ib-dashboard {
    grid-template-columns: 300px minmax(0, 1fr);
  }
  .ib-thread-shell {
    grid-template-columns: 310px minmax(0, 1fr);
  }
}

/* New Inbox layout overrides */
.ib-main.ib-main-triage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 24px 24px;
}

.ib-main.ib-main-triage .ib-thread-shell {
  flex: 1;
  min-height: 0;
}

.ib-main.ib-main-triage .ib-thread-list-pane,
.ib-main.ib-main-triage .ib-detail-pane {
  min-height: 0;
}

.ib-accounts-page .ib-accounts-grid,
.ib-agent-page .ib-agent-grid {
  flex: 1;
}

.ib-accounts-page .ib-account-empty {
  min-height: 320px;
  grid-column: 1 / -1;
}

.ib-agent-page {
  padding-top: 20px;
}

.ib-searchbox.ib-searchbox-large {
  height: 40px;
  max-width: 720px;
}

.ib-searchbox.ib-searchbox-large input {
  font-size: var(--font-size-sm);
}

.ib-channel-tabs.ib-channel-tabs-inline {
  width: 260px;
  flex-shrink: 0;
}

.ib-main.ib-main-triage .ib-thread-list {
  overflow-x: hidden;
}

.ib-main.ib-main-triage .ib-empty-connect {
  min-height: 100%;
  width: 100%;
  max-width: 100%;
  flex-direction: column;
  gap: 10px;
  padding: 28px 18px;
  overflow: hidden;
}

.ib-main.ib-main-triage .ib-empty-connect svg {
  flex-shrink: 0;
}

.ib-main.ib-main-triage .ib-empty-connect strong,
.ib-main.ib-main-triage .ib-empty-connect span {
  max-width: 240px;
}

.ib-main.ib-main-triage .ib-empty-connect div {
  max-width: 100%;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.ib-main.ib-main-triage .ib-empty-connect .ib-action-btn {
  min-width: 104px;
}

@media (max-width: 1180px) {
  .ib-search-row {
    grid-template-columns: 1fr;
  }
  .ib-channel-tabs.ib-channel-tabs-inline {
    width: 100%;
  }
  .ib-account-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ib-agent-grid {
    grid-template-columns: 1fr;
  }
}
`
