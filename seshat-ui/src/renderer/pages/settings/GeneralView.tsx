import { useState, useEffect, useCallback } from 'react'
import { User, Edit, Check, Info, Lightning } from '@icon-park/react'
import { api } from '@/api/client'
import type { UserPreferences } from '@/api/types'

const EMPTY: UserPreferences = {
  preferred_name: '',
  profession: '',
  about: '',
  working_style: '',
  response_style: '',
  extra_context: '',
  interactive_permission_mode: 'onRequest',
  automation_permission_mode: 'never',
}

type PermissionModeOption = { value: string; label: string; description: string }

const INTERACTIVE_MODES: PermissionModeOption[] = [
  { value: 'onRequest', label: 'Ask', description: 'Prompt for approval on each tool use' },
  { value: 'auto', label: 'Auto', description: 'Auto-approve safe tools, ask for risky ones' },
  { value: 'bypass', label: 'Bypass', description: 'Never prompt — approve everything automatically' },
]

const AUTOMATION_MODES: PermissionModeOption[] = [
  { value: 'never', label: 'Never', description: 'Block all executions (safest for automation)' },
  { value: 'onRequest', label: 'Ask', description: 'Route approval requests when possible' },
  { value: 'auto', label: 'Auto', description: 'Auto-approve safe tools in automated runs' },
  { value: 'bypass', label: 'Bypass', description: 'Full auto-approve in scheduled runs' },
]

export function GeneralView() {
  const [form, setForm] = useState<UserPreferences>(EMPTY)
  const [saved, setSaved] = useState<UserPreferences>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get<UserPreferences>('/users/me/preferences')
      .then((p: UserPreferences) => {
        const prefs = p ?? EMPTY
        setForm(prefs)
        setSaved(prefs)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const dirty = JSON.stringify(form) !== JSON.stringify(saved)

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const updated = await api.put<UserPreferences>('/users/me/preferences', {
        preferred_name: form.preferred_name,
        profession: form.profession,
        about: form.about,
        working_style: form.working_style,
        response_style: form.response_style,
        extra_context: form.extra_context,
        interactive_permission_mode: form.interactive_permission_mode,
        automation_permission_mode: form.automation_permission_mode,
      })
      setForm(updated)
      setSaved(updated)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }, [form])

  const set = (key: keyof UserPreferences, val: string) =>
    setForm((f) => ({ ...f, [key]: val }))

  if (loading) {
    return (
      <div className="gv-view">
        <div className="gv-loading">Loading preferences…</div>
      </div>
    )
  }

  return (
    <div className="gv-view">
      <style>{GENERAL_CSS}</style>
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>General</h1>
          <p>Personalise how SeshatOS understands you and how it responds.</p>
        </div>
        {dirty && (
          <button className="gv-save-btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : <><Check size={16} /> Save changes</>}
          </button>
        )}
        {success && !dirty && (
          <div className="gv-saved-badge"><Check size={14} /> Saved</div>
        )}
      </header>

      {error && <div className="gv-error">{error}</div>}

      <div className="gv-section-title">About you</div>
      <div className="gv-card">
        <div className="gv-card-head">
          <div className="sv-card-brand">
            <div className="sv-brand-icon"><User size={20} /></div>
            <div>
              <div className="sv-brand-name">Identity</div>
              <div className="sv-brand-sub">How SeshatOS refers to and understands you</div>
            </div>
          </div>
        </div>
        <div className="gv-card-body">
          <div className="gv-row-2">
            <div className="sv-field">
              <label>Preferred name</label>
              <div className="sv-input-box">
                <input
                  type="text"
                  placeholder="e.g. Alex"
                  value={form.preferred_name}
                  onChange={(e) => set('preferred_name', e.target.value)}
                />
              </div>
            </div>
            <div className="sv-field">
              <label>Profession / Role</label>
              <div className="sv-input-box">
                <input
                  type="text"
                  placeholder="e.g. Senior software engineer"
                  value={form.profession}
                  onChange={(e) => set('profession', e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="sv-field">
            <label>About you</label>
            <textarea
              className="gv-textarea"
              placeholder="Describe yourself, your projects, your expertise… SeshatOS will use this to give you more relevant answers."
              rows={4}
              value={form.about}
              onChange={(e) => set('about', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="gv-section-title" style={{ marginTop: 32 }}>Working preferences</div>
      <div className="gv-card">
        <div className="gv-card-head">
          <div className="sv-card-brand">
            <div className="sv-brand-icon"><Edit size={20} /></div>
            <div>
              <div className="sv-brand-name">Style &amp; context</div>
              <div className="sv-brand-sub">Injected into the system prompt on every conversation</div>
            </div>
          </div>
        </div>
        <div className="gv-card-body">
          <div className="sv-field">
            <label>Working style</label>
            <textarea
              className="gv-textarea"
              placeholder="e.g. I prefer concise, direct answers. I like code examples. I work in iterative sprints."
              rows={3}
              value={form.working_style}
              onChange={(e) => set('working_style', e.target.value)}
            />
          </div>
          <div className="sv-field">
            <label>How you prefer responses</label>
            <textarea
              className="gv-textarea"
              placeholder="e.g. Keep it short. No unnecessary preamble. Show diffs, not full files. Use bullet points for lists."
              rows={3}
              value={form.response_style}
              onChange={(e) => set('response_style', e.target.value)}
            />
          </div>
          <div className="sv-field">
            <label>Additional context</label>
            <textarea
              className="gv-textarea"
              placeholder="Anything else you want SeshatOS to always keep in mind."
              rows={3}
              value={form.extra_context}
              onChange={(e) => set('extra_context', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="gv-hint">
        <Info size={14} />
        <span>These preferences are appended to the system prompt on every conversation turn. Leave fields empty to exclude them.</span>
      </div>

      <div className="gv-section-title" style={{ marginTop: 32 }}>Execution defaults</div>
      <div className="gv-card">
        <div className="gv-card-head">
          <div className="sv-card-brand">
            <div className="sv-brand-icon"><Lightning size={20} /></div>
            <div>
              <div className="sv-brand-name">Tool approval policy</div>
              <div className="sv-brand-sub">Default permission mode for new conversations and scheduled runs</div>
            </div>
          </div>
        </div>
        <div className="gv-card-body">
          <div className="sv-field">
            <label>Interactive sessions (default)</label>
            <div className="gv-mode-group">
              {INTERACTIVE_MODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`gv-mode-btn${form.interactive_permission_mode === option.value ? ' active' : ''}`}
                  onClick={() => set('interactive_permission_mode', option.value)}
                >
                  <span className="gv-mode-label">{option.label}</span>
                  <span className="gv-mode-desc">{option.description}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="sv-field">
            <label>Automated / scheduled runs</label>
            <div className="gv-mode-group">
              {AUTOMATION_MODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`gv-mode-btn${form.automation_permission_mode === option.value ? ' active' : ''}`}
                  onClick={() => set('automation_permission_mode', option.value)}
                >
                  <span className="gv-mode-label">{option.label}</span>
                  <span className="gv-mode-desc">{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {dirty && (
        <div className="gv-bottom-bar">
          <button className="gv-save-btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : <><Check size={16} /> Save changes</>}
          </button>
          <button className="gv-cancel-btn" onClick={() => setForm(saved)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

const GENERAL_CSS = `
.gv-view {
  display: flex;
  flex-direction: column;
}

.gv-loading {
  color: var(--color-text-muted);
  padding: 40px 0;
  text-align: center;
}

.gv-section-title {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-bottom: 16px;
}

.gv-card {
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 0;
}
.gv-card:focus-within {
  border-color: var(--color-primary);
}

.gv-card-head {
  padding: 20px 24px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.gv-card-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.gv-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.gv-textarea {
  width: 100%;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: 10px;
  padding: 12px 16px;
  color: var(--color-text);
  font-size: 14px;
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}
.gv-textarea:focus {
  border-color: var(--color-primary);
}
.gv-textarea::placeholder {
  color: var(--color-text-muted);
}

.gv-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.5;
  padding: 16px 0 8px;
}

.gv-error {
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.25);
  color: #ef4444;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 13px;
  margin-bottom: 24px;
}

.gv-save-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-cta);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.gv-save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.gv-saved-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-success, #22c55e);
}

.gv-cancel-btn {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.gv-bottom-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 32px;
}

.gv-mode-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.gv-mode-btn {
  flex: 1;
  min-width: 120px;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: 10px;
  padding: 12px 16px;
  cursor: pointer;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: border-color 0.15s, background 0.15s;
}
.gv-mode-btn:hover {
  border-color: var(--color-primary);
}
.gv-mode-btn.active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
}

.gv-mode-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
}

.gv-mode-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  line-height: 1.4;
}
`
