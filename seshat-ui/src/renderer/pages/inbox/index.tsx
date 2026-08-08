import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import QRCode from 'qrcode'
import {
  Mail,
  Message,
  Plus,
  Close,
  Refresh,
  Send,
  Save,
  Flag,
  AlarmClock,
  CheckOne,
  LoadingOne,
  Caution,
  Left,
} from '@icon-park/react'
import { api, ApiError } from '@/api/client'

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

type ThreadMessage = {
  id: string
  thread_id: string
  direction: 'inbound' | 'outbound' | string
  body_text: string
  is_draft: boolean
  sent_at: number
}

const STATUS_TABS: Array<{ id: string; label: string }> = [
  { id: 'open', label: 'Open' },
  { id: 'snoozed', label: 'Snoozed' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'handled', label: 'Handled' },
]

function channelIcon(channel: string) {
  return channel === 'gmail' ? <Mail size={13} /> : <Message size={13} />
}

export function InboxPage() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<ChannelAccount[]>([])
  const [statusFilter, setStatusFilter] = useState('open')
  const [threads, setThreads] = useState<Thread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(false)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [gmailConnecting, setGmailConnecting] = useState(false)
  const [whatsappPairing, setWhatsappPairing] = useState<{ qr: string | null; error: string | null } | null>(null)
  const pairAbortRef = useRef<AbortController | null>(null)
  const gmailPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadAccounts = useCallback(async () => {
    try {
      const res = await api.get<{ accounts: ChannelAccount[] }>('/inbox/accounts')
      setAccounts(res.accounts ?? [])
    } catch {
      // best-effort - the thread list below is the primary signal of health
    }
  }, [])

  const loadThreads = useCallback(async (status: string) => {
    setThreadsLoading(true)
    try {
      const res = await api.get<{ threads: Thread[] }>(`/inbox/threads?status=${encodeURIComponent(status)}`)
      setThreads(res.threads ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to load threads.')
    } finally {
      setThreadsLoading(false)
    }
  }, [])

  const loadThread = useCallback(async (id: string) => {
    setThreadLoading(true)
    try {
      const res = await api.get<{ thread: Thread; messages: ThreadMessage[] }>(`/inbox/threads/${id}`)
      setSelectedThread(res.thread)
      setMessages(res.messages ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to load thread.')
    } finally {
      setThreadLoading(false)
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
  }, [statusFilter, loadThreads])

  useEffect(() => {
    if (selectedThreadId) void loadThread(selectedThreadId)
  }, [selectedThreadId, loadThread])

  function selectThread(t: Thread) {
    setSelectedThreadId(t.id)
    setReplyText('')
  }

  async function refreshCurrentThread() {
    await loadThreads(statusFilter)
    if (selectedThreadId) await loadThread(selectedThreadId)
  }

  async function handleReply(send: boolean) {
    if (!selectedThreadId || !replyText.trim()) return
    setSending(true)
    setError(null)
    try {
      await api.post(`/inbox/threads/${selectedThreadId}/reply`, { body: replyText.trim(), send })
      setReplyText('')
      await refreshCurrentThread()
      if (send) await loadThreads(statusFilter)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to save the reply.')
    } finally {
      setSending(false)
    }
  }

  async function handleUpdateStatus(status: string) {
    if (!selectedThreadId) return
    try {
      await api.patch(`/inbox/threads/${selectedThreadId}`, { status })
      await loadThreads(statusFilter)
      await loadThread(selectedThreadId)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to update status.')
    }
  }

  async function handleSyncNow(accountId: string) {
    try {
      await api.post(`/inbox/accounts/${accountId}/sync`)
      await loadThreads(statusFilter)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sync failed.')
    }
  }

  async function handleDisconnect(accountId: string) {
    try {
      await api.delete(`/inbox/accounts/${accountId}`)
      await loadAccounts()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to disconnect.')
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
      // Google's redirect completes server-side in the system browser, not
      // in this app - poll for the new account to show up rather than
      // requiring a manual refresh click. Stops as soon as a new Gmail
      // account appears, or after ~60s if the user never completes consent.
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
            return
          }
        } catch {
          // transient - keep polling until the attempt budget runs out
        }
        if (attempts >= 30 && gmailPollRef.current) {
          clearInterval(gmailPollRef.current)
          gmailPollRef.current = null
          setGmailConnecting(false)
        }
      }, 2000)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to start Gmail connection.')
      setGmailConnecting(false)
    }
  }

  useEffect(() => {
    return () => {
      if (gmailPollRef.current) clearInterval(gmailPollRef.current)
      pairAbortRef.current?.abort()
    }
  }, [])

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
        // ignore a single failed render - the next QR rotation will retry
      }
    }
    const onDone = async () => {
      setWhatsappPairing(null)
      await loadAccounts()
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

  return (
    <div className="ib-root">
      <style>{INBOX_CSS}</style>

      <main className="ib-content">
        <section className="ib-toolbar">
          <div className="ib-toolbar-heading">
            <button type="button" className="ib-back-chip" onClick={() => navigate(-1)}>
              <Left size={11} /> Home
            </button>
            <h1>Inbox</h1>
          </div>
          <div className="ib-toolbar-actions">
            <button type="button" className="ib-connect-btn" onClick={handleConnectGmail} disabled={gmailConnecting}>
              {gmailConnecting ? <LoadingOne size={13} className="spin" /> : <Plus size={13} />} Connect Gmail
            </button>
            <button type="button" className="ib-connect-btn" onClick={handleConnectWhatsApp}>
              <Plus size={13} /> Connect WhatsApp
            </button>
          </div>
        </section>

        {accounts.length > 0 && (
          <div className="ib-accounts-row">
            {accounts.map((a) => (
              <div key={a.id} className={`ib-account-chip ${a.status}`}>
                {channelIcon(a.channel)}
                <span>{a.display_name || a.external_account_id}</span>
                <em>{a.status}</em>
                {a.channel === 'gmail' && (
                  <button type="button" title="Sync now" onClick={() => handleSyncNow(a.id)}>
                    <Refresh size={11} />
                  </button>
                )}
                <button type="button" title="Disconnect" onClick={() => handleDisconnect(a.id)}>
                  <Close size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="ib-error-banner">
            <Caution size={13} /> {error}
          </div>
        )}

        <section className="ib-layout">
          <div className="ib-threads-pane">
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
              {!threadsLoading && threads.length === 0 && (
                <div className="ib-empty">No {statusFilter} threads.</div>
              )}
              {threads.map((t) => (
                <button
                  key={t.id}
                  className={`ib-thread-item ${selectedThreadId === t.id ? 'selected' : ''}`}
                  onClick={() => selectThread(t)}
                >
                  <span className="ib-thread-channel">{channelIcon(t.channel)}</span>
                  <span className="ib-thread-copy">
                    <strong>{t.contact.display_name || t.contact.external_id}</strong>
                    {t.subject && <small>{t.subject}</small>}
                  </span>
                  <time>{new Date(t.last_message_at * 1000).toLocaleDateString()}</time>
                </button>
              ))}
            </div>
          </div>

          <div className="ib-thread-detail">
            {!selectedThreadId && <div className="ib-empty">Select a thread to view the conversation.</div>}
            {selectedThreadId && threadLoading && <div className="ib-empty"><LoadingOne size={16} className="spin" /></div>}
            {selectedThreadId && !threadLoading && selectedThread && (
              <>
                <div className="ib-detail-header">
                  <div>
                    <strong>{selectedThread.contact.display_name || selectedThread.contact.external_id}</strong>
                    {selectedThread.subject && <span> — {selectedThread.subject}</span>}
                  </div>
                  <div className="ib-detail-actions">
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
                  {messages.map((m) => (
                    <div key={m.id} className={`ib-message ${m.direction} ${m.is_draft ? 'draft' : ''}`}>
                      {m.is_draft && <span className="ib-draft-tag">Draft</span>}
                      <p>{m.body_text}</p>
                      <time>{new Date(m.sent_at * 1000).toLocaleString()}</time>
                    </div>
                  ))}
                </div>
                <div className="ib-composer">
                  <textarea
                    placeholder="Write a reply…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={3}
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
        </section>
      </main>

      {whatsappPairing && (
        <div className="ib-modal-backdrop">
          <div className="ib-modal">
            <h3>Connect WhatsApp</h3>
            <p>Scan this QR code with WhatsApp on your phone (Settings → Linked Devices → Link a Device).</p>
            {whatsappPairing.qr ? (
              <img src={whatsappPairing.qr} alt="WhatsApp pairing QR code" width={260} height={260} />
            ) : whatsappPairing.error ? (
              <div className="ib-error-banner"><Caution size={13} /> {whatsappPairing.error}</div>
            ) : (
              <div className="ib-empty"><LoadingOne size={20} className="spin" /></div>
            )}
            <button type="button" className="ib-connect-btn" onClick={cancelWhatsAppPairing}>
              <Close size={13} /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// consumeWhatsAppPairStream is a purpose-built SSE consumer for the
// WhatsApp pairing endpoint only ("qr"/"done"/"error" events) - mirrors the
// dual Electron-bridge/browser-fetch handling in hooks/useChat.ts, but kept
// separate rather than generalizing that hook's internals under time
// pressure; both paths ultimately just dispatch named SSE events.
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

    const res = await fetch(`http://127.0.0.1:8090/api/v1/inbox/accounts/whatsapp/pair`, {
      method: 'POST',
      headers: { Accept: 'text/event-stream' },
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
  } catch (e) {
    if (signal.aborted) return
    onError(e instanceof Error ? e.message : 'Pairing failed.')
  }
}

const INBOX_CSS = `
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
  min-height: 74px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 28px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.ib-toolbar-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.ib-back-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 7px; border-radius: 5px; border: none;
  background: var(--color-hover); color: var(--color-text-secondary);
  font-size: 10px; font-weight: 600; cursor: pointer;
  transition: background 0.1s, color 0.1s; white-space: nowrap;
}
.ib-back-chip:hover { background: var(--color-border); color: var(--color-text); }

.ib-toolbar h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
}

.ib-toolbar-actions {
  display: flex;
  gap: 8px;
}

.ib-connect-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.ib-connect-btn:hover { background: var(--color-hover); }
.ib-connect-btn:disabled { opacity: 0.5; cursor: default; }

.ib-accounts-row {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 28px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.ib-account-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px 0 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  font-size: 11px;
  font-weight: 700;
}

.ib-account-chip em {
  font-style: normal;
  color: var(--color-text-muted);
  text-transform: uppercase;
  font-size: 9px;
}

.ib-account-chip.error { border-color: rgba(239, 68, 68, 0.5); }

.ib-account-chip button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}
.ib-account-chip button:hover { background: var(--color-hover); color: var(--color-text); }

.ib-error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 28px 0;
  padding: 8px 12px;
  border-radius: 7px;
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  font-size: 12px;
}

.ib-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 14px;
  overflow: hidden;
  padding: 16px 24px;
}

.ib-threads-pane, .ib-thread-detail {
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
  display: flex;
  border-bottom: 1px solid var(--color-border-subtle);
}
.ib-status-tabs button {
  flex: 1;
  height: 34px;
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.ib-status-tabs button.active {
  color: var(--color-text);
  box-shadow: inset 0 -2px 0 var(--color-primary);
}

.ib-thread-list { flex: 1; overflow-y: auto; }

.ib-thread-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}
.ib-thread-item:hover, .ib-thread-item.selected { background: rgba(239, 124, 47, 0.06); }
.ib-thread-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ib-thread-copy strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ib-thread-copy small { font-size: 11px; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ib-thread-item time { flex-shrink: 0; font-size: 10px; color: var(--color-text-muted); }

.ib-detail-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border-subtle);
  font-size: 13px;
}
.ib-detail-actions { display: flex; gap: 6px; }
.ib-detail-actions button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 11px;
  cursor: pointer;
}
.ib-detail-actions button:hover { color: var(--color-text); }

.ib-messages { flex: 1; overflow-y: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.ib-message { max-width: 80%; padding: 8px 12px; border-radius: 10px; background: var(--color-surface); }
.ib-message.outbound { align-self: flex-end; background: rgba(239, 124, 47, 0.12); }
.ib-message.draft { opacity: 0.7; border: 1px dashed var(--color-border); }
.ib-message p { margin: 0; font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; }
.ib-message time { display: block; margin-top: 4px; font-size: 10px; color: var(--color-text-muted); }
.ib-draft-tag { font-size: 9px; font-weight: 800; text-transform: uppercase; color: var(--color-cta); }

.ib-composer { flex-shrink: 0; border-top: 1px solid var(--color-border-subtle); padding: 10px 16px; }
.ib-composer textarea {
  width: 100%;
  resize: vertical;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 12.5px;
  padding: 8px 10px;
  font-family: inherit;
}
.ib-composer-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.ib-composer-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 7px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.ib-composer-actions button.primary { background: var(--color-cta); border-color: transparent; color: white; }
.ib-composer-actions button:disabled { opacity: 0.5; cursor: default; }

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
.ib-modal h3 { margin: 0; font-size: 15px; }
.ib-modal p { margin: 0; font-size: 12px; color: var(--color-text-secondary); }
.ib-modal img { border-radius: 8px; }
`
