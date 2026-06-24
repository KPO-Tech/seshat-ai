import { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Time, Plus, Sync, Delete, Edit, CheckOne, Caution,
  LoadingOne, Close, Right, Flashlamp, Left, Robot, Send, Copy,
} from '@icon-park/react'
import { api } from '@/api/client'
import type { ScheduledJob } from '@/api/types'
import { NexusLogo } from '@/components/NexusLogo'
import { MarkdownView } from '@/components/MarkdownView'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const abs = Math.abs(diff)
  const future = diff < 0
  if (abs < 60_000) return future ? 'in a moment' : 'just now'
  if (abs < 3_600_000) {
    const m = Math.round(abs / 60_000)
    return future ? `in ${m}m` : `${m}m ago`
  }
  if (abs < 86_400_000) {
    const h = Math.round(abs / 3_600_000)
    return future ? `in ${h}h` : `${h}h ago`
  }
  const d = Math.round(abs / 86_400_000)
  return future ? `in ${d}d` : `${d}d ago`
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type CronHintFn = (m: RegExpMatchArray) => string
type CronHint  = [RegExp, string | CronHintFn]

const CRON_HINTS: CronHint[] = [
  [/^\* \* \* \* \*$/, 'Every minute'],
  [/^0 \* \* \* \*$/, 'Every hour'],
  [/^0 0 \* \* \*$/, 'Daily at midnight'],
  [/^0 ([0-9]+) \* \* \*$/, (m) => `Daily at ${m[1]}:00`],
  [/^0 ([0-9]+) \* \* 1-5$/, (m) => `Weekdays at ${m[1]}:00`],
  [/^0 0 \* \* 1$/, 'Every Monday'],
  [/^0 0 1 \* \*$/, 'Monthly, 1st'],
  [/^0 0 1,15 \* \*$/, 'Twice a month'],
  [/^\*\/([0-9]+) \* \* \* \*$/, (m) => `Every ${m[1]} minutes`],
  [/^0 \*\/([0-9]+) \* \* \*$/, (m) => `Every ${m[1]} hours`],
]

function cronHint(expr: string): string | null {
  for (const [re, label] of CRON_HINTS) {
    const m = expr.match(re)
    if (m) return typeof label === 'string' ? label : label(m)
  }
  return null
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  '':        { label: 'Never ran', color: 'var(--color-text-muted)' },
  ok:        { label: 'OK',        color: 'var(--color-success)' },
  error:     { label: 'Error',     color: 'var(--color-error)' },
  running:   { label: 'Running',   color: 'var(--color-primary)' },
}

type JobFormState = {
  name: string
  cron_expr: string
  prompt: string
  agent_slug: string
  session_title: string
  enabled: boolean
}

const EMPTY_FORM: JobFormState = {
  name: '',
  cron_expr: '0 9 * * *',
  prompt: '',
  agent_slug: '',
  session_title: '',
  enabled: true,
}

function jobToForm(j: ScheduledJob): JobFormState {
  return {
    name: j.name,
    cron_expr: j.cron_expr,
    prompt: j.prompt,
    agent_slug: j.agent_slug ?? '',
    session_title: j.session_title ?? '',
    enabled: j.enabled,
  }
}

// ─── Chat types & actions ─────────────────────────────────────────────────────

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const TASK_AGENT_ACTIONS = [
  { icon: '✦', label: 'Create a task',  desc: 'Help me set up a new scheduled task.',       prompt: 'Help me create a new scheduled task. What information do I need to provide?' },
  { icon: '◎', label: 'Explain cron',   desc: 'Explain cron expressions with examples.',     prompt: 'Explain cron expressions with practical examples. Show me the most common patterns.' },
  { icon: '✎', label: 'Daily report',   desc: 'Set up a daily automated report.',            prompt: 'Help me set up a daily automated report task. What prompt should I write?' },
  { icon: '⬡', label: 'Debug a task',   desc: "Why isn't my task running as expected?",     prompt: "Help me debug a scheduled task that isn't running correctly. What should I check?" },
  { icon: '◈', label: 'Task examples',  desc: 'Browse common scheduled task patterns.',      prompt: 'Show me examples of useful scheduled tasks I could set up with SeshatOS.' },
]

// ─── Main page ────────────────────────────────────────────────────────────────

export function ScheduledTasksPage() {
  const navigate = useNavigate()

  // ── Agent panel state ──
  const [agentOpen, setAgentOpen] = useState(() => {
    try { return localStorage.getItem('st-agent-open') === 'true' } catch { return false }
  })
  const [agentWidth, setAgentWidth] = useState(() => {
    try { return Number(localStorage.getItem('st-agent-width')) || 360 } catch { return 360 }
  })
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatSessionId, setChatSessionId] = useState<string | null>(null)

  const toggleAgent = () => {
    setAgentOpen(v => {
      const next = !v
      try { localStorage.setItem('st-agent-open', String(next)) } catch {}
      return next
    })
  }

  // ── Jobs state ──
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; job: ScheduledJob } | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)

  const showToast = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ text, kind })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<{ jobs: ScheduledJob[]; count: number }>('/scheduler/jobs')
      setJobs(data.jobs ?? [])
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleToggle(job: ScheduledJob) {
    if (togglingId) return
    setTogglingId(job.id)
    try {
      const updated = await api.put<ScheduledJob>(`/scheduler/jobs/${job.id}`, { enabled: !job.enabled })
      setJobs(prev => prev.map(j => j.id === job.id ? updated : j))
    } catch (e: unknown) {
      showToast((e as { message?: string })?.message ?? 'Toggle failed', 'err')
    } finally {
      setTogglingId(null)
    }
  }

  async function handleRunNow(job: ScheduledJob) {
    if (runningId) return
    setRunningId(job.id)
    try {
      await api.post(`/scheduler/jobs/${job.id}/run`)
      showToast(`"${job.name || job.cron_expr}" queued for immediate run`)
      setTimeout(load, 1200)
    } catch (e: unknown) {
      showToast((e as { message?: string })?.message ?? 'Failed to trigger job', 'err')
    } finally {
      setRunningId(null)
    }
  }

  async function handleDelete(job: ScheduledJob) {
    if (deletingId) return
    if (!confirm(`Delete "${job.name || job.cron_expr}"? This cannot be undone.`)) return
    setDeletingId(job.id)
    try {
      await api.delete(`/scheduler/jobs/${job.id}`)
      setJobs(prev => prev.filter(j => j.id !== job.id))
      showToast('Job deleted')
    } catch (e: unknown) {
      showToast((e as { message?: string })?.message ?? 'Delete failed', 'err')
    } finally {
      setDeletingId(null)
    }
  }

  function handleSaved(job: ScheduledJob, isNew: boolean) {
    if (isNew) {
      setJobs(prev => [job, ...prev])
    } else {
      setJobs(prev => prev.map(j => j.id === job.id ? job : j))
    }
    setModal(null)
    showToast(isNew ? 'Job created' : 'Job updated')
  }

  const total = jobs.length
  const enabled = jobs.filter(j => j.enabled).length
  const errored = jobs.filter(j => j.last_status === 'error').length
  const running = jobs.filter(j => j.last_status === 'running').length

  return (
    <div className="st-wrap">
      <style>{CSS}</style>

      <div className="sj-root">
        {toast && (
          <div className={`sj-toast ${toast.kind}`}>
            {toast.kind === 'ok' ? <CheckOne size={14} /> : <Caution size={14} />}
            {toast.text}
          </div>
        )}

        <div className="sj-topnav">
          <button className="sj-back-btn" onClick={() => navigate(-1)}>
            <Left size={14} />
            Back
          </button>
        </div>

        <header className="sj-header">
          <div className="sj-header-left">
            <div className="sj-header-icon">
              <Time size={26} />
            </div>
            <div>
              <h1>Scheduled Tasks</h1>
              <p>Recurring jobs that run prompts automatically on a cron schedule.</p>
            </div>
          </div>
          <div className="sj-header-actions">
            <button
              className={`sj-btn ghost${agentOpen ? ' agent-active' : ''}`}
              onClick={toggleAgent}
              title="TaskAgent — AI assistant for creating scheduled tasks"
            >
              <Robot size={14} />
              TaskAgent
            </button>
            <button className="sj-btn ghost" onClick={load} disabled={loading}>
              <Sync size={14} className={loading ? 'spin' : ''} />
              Refresh
            </button>
            <button className="sj-btn primary" onClick={() => setModal({ mode: 'create' })}>
              <Plus size={14} />
              New job
            </button>
          </div>
        </header>

        <div className="sj-stats-row">
          <div className="sj-stat">
            <span className="sj-stat-n">{total}</span>
            <span className="sj-stat-l">Total</span>
          </div>
          <div className="sj-stat">
            <span className="sj-stat-n ok">{enabled}</span>
            <span className="sj-stat-l">Enabled</span>
          </div>
          {running > 0 && (
            <div className="sj-stat">
              <span className="sj-stat-n running">{running}</span>
              <span className="sj-stat-l">Running</span>
            </div>
          )}
          {errored > 0 && (
            <div className="sj-stat">
              <span className="sj-stat-n err">{errored}</span>
              <span className="sj-stat-l">Errored</span>
            </div>
          )}
        </div>

        {error && <div className="sj-error"><Caution size={14} />{error}</div>}

        {loading ? (
          <div className="sj-empty">
            <LoadingOne size={28} className="spin" />
            <p>Loading jobs…</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="sj-empty">
            <Time size={40} theme="outline" />
            <p>No scheduled jobs yet.</p>
            <button className="sj-btn primary" onClick={() => setModal({ mode: 'create' })}>
              <Plus size={14} /> Create your first job
            </button>
          </div>
        ) : (
          <div className="sj-list">
            {jobs.map(job => (
              <JobRow
                key={job.id}
                job={job}
                toggling={togglingId === job.id}
                deleting={deletingId === job.id}
                isRunning={runningId === job.id}
                onToggle={() => handleToggle(job)}
                onRunNow={() => handleRunNow(job)}
                onEdit={() => setModal({ mode: 'edit', job })}
                onDelete={() => handleDelete(job)}
              />
            ))}
          </div>
        )}

        {modal && (
          <JobModal
            mode={modal.mode}
            initial={modal.mode === 'edit' ? jobToForm(modal.job) : EMPTY_FORM}
            jobId={modal.mode === 'edit' ? modal.job.id : undefined}
            onClose={() => setModal(null)}
            onSaved={job => handleSaved(job, modal.mode === 'create')}
          />
        )}
      </div>

      {/* ── TaskAgent panel — right side ── */}
      {agentOpen && (
        <TaskAgentPanel
          messages={chatMessages}
          sessionId={chatSessionId}
          width={agentWidth}
          onWidthChange={(w) => {
            setAgentWidth(w)
            try { localStorage.setItem('st-agent-width', String(w)) } catch {}
          }}
          onMessagesChange={setChatMessages}
          onSessionIdChange={setChatSessionId}
          onClose={toggleAgent}
        />
      )}
    </div>
  )
}

// ─── Job row ──────────────────────────────────────────────────────────────────

function JobRow({
  job, toggling, deleting, isRunning,
  onToggle, onRunNow, onEdit, onDelete,
}: {
  job: ScheduledJob
  toggling: boolean
  deleting: boolean
  isRunning: boolean
  onToggle: () => void
  onRunNow: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const hint = cronHint(job.cron_expr)
  const statusMeta = STATUS_META[job.last_status] ?? STATUS_META['']

  return (
    <div className={`sj-row ${!job.enabled ? 'disabled' : ''}`}>
      <div className="sj-row-main">
        <div className="sj-row-title-line">
          <span className="sj-status-dot" style={{ background: statusMeta.color }} title={statusMeta.label} />
          <span className="sj-row-name">{job.name || job.cron_expr}</span>
          {job.agent_slug && (
            <span className="sj-badge agent">{job.agent_slug}</span>
          )}
          {job.last_status === 'error' && (
            <span className="sj-badge error" title={job.last_error}>Error</span>
          )}
          {job.last_status === 'running' && (
            <span className="sj-badge running"><LoadingOne size={10} className="spin" />Running</span>
          )}
        </div>

        <div className="sj-row-prompt">{job.prompt}</div>

        <div className="sj-row-meta">
          <span className="sj-meta-chip cron">
            <Time size={11} />
            {job.cron_expr}
            {hint && <span className="sj-cron-hint">— {hint}</span>}
          </span>
          <span className="sj-meta-chip">
            <Right size={11} />
            Next: {relativeTime(job.next_run_at)}
            <span className="sj-abs">{formatAbsolute(job.next_run_at)}</span>
          </span>
          {job.last_run_at && (
            <span className="sj-meta-chip muted">
              Last: {relativeTime(job.last_run_at)}
            </span>
          )}
        </div>

        {job.last_status === 'error' && job.last_error && (
          <div className="sj-error-inline">{job.last_error}</div>
        )}
      </div>

      <div className="sj-row-actions">
        <button
          className={`sj-toggle ${job.enabled ? 'on' : 'off'}`}
          onClick={onToggle}
          disabled={toggling}
          title={job.enabled ? 'Disable' : 'Enable'}
        >
          <span className="sj-toggle-knob" />
        </button>
        <button
          className="sj-icon-btn"
          onClick={onRunNow}
          disabled={isRunning}
          title="Run now"
        >
          {isRunning ? <LoadingOne size={15} className="spin" /> : <Flashlamp size={15} />}
        </button>
        <button className="sj-icon-btn" onClick={onEdit} title="Edit">
          <Edit size={15} />
        </button>
        <button
          className="sj-icon-btn danger"
          onClick={onDelete}
          disabled={deleting}
          title="Delete"
        >
          <Delete size={15} />
        </button>
      </div>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function JobModal({
  mode, initial, jobId, onClose, onSaved,
}: {
  mode: 'create' | 'edit'
  initial: JobFormState
  jobId?: string
  onClose: () => void
  onSaved: (job: ScheduledJob) => void
}) {
  const [form, setForm] = useState<JobFormState>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => { firstRef.current?.focus() }, [])

  function update<K extends keyof JobFormState>(key: K, value: JobFormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.prompt.trim()) { setError('Prompt is required'); return }
    if (!form.cron_expr.trim()) { setError('Cron expression is required'); return }
    setSaving(true)
    setError(null)
    try {
      const body = {
        name: form.name.trim() || undefined,
        cron_expr: form.cron_expr.trim(),
        prompt: form.prompt.trim(),
        agent_slug: form.agent_slug.trim() || undefined,
        session_title: form.session_title.trim() || undefined,
        enabled: form.enabled,
      }
      const job = mode === 'create'
        ? await api.post<ScheduledJob>('/scheduler/jobs', body)
        : await api.put<ScheduledJob>(`/scheduler/jobs/${jobId}`, body)
      onSaved(job)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const hint = cronHint(form.cron_expr)

  return (
    <div
      className="sj-backdrop"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="sj-modal" role="dialog" aria-modal="true">
        <div className="sj-modal-header">
          <div>
            <h2>{mode === 'create' ? 'New scheduled job' : 'Edit job'}</h2>
            <p>{mode === 'create' ? 'Define a recurring task that runs a prompt on a cron schedule.' : 'Modify the job settings.'}</p>
          </div>
          <button className="sj-close-btn" onClick={onClose}><Close size={16} /></button>
        </div>

        <form className="sj-modal-body" onSubmit={handleSubmit}>
          {error && <div className="sj-form-error"><Caution size={13} />{error}</div>}

          <div className="sj-field">
            <label>Name <span className="sj-opt">(optional)</span></label>
            <input
              ref={firstRef}
              type="text"
              placeholder="e.g. Daily digest"
              value={form.name}
              onChange={e => update('name', e.target.value)}
            />
          </div>

          <div className="sj-field">
            <label>
              Cron expression <span className="sj-required">*</span>
              {hint && <span className="sj-field-hint">— {hint}</span>}
            </label>
            <input
              type="text"
              placeholder="0 9 * * *"
              value={form.cron_expr}
              onChange={e => update('cron_expr', e.target.value)}
              className="sj-mono"
            />
            <div className="sj-cron-examples">
              {[
                ['Every minute', '* * * * *'],
                ['Hourly',       '0 * * * *'],
                ['Daily 9AM',    '0 9 * * *'],
                ['Every 15min',  '*/15 * * * *'],
                ['Weekdays 8AM', '0 8 * * 1-5'],
              ].map(([label, expr]) => (
                <button
                  key={expr}
                  type="button"
                  className={`sj-preset ${form.cron_expr === expr ? 'active' : ''}`}
                  onClick={() => update('cron_expr', expr)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="sj-field">
            <label>Prompt <span className="sj-required">*</span></label>
            <textarea
              rows={4}
              placeholder="What should the agent do each time this job runs?"
              value={form.prompt}
              onChange={e => update('prompt', e.target.value)}
            />
          </div>

          <div className="sj-field-row">
            <div className="sj-field">
              <label>Agent slug <span className="sj-opt">(optional)</span></label>
              <input
                type="text"
                placeholder="e.g. analyst"
                value={form.agent_slug}
                onChange={e => update('agent_slug', e.target.value)}
              />
            </div>
            <div className="sj-field">
              <label>Session title <span className="sj-opt">(optional)</span></label>
              <input
                type="text"
                placeholder="e.g. Daily report"
                value={form.session_title}
                onChange={e => update('session_title', e.target.value)}
              />
            </div>
          </div>

          <div className="sj-field-inline">
            <label>Enabled</label>
            <button
              type="button"
              className={`sj-toggle ${form.enabled ? 'on' : 'off'}`}
              onClick={() => update('enabled', !form.enabled)}
            >
              <span className="sj-toggle-knob" />
            </button>
            <span className="sj-toggle-label">{form.enabled ? 'Job will run on schedule' : 'Job is paused'}</span>
          </div>

          <div className="sj-modal-footer">
            <button type="button" className="sj-btn ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="sj-btn primary" disabled={saving}>
              {saving ? <><LoadingOne size={14} className="spin" /> Saving…</> : mode === 'create' ? 'Create job' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── TaskAgent panel ──────────────────────────────────────────────────────────

function TaskAgentPanel({
  messages, sessionId, width, onWidthChange,
  onMessagesChange, onSessionIdChange, onClose,
}: {
  messages: ChatMessage[]
  sessionId: string | null
  width: number
  onWidthChange: (w: number) => void
  onMessagesChange: (msgs: ChatMessage[]) => void
  onSessionIdChange: (id: string | null) => void
  onClose: () => void
}) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartW = useRef(width)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    dragStartX.current = e.clientX
    dragStartW.current = width
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const delta = dragStartX.current - ev.clientX
      onWidthChange(Math.max(280, Math.min(600, dragStartW.current + delta)))
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const send = useCallback(async (text: string) => {
    const t = text.trim()
    if (!t || loading) return

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: t }
    const nextMsgs = [...messages, userMsg]
    onMessagesChange(nextMsgs)
    setInput('')
    setLoading(true)

    try {
      const resp = await api.post<{ session_id: string; content: string }>('/query', {
        prompt: t,
        session_id: sessionId ?? undefined,
        execution_origin: 'task_agent',
      })
      if (!sessionId) onSessionIdChange(resp.session_id)
      onMessagesChange([...nextMsgs, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: resp.content,
      }])
    } catch (e: unknown) {
      onMessagesChange([...nextMsgs, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠ ${(e as { message?: string })?.message ?? 'Failed to reach TaskAgent'}`,
      }])
    } finally {
      setLoading(false)
    }
  }, [loading, messages, sessionId, onMessagesChange, onSessionIdChange])

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  const clearConversation = () => { onMessagesChange([]); onSessionIdChange(null) }

  return (
    <div className="ta-panel" style={{ width }}>
      {/* Resize handle on left edge */}
      <div className="ta-resize-handle" onMouseDown={onDragStart} title="Drag to resize" />

      {/* Header */}
      <div className="ta-header">
        <div className="ta-header-left">
          <NexusLogo size={20} className="ta-logo-img" />
          <span className="ta-title">TaskAgent</span>
        </div>
        <div className="ta-header-right">
          {messages.length > 0 && (
            <button className="ta-icon-btn" title="Clear conversation" onClick={clearConversation}>
              <Sync size={13} />
            </button>
          )}
          <button className="ta-icon-btn" title="Close TaskAgent" onClick={onClose}>
            <Close size={13} />
          </button>
        </div>
      </div>

      {/* Messages / welcome */}
      <div className="ta-messages">
        {messages.length === 0 ? (
          <div className="ta-welcome">
            <div className="ta-welcome-card">
              <p className="ta-welcome-greeting">👋 Hi! I'm <strong>TaskAgent</strong>.</p>
              <p className="ta-welcome-sub">I help you create, configure, and<br />troubleshoot scheduled tasks.</p>
              <p className="ta-welcome-sub">Ask me anything about automation!</p>
            </div>

            <p className="ta-section-label">How can I help you today?</p>

            <div className="ta-actions">
              {TASK_AGENT_ACTIONS.map(action => (
                <button
                  key={action.label}
                  className="ta-action-card"
                  onClick={() => send(action.prompt)}
                >
                  <span className="ta-action-icon">{action.icon}</span>
                  <div className="ta-action-text">
                    <span className="ta-action-label">{action.label}</span>
                    <span className="ta-action-desc">{action.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <TaskAgentMessage key={msg.id} msg={msg} />
            ))}
            {loading && (
              <div className="ta-msg ta-msg-assistant">
                <div className="ta-typing">
                  <span className="ta-dot" /><span className="ta-dot" /><span className="ta-dot" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="ta-input-wrap">
        <textarea
          ref={inputRef}
          className="ta-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask TaskAgent…"
          rows={3}
          disabled={loading}
        />
        <div className="ta-input-footer">
          <button
            className={`ta-send-btn${!input.trim() || loading ? ' disabled' : ''}`}
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            title="Send (Enter)"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Agent message ────────────────────────────────────────────────────────────

function TaskAgentMessage({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'user') {
    return (
      <div className="ta-msg ta-msg-user">
        <div className="ta-bubble-user">{msg.content}</div>
      </div>
    )
  }

  const parts = parseAgentContent(msg.content)

  return (
    <div className="ta-msg ta-msg-assistant">
      <div className="ta-bubble-assistant">
        {parts.map((part, i) =>
          part.type === 'text' ? (
            <div key={i} className="ta-text-part">
              <MarkdownView>{part.content}</MarkdownView>
            </div>
          ) : (
            <AgentCodeBlock key={i} lang={part.lang} content={part.content} />
          )
        )}
      </div>
    </div>
  )
}

type ContentPart = { type: 'text'; content: string } | { type: 'code'; lang: string; content: string }

function parseAgentContent(raw: string): ContentPart[] {
  const parts: ContentPart[] = []
  const regex = /```(\w*)\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: raw.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'code', lang: match[1] || '', content: match[2].trimEnd() })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < raw.length) {
    parts.push({ type: 'text', content: raw.slice(lastIndex) })
  }
  return parts
}

function AgentCodeBlock({ lang, content }: { lang: string; content: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="ta-code-block">
      <div className="ta-code-toolbar">
        <span className="ta-code-lang">{lang || 'text'}</span>
        <button className="ta-code-btn" onClick={copy} title="Copy">
          {copied ? <CheckOne size={12} /> : <Copy size={12} />}
        </button>
      </div>
      <pre className="ta-code-pre"><code>{content}</code></pre>
    </div>
  )
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
/* ── Page wrapper (main content + agent panel) ── */
.st-wrap {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* ── Main scrollable area ── */
.sj-root {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 40px 48px;
  background: var(--color-surface);
  color: var(--color-text);
  overflow-y: auto;
  position: relative;
}

/* ── Toast ── */
.sj-toast {
  position: fixed;
  bottom: 28px;
  right: 28px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(0,0,0,0.22);
  animation: sj-slide-in 0.18s ease;
}
.sj-toast.ok  { background: var(--color-bg); border: 1px solid rgba(111,183,123,0.4); color: var(--color-success); }
.sj-toast.err { background: var(--color-bg); border: 1px solid rgba(201,107,92,0.4); color: var(--color-error); }
@keyframes sj-slide-in { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }

/* ── Header ── */
.sj-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}
.sj-header-left { display: flex; align-items: center; gap: 16px; }
.sj-header-icon {
  width: 52px; height: 52px; border-radius: 16px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, transparent);
  color: var(--color-primary);
}
.sj-header h1 { margin: 0 0 4px; font-size: 24px; font-weight: 700; }
.sj-header p  { margin: 0; font-size: 13px; color: var(--color-text-muted); }
.sj-header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* ── Top nav (back button row) ── */
.sj-topnav {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}
.sj-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px 5px 6px;
  border-radius: 7px;
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  letter-spacing: 0.01em;
}
.sj-back-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

/* ── Stats row ── */
.sj-stats-row {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  padding: 14px 20px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 12px;
}
.sj-stat { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.sj-stat-n { font-size: 22px; font-weight: 700; color: var(--color-text); line-height: 1; }
.sj-stat-n.ok  { color: var(--color-success); }
.sj-stat-n.err { color: var(--color-error); }
.sj-stat-n.running { color: var(--color-primary); }
.sj-stat-l { font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }

/* ── Buttons ── */
.sj-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 9px; font-size: 13px; font-weight: 600;
  border: none; cursor: pointer; transition: opacity 0.1s, background 0.1s;
  white-space: nowrap;
}
.sj-btn:disabled { opacity: 0.5; cursor: default; }
.sj-btn.primary { background: var(--color-cta); color: #fff; }
.sj-btn.primary:hover:not(:disabled) { opacity: 0.88; }
.sj-btn.ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
}
.sj-btn.ghost:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }
.sj-btn.ghost.agent-active {
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

/* ── Error banner ── */
.sj-error {
  display: flex; align-items: center; gap: 8px;
  background: rgba(201,107,92,0.08);
  border: 1px solid rgba(201,107,92,0.28);
  padding: 10px 14px; border-radius: 9px;
  font-size: 13px; color: var(--color-error);
  margin-bottom: 16px;
}

/* ── Empty state ── */
.sj-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 16px; padding: 80px 0;
  color: var(--color-text-muted);
}
.sj-empty p { margin: 0; font-size: 14px; }

/* ── List ── */
.sj-list { display: flex; flex-direction: column; gap: 10px; }

/* ── Row ── */
.sj-row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  padding: 16px 18px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  transition: border-color 0.15s;
}
.sj-row:hover { border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border)); }
.sj-row.disabled { opacity: 0.55; }

.sj-row-main { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }

.sj-row-title-line {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.sj-status-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.sj-row-name { font-size: 14px; font-weight: 700; color: var(--color-text); }

.sj-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 5px;
}
.sj-badge.agent  { background: rgba(107,57,203,0.12); color: #8b6fd6; border: 1px solid rgba(107,57,203,0.2); }
.sj-badge.error  { background: rgba(201,107,92,0.1);  color: var(--color-error); border: 1px solid rgba(201,107,92,0.25); }
.sj-badge.running { background: rgba(239,124,47,0.1); color: var(--color-primary); border: 1px solid rgba(239,124,47,0.25); }

.sj-row-prompt {
  font-size: 13px; color: var(--color-text-secondary); line-height: 1.45;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 680px;
}

.sj-row-meta {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 2px;
}
.sj-meta-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: var(--color-text-muted);
}
.sj-meta-chip.cron { color: var(--color-text-secondary); font-weight: 500; }
.sj-meta-chip.muted { color: var(--color-text-muted); }
.sj-cron-hint { color: var(--color-text-muted); }
.sj-abs {
  font-size: 11px; color: var(--color-text-muted);
  margin-left: 2px; opacity: 0.7;
}

.sj-error-inline {
  font-size: 11px; color: var(--color-error);
  background: rgba(201,107,92,0.07); border-radius: 6px;
  padding: 4px 8px; margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ── Row actions ── */
.sj-row-actions {
  display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-top: 2px;
}

.sj-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px;
  background: none; border: none; cursor: pointer;
  color: var(--color-text-muted); border-radius: 7px;
  transition: background 0.1s, color 0.1s;
}
.sj-icon-btn:hover:not(:disabled) { background: var(--color-hover); color: var(--color-text); }
.sj-icon-btn.danger:hover:not(:disabled) { color: var(--color-error); background: rgba(201,107,92,0.08); }
.sj-icon-btn:disabled { opacity: 0.4; cursor: default; }

/* ── Toggle switch ── */
.sj-toggle {
  position: relative; display: inline-flex; align-items: center;
  width: 36px; height: 20px; border-radius: 10px; cursor: pointer;
  border: none; padding: 0; transition: background 0.2s;
  flex-shrink: 0;
}
.sj-toggle.on  { background: var(--color-primary); }
.sj-toggle.off { background: var(--color-border); }
.sj-toggle:disabled { opacity: 0.5; cursor: default; }
.sj-toggle-knob {
  position: absolute; width: 14px; height: 14px; border-radius: 50%;
  background: #fff; transition: left 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.sj-toggle.on  .sj-toggle-knob { left: 19px; }
.sj-toggle.off .sj-toggle-knob { left: 3px; }

/* ── Modal backdrop ── */
.sj-backdrop {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}

/* ── Modal shell ── */
.sj-modal {
  width: 100%; max-width: 640px; max-height: 90vh; overflow-y: auto;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 18px;
  box-shadow: 0 28px 72px rgba(0,0,0,0.32);
}

.sj-modal-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  padding: 22px 24px;
  border-bottom: 1px solid var(--color-border-subtle);
  position: sticky; top: 0; background: var(--color-bg); z-index: 1;
}
.sj-modal-header h2 { margin: 0 0 4px; font-size: 17px; font-weight: 700; }
.sj-modal-header p  { margin: 0; font-size: 13px; color: var(--color-text-muted); }

.sj-close-btn {
  width: 32px; height: 32px; border-radius: 8px;
  border: none; background: transparent; color: var(--color-text-muted);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.sj-close-btn:hover { background: var(--color-hover); color: var(--color-text); }

.sj-modal-body {
  display: flex; flex-direction: column; gap: 18px;
  padding: 22px 24px;
}

/* ── Form elements ── */
.sj-field { display: flex; flex-direction: column; gap: 6px; }
.sj-field label {
  font-size: 12px; font-weight: 600;
  color: var(--color-text-secondary);
}
.sj-field input,
.sj-field textarea,
.sj-field select {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 10px 12px;
  color: var(--color-text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
}
.sj-field input:focus,
.sj-field textarea:focus { border-color: var(--color-primary); }
.sj-field input.sj-mono { font-family: monospace; font-size: 13px; }

.sj-required { color: var(--color-error); font-weight: 700; }
.sj-opt { font-weight: 400; color: var(--color-text-muted); }
.sj-field-hint { font-weight: 400; color: var(--color-primary); font-size: 11px; }

/* ── Cron presets ── */
.sj-cron-examples {
  display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;
}
.sj-preset {
  font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 6px;
  border: 1px solid var(--color-border); background: none;
  color: var(--color-text-muted); cursor: pointer; transition: all 0.1s;
}
.sj-preset:hover { border-color: var(--color-primary); color: var(--color-text); }
.sj-preset.active { border-color: var(--color-primary); color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 8%, transparent); }

/* ── Field row (two columns) ── */
.sj-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

/* ── Field inline (toggle row) ── */
.sj-field-inline {
  display: flex; align-items: center; gap: 12px;
}
.sj-field-inline label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); min-width: 56px; }
.sj-toggle-label { font-size: 13px; color: var(--color-text-secondary); }

/* ── Form error ── */
.sj-form-error {
  display: flex; align-items: center; gap: 8px;
  background: rgba(201,107,92,0.08); border: 1px solid rgba(201,107,92,0.28);
  padding: 9px 12px; border-radius: 8px;
  font-size: 13px; color: var(--color-error);
}

/* ── Modal footer ── */
.sj-modal-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  padding-top: 4px; border-top: 1px solid var(--color-border-subtle); margin-top: 4px;
}

/* ── Spin animation ── */
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.8s linear infinite; display: inline-block; }

/* ════════════════════════════════════════════════════════
   TaskAgent panel
   ════════════════════════════════════════════════════════ */

.ta-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg);
  border-left: 1px solid var(--color-border-subtle);
  overflow: hidden;
  flex-shrink: 0;
}

/* Resize drag handle */
.ta-resize-handle {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
}
.ta-resize-handle:hover { background: var(--color-primary); opacity: 0.4; }

/* Header */
.ta-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}
.ta-header-left { display: flex; align-items: center; gap: 8px; }
.ta-logo-img { opacity: 0.85; }
.ta-title { font-size: 13px; font-weight: 700; color: var(--color-text); }
.ta-header-right { display: flex; align-items: center; gap: 4px; }

.ta-icon-btn {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none;
  color: var(--color-text-muted); border-radius: 7px; cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.ta-icon-btn:hover { background: var(--color-hover); color: var(--color-text); }

/* Messages */
.ta-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
}

/* Welcome state */
.ta-welcome {
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ta-welcome-card {
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 14%, transparent);
  border-radius: 14px;
  padding: 16px;
}
.ta-welcome-greeting { margin: 0 0 6px; font-size: 14px; color: var(--color-text); }
.ta-welcome-sub { margin: 0 0 4px; font-size: 12px; color: var(--color-text-muted); line-height: 1.5; }
.ta-welcome-sub:last-child { margin-bottom: 0; }
.ta-section-label {
  font-size: 11px; font-weight: 700; color: var(--color-text-muted);
  text-transform: uppercase; letter-spacing: 0.06em; margin: 0;
}
.ta-actions { display: flex; flex-direction: column; gap: 6px; }
.ta-action-card {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 10px 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px; cursor: pointer; text-align: left;
  transition: border-color 0.15s, background 0.15s; width: 100%;
}
.ta-action-card:hover {
  border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary) 4%, var(--color-surface));
}
.ta-action-icon { font-size: 16px; line-height: 1; flex-shrink: 0; margin-top: 1px; color: var(--color-primary); }
.ta-action-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ta-action-label { font-size: 13px; font-weight: 600; color: var(--color-text); display: block; }
.ta-action-desc { font-size: 11px; color: var(--color-text-muted); line-height: 1.4; display: block; }

/* Messages */
.ta-msg { padding: 6px 14px; display: flex; flex-direction: column; }
.ta-msg-user { align-items: flex-end; }
.ta-msg-assistant { align-items: flex-start; }
.ta-bubble-user {
  background: var(--color-primary); color: white;
  padding: 9px 13px; border-radius: 14px 14px 4px 14px;
  font-size: 13px; line-height: 1.5; max-width: 88%; word-break: break-word;
}
.ta-bubble-assistant { max-width: 96%; font-size: 13px; color: var(--color-text); line-height: 1.6; }
.ta-text-part { margin-bottom: 4px; }

/* Typing indicator */
.ta-typing { display: flex; gap: 4px; padding: 10px 2px; }
.ta-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--color-text-muted);
  animation: ta-bounce 1.2s infinite;
}
.ta-dot:nth-child(2) { animation-delay: 0.2s; }
.ta-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes ta-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
  40% { transform: translateY(-5px); opacity: 1; }
}

/* Code block */
.ta-code-block {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 8px; overflow: hidden; margin: 6px 0;
}
.ta-code-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 5px 10px; border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
}
.ta-code-lang { font-size: 11px; font-weight: 600; color: var(--color-text-muted); font-family: monospace; }
.ta-code-btn {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px;
  background: none; border: none; color: var(--color-text-muted); border-radius: 5px; cursor: pointer;
}
.ta-code-btn:hover { background: var(--color-hover); color: var(--color-text); }
.ta-code-pre {
  margin: 0; padding: 10px 12px;
  font-size: 12px; font-family: monospace; line-height: 1.6;
  overflow-x: auto; color: var(--color-text); white-space: pre;
}

/* Input area */
.ta-input-wrap {
  border-top: 1px solid var(--color-border-subtle);
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;
}
.ta-input {
  width: 100%; background: var(--color-surface);
  border: 1px solid var(--color-border); border-radius: 10px;
  padding: 10px 12px; color: var(--color-text);
  font-size: 13px; font-family: inherit; resize: none; outline: none;
  line-height: 1.5; transition: border-color 0.15s; box-sizing: border-box;
}
.ta-input:focus { border-color: var(--color-primary); }
.ta-input:disabled { opacity: 0.6; }
.ta-input::placeholder { color: var(--color-text-muted); }
.ta-input-footer { display: flex; justify-content: flex-end; }
.ta-send-btn {
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px;
  background: var(--color-primary); color: white;
  border: none; border-radius: 9px; cursor: pointer; transition: opacity 0.15s;
}
.ta-send-btn:hover:not(.disabled) { opacity: 0.88; }
.ta-send-btn.disabled { opacity: 0.35; cursor: default; }
`
