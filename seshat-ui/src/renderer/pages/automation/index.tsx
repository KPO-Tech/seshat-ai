import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Left, Plus, Sync, Delete, Edit, CheckOne, Caution, Pause, Play,
  LoadingOne, Close, Flashlamp, Time, Robot, Timer,
} from '@icon-park/react'
import { api } from '@/api/client'
import { useUIStore } from '@/stores/ui'
import type {
  AutomationJob,
  AutomationRun,
  CreateAutomationJobBody,
  AutomationTrigger,
  AutomationAgentConfig,
  Agent,
} from '@/api/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const abs = Math.abs(diff)
  const future = diff < 0
  if (abs < 60_000) return future ? 'in a moment' : 'just now'
  if (abs < 3_600_000) { const m = Math.round(abs / 60_000); return future ? `in ${m}m` : `${m}m ago` }
  if (abs < 86_400_000) { const h = Math.round(abs / 3_600_000); return future ? `in ${h}h` : `${h}h ago` }
  const d = Math.round(abs / 86_400_000)
  return future ? `in ${d}d` : `${d}d ago`
}

function triggerLabel(trigger: AutomationTrigger): string {
  switch (trigger.type) {
    case 'cron':     return trigger.cron ?? ''
    case 'interval': return `every ${trigger.interval ?? ''}`
    case 'once':     return trigger.run_at
      ? `once — ${new Date(trigger.run_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
      : 'once'
    default:         return trigger.type
  }
}

const STATUS_COLOR: Record<string, string> = {
  active:   'var(--color-success)',
  paused:   'var(--color-text-muted)',
  inactive: 'var(--color-text-muted)',
}

const RUN_COLOR: Record<string, string> = {
  success: 'var(--color-success)',
  error:   'var(--color-error)',
  running: 'var(--color-primary)',
  '':      'var(--color-text-muted)',
}

const TOOLS_OPTIONS = ['read', 'write', 'bash', 'glob', 'grep', 'web_search', 'web_fetch', 'task_create', 'task_update']
const BASE_TYPES    = ['general-purpose', 'explore', 'plan']

// ─── Form state ───────────────────────────────────────────────────────────────

type TriggerForm = {
  type: 'cron' | 'interval' | 'once'
  cron: string
  intervalValue: string
  intervalUnit: 'minutes' | 'hours' | 'days' | 'weeks'
  runAt: string
}

type AgentForm = {
  agentSlug: string
  baseType: string
  tools: string[]
  skills: string
  model: string
  maxTurns: string
  systemPrompt: string
}

type JobForm = {
  name: string
  description: string
  task: string
  trigger: TriggerForm
  agent: AgentForm
}

const EMPTY_FORM: JobForm = {
  name: '',
  description: '',
  task: '',
  trigger: { type: 'cron', cron: '0 9 * * *', intervalValue: '24', intervalUnit: 'hours', runAt: '' },
  agent: { agentSlug: '', baseType: 'general-purpose', tools: [], skills: '', model: '', maxTurns: '0', systemPrompt: '' },
}

function formToBody(f: JobForm): CreateAutomationJobBody {
  let trigger: AutomationTrigger
  if (f.trigger.type === 'cron') {
    trigger = { type: 'cron', cron: f.trigger.cron.trim() }
  } else if (f.trigger.type === 'interval') {
    const unitMap = { minutes: 'm', hours: 'h', days: 'h', weeks: 'h' }
    const multiplier = { minutes: 1, hours: 1, days: 24, weeks: 168 }
    const val = parseInt(f.trigger.intervalValue, 10) || 1
    const hours = val * (multiplier[f.trigger.intervalUnit] || 1)
    const suffix = f.trigger.intervalUnit === 'minutes' ? 'm' : 'h'
    trigger = { type: 'interval', interval: `${hours}${suffix === 'm' ? 'm' : 'h'}` }
  } else {
    trigger = { type: 'once', run_at: f.trigger.runAt }
  }

  const agent: AutomationAgentConfig = {
    slug:          f.agent.agentSlug.trim() || undefined,
    base_type:     f.agent.agentSlug.trim() ? undefined : (f.agent.baseType || undefined),
    tools:         f.agent.tools.length ? f.agent.tools : undefined,
    skills:        f.agent.skills.trim() ? f.agent.skills.split(',').map(s => s.trim()).filter(Boolean) : undefined,
    model:         f.agent.model.trim() || undefined,
    max_turns:     parseInt(f.agent.maxTurns, 10) || undefined,
    system_prompt: f.agent.systemPrompt.trim() || undefined,
  }

  return { name: f.name, description: f.description, trigger, agent, task: f.task }
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AutomationPage() {
  const navigate        = useNavigate()
  const closeRightPanel = useUIStore(s => s.closeRightPanel)

  const [jobs,        setJobs]        = useState<AutomationJob[]>([])
  const [selected,    setSelected]    = useState<AutomationJob | null>(null)
  const [runs,        setRuns]        = useState<AutomationRun[]>([])
  const [agents,      setAgents]      = useState<Agent[]>([])
  const [loading,     setLoading]     = useState(true)
  const [runsLoading, setRunsLoading] = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [formOpen,    setFormOpen]    = useState(false)
  const [editing,     setEditing]     = useState<AutomationJob | null>(null)
  const [formStep,    setFormStep]    = useState<0 | 1 | 2>(0)
  const [form,        setForm]        = useState<JobForm>(EMPTY_FORM)
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState<string | null>(null)

  useEffect(() => { closeRightPanel() }, [closeRightPanel])

  useEffect(() => {
    api.get<Agent[]>('/agents').then(data => setAgents(data ?? [])).catch(() => {})
  }, [])

  const loadJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get<AutomationJob[]>('/automation/jobs')
      setJobs(data ?? [])
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to load automations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadJobs() }, [loadJobs])

  async function loadRuns(jobId: string) {
    setRunsLoading(true)
    try {
      const data = await api.get<AutomationRun[]>(`/automation/jobs/${jobId}/runs`)
      setRuns(data ?? [])
    } catch {
      setRuns([])
    } finally {
      setRunsLoading(false)
    }
  }

  function selectJob(job: AutomationJob) {
    setSelected(job)
    loadRuns(job.id)
  }

  async function handleRunNow(job: AutomationJob) {
    try {
      await api.post(`/automation/jobs/${job.id}/run`)
      await loadJobs()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to trigger job')
    }
  }

  async function handleTogglePause(job: AutomationJob) {
    const endpoint = job.status === 'paused' ? 'resume' : 'pause'
    try {
      const updated = await api.put<AutomationJob>(`/automation/jobs/${job.id}/${endpoint}`)
      setJobs(js => js.map(j => j.id === updated.id ? updated : j))
      if (selected?.id === updated.id) setSelected(updated)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to update job')
    }
  }

  async function handleDelete(job: AutomationJob) {
    if (!confirm(`Delete automation "${job.name}"?`)) return
    try {
      await api.delete(`/automation/jobs/${job.id}`)
      setJobs(js => js.filter(j => j.id !== job.id))
      if (selected?.id === job.id) setSelected(null)
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to delete job')
    }
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormStep(0)
    setSaveError(null)
    setFormOpen(true)
  }

  function openEdit(job: AutomationJob) {
    setEditing(job)
    setForm({
      name: job.name,
      description: job.description,
      task: job.task,
      trigger: {
        type: job.trigger.type,
        cron: job.trigger.cron ?? '0 9 * * *',
        intervalValue: '24',
        intervalUnit: 'hours',
        runAt: job.trigger.run_at ?? '',
      },
      agent: {
        agentSlug:    job.agent?.slug ?? '',
        baseType:     job.agent?.base_type ?? 'general-purpose',
        tools:        job.agent?.tools ?? [],
        skills:       (job.agent?.skills ?? []).join(', '),
        model:        job.agent?.model ?? '',
        maxTurns:     String(job.agent?.max_turns ?? 0),
        systemPrompt: job.agent?.system_prompt ?? '',
      },
    })
    setFormStep(0)
    setSaveError(null)
    setFormOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { setSaveError('Name is required'); return }
    if (!form.task.trim())  { setSaveError('Task description is required'); return }
    setSaving(true)
    setSaveError(null)
    try {
      const body = formToBody(form)
      if (editing) {
        const updated = await api.put<AutomationJob>(`/automation/jobs/${editing.id}`, body)
        setJobs(js => js.map(j => j.id === updated.id ? updated : j))
        if (selected?.id === updated.id) setSelected(updated)
      } else {
        const created = await api.post<AutomationJob>('/automation/jobs', body)
        setJobs(js => [created, ...js])
      }
      setFormOpen(false)
    } catch (e: unknown) {
      setSaveError((e as { message?: string })?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function toggleTool(t: string) {
    setForm(f => ({
      ...f,
      agent: {
        ...f.agent,
        tools: f.agent.tools.includes(t)
          ? f.agent.tools.filter(x => x !== t)
          : [...f.agent.tools, t],
      },
    }))
  }

  return (
    <div className="at-root">
      <style>{CSS}</style>

      {/* ── Top bar ── */}
      <header className="at-topbar">
        <button className="at-back-chip" onClick={() => navigate('/')}>
          <Left size={14} /> Home
        </button>
        <span className="at-topbar-title">Automations</span>
        <div className="at-topbar-actions">
          <button className="at-icon-btn" onClick={loadJobs} title="Refresh">
            <Sync size={16} />
          </button>
          <button className="at-new-btn" onClick={openCreate}>
            <Plus size={14} /> New Automation
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="at-body">

        {/* ── Job list ── */}
        <div className={`at-list-col${selected ? ' has-detail' : ''}`}>
          {loading && (
            <div className="at-state">
              <LoadingOne size={24} className="at-spin" />
              <span>Loading…</span>
            </div>
          )}
          {!loading && error && (
            <div className="at-state error">
              <Caution size={20} /> {error}
            </div>
          )}
          {!loading && !error && jobs.length === 0 && (
            <div className="at-empty">
              <Timer size={40} className="at-empty-icon" theme="outline" />
              <p className="at-empty-title">No automations yet</p>
              <p className="at-empty-sub">Create your first automation to run agents on a schedule.</p>
              <button className="at-new-btn" onClick={openCreate}>
                <Plus size={14} /> New Automation
              </button>
            </div>
          )}
          {!loading && jobs.map(job => (
            <div
              key={job.id}
              className={`at-card${selected?.id === job.id ? ' selected' : ''}`}
              onClick={() => selectJob(job)}
            >
              <div className="at-card-head">
                <span
                  className="at-status-dot"
                  style={{ background: STATUS_COLOR[job.status] ?? 'var(--color-text-muted)' }}
                  title={job.status}
                />
                <span className="at-card-name">{job.name}</span>
                <div className="at-card-actions" onClick={e => e.stopPropagation()}>
                  <button className="at-icon-btn" title="Run now" onClick={() => handleRunNow(job)}>
                    <Flashlamp size={14} />
                  </button>
                  <button className="at-icon-btn" title={job.status === 'paused' ? 'Resume' : 'Pause'} onClick={() => handleTogglePause(job)}>
                    {job.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                  </button>
                  <button className="at-icon-btn" title="Edit" onClick={() => openEdit(job)}>
                    <Edit size={14} />
                  </button>
                  <button className="at-icon-btn danger" title="Delete" onClick={() => handleDelete(job)}>
                    <Delete size={14} />
                  </button>
                </div>
              </div>
              {job.description && <p className="at-card-desc">{job.description}</p>}
              <div className="at-card-meta">
                <span className="at-meta-chip">
                  <Time size={12} /> {triggerLabel(job.trigger)}
                </span>
                {job.agent?.base_type && (
                  <span className="at-meta-chip">
                    <Robot size={12} /> {job.agent.base_type}
                  </span>
                )}
                {job.last_run_status && (
                  <span className="at-meta-chip" style={{ color: RUN_COLOR[job.last_run_status] }}>
                    {job.last_run_status === 'success' && <CheckOne size={12} />}
                    {job.last_run_status === 'error'   && <Caution size={12} />}
                    {job.last_run_status}
                  </span>
                )}
              </div>
              <div className="at-card-times">
                {job.last_run_at  && <span>Last: {relativeTime(job.last_run_at)}</span>}
                {job.next_run_at  && <span>Next: {relativeTime(job.next_run_at)}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* ── Detail panel ── */}
        {selected && (
          <div className="at-detail-col">
            <div className="at-detail-head">
              <span className="at-detail-name">{selected.name}</span>
              <button className="at-icon-btn" onClick={() => setSelected(null)}>
                <Close size={16} />
              </button>
            </div>

            {selected.description && (
              <p className="at-detail-desc">{selected.description}</p>
            )}

            <div className="at-detail-section">
              <span className="at-section-label">Trigger</span>
              <code className="at-code">{triggerLabel(selected.trigger)}</code>
            </div>

            <div className="at-detail-section">
              <span className="at-section-label">Agent</span>
              <div className="at-kv">
                {selected.agent?.base_type && <><span>Type</span><span>{selected.agent.base_type}</span></>}
                {selected.agent?.model     && <><span>Model</span><span>{selected.agent.model}</span></>}
                {(selected.agent?.max_turns ?? 0) > 0 && <><span>Max turns</span><span>{selected.agent.max_turns}</span></>}
                {(selected.agent?.tools?.length ?? 0) > 0 && (
                  <><span>Tools</span><span className="at-tags">{selected.agent!.tools!.map(t => <span key={t} className="at-tag">{t}</span>)}</span></>
                )}
                {(selected.agent?.skills?.length ?? 0) > 0 && (
                  <><span>Skills</span><span className="at-tags">{selected.agent!.skills!.map(t => <span key={t} className="at-tag">{t}</span>)}</span></>
                )}
              </div>
            </div>

            <div className="at-detail-section">
              <span className="at-section-label">Task</span>
              <pre className="at-pre">{selected.task}</pre>
            </div>

            <div className="at-detail-section">
              <span className="at-section-label">
                Run history
                {runsLoading && <LoadingOne size={12} className="at-spin" style={{ marginLeft: 6 }} />}
              </span>
              {!runsLoading && runs.length === 0 && (
                <p className="at-runs-empty">No runs yet.</p>
              )}
              {runs.map(run => (
                <div key={run.id} className="at-run">
                  <span
                    className="at-run-dot"
                    style={{ background: RUN_COLOR[run.status] }}
                    title={run.status}
                  />
                  <span className="at-run-time">{relativeTime(run.started_at)}</span>
                  {run.ended_at && (
                    <span className="at-run-dur">
                      {Math.round((new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s
                    </span>
                  )}
                  {run.error && <span className="at-run-err">{run.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Create / Edit form ── */}
      {formOpen && (
        <div className="at-overlay" onClick={() => setFormOpen(false)}>
          <div className="at-modal" onClick={e => e.stopPropagation()}>
            <div className="at-modal-head">
              <span className="at-modal-title">{editing ? 'Edit Automation' : 'New Automation'}</span>
              <button className="at-icon-btn" onClick={() => setFormOpen(false)}><Close size={16} /></button>
            </div>

            {/* Step tabs */}
            <div className="at-steps">
              {(['Trigger', 'Agent', 'Task'] as const).map((label, i) => (
                <button
                  key={label}
                  className={`at-step${formStep === i ? ' active' : ''}`}
                  onClick={() => setFormStep(i as 0 | 1 | 2)}
                >
                  <span className="at-step-num">{i + 1}</span>
                  {label}
                </button>
              ))}
            </div>

            <div className="at-modal-body">

              {/* ── Step 0: Trigger ── */}
              {formStep === 0 && (
                <div className="at-form-section">
                  <div className="at-field">
                    <label>Trigger type</label>
                    <div className="at-radio-group">
                      {(['cron', 'interval', 'once'] as const).map(t => (
                        <button
                          key={t}
                          className={`at-radio${form.trigger.type === t ? ' active' : ''}`}
                          onClick={() => setForm(f => ({ ...f, trigger: { ...f.trigger, type: t } }))}
                        >
                          {t === 'cron' ? 'Cron schedule' : t === 'interval' ? 'Fixed interval' : 'One time'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {form.trigger.type === 'cron' && (
                    <div className="at-field">
                      <label>Cron expression <span className="at-hint">min hour dom month dow</span></label>
                      <input
                        className="at-input"
                        value={form.trigger.cron}
                        onChange={e => setForm(f => ({ ...f, trigger: { ...f.trigger, cron: e.target.value } }))}
                        placeholder="0 9 * * 1-5"
                      />
                      <div className="at-cron-presets">
                        {[['0 9 * * *', 'Daily 9h'], ['0 9 * * 1-5', 'Weekdays'], ['0 0 * * 1', 'Weekly'], ['0 0 1 * *', 'Monthly']].map(([expr, lbl]) => (
                          <button key={expr} className="at-preset-btn" onClick={() => setForm(f => ({ ...f, trigger: { ...f.trigger, cron: expr } }))}>{lbl}</button>
                        ))}
                      </div>
                    </div>
                  )}

                  {form.trigger.type === 'interval' && (
                    <div className="at-field">
                      <label>Run every</label>
                      <div className="at-row">
                        <input
                          className="at-input short"
                          type="number"
                          min="1"
                          value={form.trigger.intervalValue}
                          onChange={e => setForm(f => ({ ...f, trigger: { ...f.trigger, intervalValue: e.target.value } }))}
                        />
                        <select
                          className="at-select"
                          value={form.trigger.intervalUnit}
                          onChange={e => setForm(f => ({ ...f, trigger: { ...f.trigger, intervalUnit: e.target.value as TriggerForm['intervalUnit'] } }))}
                        >
                          <option value="minutes">minutes</option>
                          <option value="hours">hours</option>
                          <option value="days">days</option>
                          <option value="weeks">weeks</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {form.trigger.type === 'once' && (
                    <div className="at-field">
                      <label>Run at</label>
                      <input
                        className="at-input"
                        type="datetime-local"
                        value={form.trigger.runAt.slice(0, 16)}
                        onChange={e => setForm(f => ({ ...f, trigger: { ...f.trigger, runAt: new Date(e.target.value).toISOString() } }))}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 1: Agent ── */}
              {formStep === 1 && (
                <div className="at-form-section">
                  <div className="at-field">
                    <label>Agent definition <span className="at-hint">optional — overrides inline config below</span></label>
                    <select
                      className="at-input"
                      value={form.agent.agentSlug}
                      onChange={e => setForm(f => ({ ...f, agent: { ...f.agent, agentSlug: e.target.value } }))}
                    >
                      <option value="">— use inline config —</option>
                      {agents.map(a => (
                        <option key={a.slug} value={a.slug}>{a.name || a.slug}</option>
                      ))}
                    </select>
                  </div>

                  {!form.agent.agentSlug && (
                  <div className="at-field">
                    <label>Agent type</label>
                    <div className="at-radio-group">
                      {BASE_TYPES.map(t => (
                        <button
                          key={t}
                          className={`at-radio${form.agent.baseType === t ? ' active' : ''}`}
                          onClick={() => setForm(f => ({ ...f, agent: { ...f.agent, baseType: t } }))}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  )}

                  <div className="at-field">
                    <label>Allowed tools <span className="at-hint">empty = all tools</span></label>
                    <div className="at-tools-grid">
                      {TOOLS_OPTIONS.map(t => (
                        <label key={t} className={`at-tool-chip${form.agent.tools.includes(t) ? ' active' : ''}`}>
                          <input type="checkbox" checked={form.agent.tools.includes(t)} onChange={() => toggleTool(t)} />
                          {t}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="at-field">
                    <label>Skills <span className="at-hint">comma-separated skill names</span></label>
                    <input
                      className="at-input"
                      value={form.agent.skills}
                      onChange={e => setForm(f => ({ ...f, agent: { ...f.agent, skills: e.target.value } }))}
                      placeholder="my-skill, another-skill"
                    />
                  </div>

                  <div className="at-row-fields">
                    <div className="at-field flex-1">
                      <label>Model override <span className="at-hint">optional</span></label>
                      <input
                        className="at-input"
                        value={form.agent.model}
                        onChange={e => setForm(f => ({ ...f, agent: { ...f.agent, model: e.target.value } }))}
                        placeholder="anthropic:claude-sonnet-4-6"
                      />
                    </div>
                    <div className="at-field w120">
                      <label>Max turns <span className="at-hint">0 = 1</span></label>
                      <input
                        className="at-input"
                        type="number"
                        min="0"
                        value={form.agent.maxTurns}
                        onChange={e => setForm(f => ({ ...f, agent: { ...f.agent, maxTurns: e.target.value } }))}
                      />
                    </div>
                  </div>

                  <div className="at-field">
                    <label>System prompt <span className="at-hint">optional — replaces the default</span></label>
                    <textarea
                      className="at-textarea short"
                      value={form.agent.systemPrompt}
                      onChange={e => setForm(f => ({ ...f, agent: { ...f.agent, systemPrompt: e.target.value } }))}
                      placeholder="You are a specialized agent that…"
                    />
                  </div>
                </div>
              )}

              {/* ── Step 2: Task ── */}
              {formStep === 2 && (
                <div className="at-form-section">
                  <div className="at-field">
                    <label>Name <span className="at-required">*</span></label>
                    <input
                      className="at-input"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Daily tech digest"
                      autoFocus
                    />
                  </div>

                  <div className="at-field">
                    <label>Description <span className="at-hint">optional</span></label>
                    <input
                      className="at-input"
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="What this automation does"
                    />
                  </div>

                  <div className="at-field">
                    <label>Task prompt <span className="at-required">*</span></label>
                    <textarea
                      className="at-textarea"
                      value={form.task}
                      onChange={e => setForm(f => ({ ...f, task: e.target.value }))}
                      placeholder="Search for recent news on AI agents and produce a summary with key takeaways…"
                    />
                  </div>
                </div>
              )}
            </div>

            {saveError && (
              <div className="at-form-error"><Caution size={14} /> {saveError}</div>
            )}

            <div className="at-modal-foot">
              <div className="at-step-nav">
                {formStep > 0 && (
                  <button className="at-btn ghost" onClick={() => setFormStep(s => (s - 1) as 0 | 1 | 2)}>
                    ← Back
                  </button>
                )}
                {formStep < 2 && (
                  <button className="at-btn primary" onClick={() => setFormStep(s => (s + 1) as 0 | 1 | 2)}>
                    Next →
                  </button>
                )}
                {formStep === 2 && (
                  <button className="at-btn primary" onClick={handleSave} disabled={saving}>
                    {saving ? <LoadingOne size={14} className="at-spin" /> : <CheckOne size={14} />}
                    {editing ? 'Save changes' : 'Create automation'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
.at-root {
  display: flex; flex-direction: column;
  width: 100%; height: 100%;
  background: var(--color-bg-primary, #1e1d23);
  color: var(--color-text);
  font-family: var(--font-sans);
}

/* ── Top bar ── */
.at-topbar {
  display: flex; align-items: center; gap: 10px;
  padding: 0 20px; height: 52px; flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
}
.at-back-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 8px; border: none; cursor: pointer;
  background: var(--color-hover); color: var(--color-text-secondary);
  font-size: 12px;
}
.at-back-chip:hover { background: var(--color-border); }
.at-topbar-title {
  font-size: 15px; font-weight: 600;
  color: var(--color-text);
}
.at-topbar-actions { margin-left: auto; display: flex; align-items: center; gap: 8px; }

/* ── Body ── */
.at-body {
  flex: 1; display: flex; overflow: hidden;
}
.at-list-col {
  flex: 1; overflow-y: auto; padding: 20px;
  display: flex; flex-direction: column; gap: 10px;
}
.at-list-col.has-detail { max-width: 480px; border-right: 1px solid var(--color-border); }

/* ── State ── */
.at-state {
  display: flex; align-items: center; gap: 10px;
  padding: 40px; color: var(--color-text-muted); font-size: 14px;
}
.at-state.error { color: var(--color-error); }
.at-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px; padding: 60px 20px; text-align: center;
}
.at-empty-icon { color: var(--color-text-muted); opacity: 0.4; }
.at-empty-title { font-size: 16px; font-weight: 600; color: var(--color-text); margin: 0; }
.at-empty-sub { font-size: 13px; color: var(--color-text-muted); margin: 0 0 8px; }

/* ── Cards ── */
.at-card {
  background: var(--color-surface, #2a2932);
  border: 1px solid var(--color-border); border-radius: 12px;
  padding: 14px 16px; cursor: pointer;
  transition: border-color 0.12s;
}
.at-card:hover { border-color: var(--color-primary); }
.at-card.selected { border-color: var(--color-primary); background: var(--color-hover); }
.at-card-head {
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
}
.at-status-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}
.at-card-name { font-size: 14px; font-weight: 600; flex: 1; }
.at-card-actions {
  display: flex; gap: 2px; opacity: 0;
  transition: opacity 0.12s;
}
.at-card:hover .at-card-actions { opacity: 1; }
.at-card-desc {
  font-size: 12px; color: var(--color-text-muted);
  margin: 0 0 8px; line-height: 1.4;
}
.at-card-meta {
  display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px;
}
.at-meta-chip {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: var(--color-text-secondary);
  background: var(--color-hover); padding: 2px 7px; border-radius: 4px;
}
.at-card-times {
  display: flex; gap: 12px;
  font-size: 11px; color: var(--color-text-muted);
}

/* ── Detail panel ── */
.at-detail-col {
  flex: 1; overflow-y: auto; padding: 20px 24px;
}
.at-detail-head {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
}
.at-detail-name { font-size: 16px; font-weight: 600; }
.at-detail-desc { font-size: 13px; color: var(--color-text-muted); margin: 0 0 16px; }
.at-detail-section { margin-bottom: 20px; }
.at-section-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--color-text-muted);
  margin-bottom: 8px;
}
.at-code {
  display: inline-block; font-family: var(--font-mono);
  font-size: 12px; padding: 4px 8px; border-radius: 5px;
  background: var(--color-hover); color: var(--color-text-secondary);
}
.at-kv {
  display: grid; grid-template-columns: auto 1fr;
  gap: 4px 12px; font-size: 13px;
}
.at-kv > span:nth-child(odd) { color: var(--color-text-muted); }
.at-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.at-tag {
  font-size: 11px; padding: 2px 7px; border-radius: 4px;
  background: var(--color-hover); color: var(--color-text-secondary);
}
.at-pre {
  margin: 0; padding: 10px 12px; border-radius: 8px;
  background: var(--color-hover); font-family: var(--font-mono);
  font-size: 12px; line-height: 1.6; white-space: pre-wrap;
  color: var(--color-text-secondary); max-height: 160px; overflow-y: auto;
}
.at-runs-empty { font-size: 12px; color: var(--color-text-muted); margin: 0; }
.at-run {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 0; border-bottom: 1px solid var(--color-border);
  font-size: 12px;
}
.at-run-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.at-run-time { color: var(--color-text-secondary); }
.at-run-dur { color: var(--color-text-muted); }
.at-run-err { color: var(--color-error); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Shared buttons ── */
.at-new-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 8px; border: none; cursor: pointer;
  background: var(--color-cta, var(--color-primary)); color: #fff;
  font-size: 13px; font-weight: 600;
}
.at-new-btn:hover { opacity: 0.88; }
.at-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 7px; border: none; cursor: pointer;
  background: none; color: var(--color-text-muted);
}
.at-icon-btn:hover { background: var(--color-hover); color: var(--color-text); }
.at-icon-btn.danger:hover { background: color-mix(in srgb, var(--color-error) 15%, transparent); color: var(--color-error); }
.at-spin { animation: at-spin 1s linear infinite; }
@keyframes at-spin { to { transform: rotate(360deg); } }

/* ── Modal ── */
.at-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
}
.at-modal {
  background: var(--color-surface, #2a2932);
  border: 1px solid var(--color-border); border-radius: 16px;
  width: 540px; max-height: 80vh;
  display: flex; flex-direction: column; overflow: hidden;
}
.at-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--color-border);
}
.at-modal-title { font-size: 15px; font-weight: 600; }
.at-steps {
  display: flex; gap: 0;
  border-bottom: 1px solid var(--color-border);
}
.at-step {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 10px; border: none; cursor: pointer;
  background: none; color: var(--color-text-muted); font-size: 13px;
  border-bottom: 2px solid transparent;
}
.at-step.active { color: var(--color-text); border-bottom-color: var(--color-primary); }
.at-step-num {
  width: 20px; height: 20px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
  background: var(--color-hover); color: var(--color-text-muted);
}
.at-step.active .at-step-num {
  background: var(--color-primary); color: #fff;
}
.at-modal-body { flex: 1; overflow-y: auto; padding: 20px; }
.at-modal-foot {
  padding: 14px 20px; border-top: 1px solid var(--color-border);
}
.at-step-nav { display: flex; justify-content: flex-end; gap: 8px; }
.at-form-error {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 20px; font-size: 12px; color: var(--color-error);
}

/* ── Form fields ── */
.at-form-section { display: flex; flex-direction: column; gap: 16px; }
.at-field { display: flex; flex-direction: column; gap: 6px; }
.at-field label { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.at-hint { font-weight: 400; color: var(--color-text-muted); }
.at-required { color: var(--color-error); }
.at-input {
  padding: 8px 10px; border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-hover); color: var(--color-text);
  font-size: 13px; font-family: var(--font-sans);
  outline: none;
}
.at-input:focus { border-color: var(--color-primary); }
.at-input.short { width: 80px; }
.at-select {
  padding: 8px 10px; border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-hover); color: var(--color-text);
  font-size: 13px; cursor: pointer; outline: none;
}
.at-textarea {
  padding: 10px 12px; border-radius: 8px;
  border: 1px solid var(--color-border);
  background: var(--color-hover); color: var(--color-text);
  font-size: 13px; font-family: var(--font-sans);
  line-height: 1.5; resize: vertical; min-height: 120px; outline: none;
}
.at-textarea.short { min-height: 72px; }
.at-textarea:focus { border-color: var(--color-primary); }
.at-row { display: flex; gap: 8px; align-items: center; }
.at-row-fields { display: flex; gap: 12px; }
.at-row-fields .flex-1 { flex: 1; }
.at-row-fields .w120 { width: 120px; }
.at-radio-group { display: flex; gap: 6px; flex-wrap: wrap; }
.at-radio {
  padding: 6px 12px; border-radius: 7px;
  border: 1px solid var(--color-border);
  background: none; color: var(--color-text-secondary);
  font-size: 12px; cursor: pointer;
}
.at-radio.active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 15%, transparent);
  color: var(--color-text);
}
.at-cron-presets { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.at-preset-btn {
  padding: 3px 9px; border-radius: 5px;
  border: 1px solid var(--color-border); background: none;
  color: var(--color-text-muted); font-size: 11px; cursor: pointer;
}
.at-preset-btn:hover { border-color: var(--color-primary); color: var(--color-text); }
.at-tools-grid {
  display: flex; flex-wrap: wrap; gap: 6px;
}
.at-tool-chip {
  display: inline-flex; align-items: center; gap: 5px; cursor: pointer;
  padding: 4px 10px; border-radius: 6px; font-size: 12px;
  border: 1px solid var(--color-border); color: var(--color-text-muted);
  user-select: none;
}
.at-tool-chip input { display: none; }
.at-tool-chip.active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 15%, transparent);
  color: var(--color-text);
}
.at-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer;
  font-size: 13px; font-weight: 600;
}
.at-btn.primary {
  background: var(--color-cta, var(--color-primary)); color: #fff;
}
.at-btn.primary:hover { opacity: 0.88; }
.at-btn.primary:disabled { opacity: 0.5; cursor: default; }
.at-btn.ghost {
  background: none; border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}
.at-btn.ghost:hover { background: var(--color-hover); }
`
