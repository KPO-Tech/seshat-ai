import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckOne, Delete, LoadingOne, Lock, Refresh } from '@icon-park/react'

type EnvVarDef = {
  key: string
  label: string
  description: string
  group: string
  groupLabel: string
  helpUrl?: string
  hidden?: boolean
}

export function EnvironmentView() {
  const [catalog, setCatalog] = useState<EnvVarDef[]>([])
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [restarting, setRestarting] = useState(false)
  const [restartNotice, setRestartNotice] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    try {
      setStatus((await window.nexus?.envVars?.status()) ?? {})
    } catch {
      // keep whatever we had
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [defs, currentStatus] = await Promise.all([
          window.nexus?.envVars?.catalog() ?? Promise.resolve([]),
          window.nexus?.envVars?.status() ?? Promise.resolve({}),
        ])
        if (cancelled) return
        setCatalog(defs)
        setStatus(currentStatus)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  // Multimodal's two keys are managed from Settings > Multimodal's own
  // "Custom" mode now - see env-vars-manager.ts's hidden flag doc comment.
  const visibleCatalog = useMemo(() => catalog.filter((def) => !def.hidden), [catalog])

  const groups = useMemo(() => {
    const order: string[] = []
    const byGroup = new Map<string, { label: string; defs: EnvVarDef[] }>()
    for (const def of visibleCatalog) {
      if (!byGroup.has(def.group)) {
        byGroup.set(def.group, { label: def.groupLabel, defs: [] })
        order.push(def.group)
      }
      byGroup.get(def.group)!.defs.push(def)
    }
    return order.map((id) => ({ id, ...byGroup.get(id)! }))
  }, [visibleCatalog])

  const configuredCount = visibleCatalog.filter((def) => status[def.key]).length

  async function handleApply() {
    setRestarting(true)
    setRestartNotice(null)
    try {
      const result = await window.nexus?.envVars?.restartBackend()
      setRestartNotice(result?.ok ? 'Backend restarted - new values are active.' : (result?.error ?? 'Restart failed.'))
    } catch (err) {
      setRestartNotice(err instanceof Error ? err.message : 'Restart failed.')
    } finally {
      setRestarting(false)
    }
  }

  return (
    <div className="sv-view">
      <style>{ENVIRONMENT_CSS}</style>
      <header className="sv-view-header">
        <div className="sv-header-info">
          <h1>Environment</h1>
          <p>API keys for optional integrations, stored encrypted on this device.</p>
        </div>
        <button className="env-primary-btn" onClick={() => void handleApply()} disabled={restarting}>
          {restarting ? <LoadingOne size={13} className="spin" /> : <Refresh size={13} />}
          {restarting ? 'Restarting...' : 'Apply & restart backend'}
        </button>
      </header>

      {restartNotice && <div className="env-notice">{restartNotice}</div>}

      <div className="env-hero">
        <div className="env-icon"><Lock size={18} /></div>
        <div>
          <h2>Stored encrypted, locally</h2>
          <p>
            Values are encrypted with your OS keychain (Windows DPAPI / macOS Keychain / Linux libsecret) and never
            leave this machine. seshat-backend only reads them at startup, so use "Apply & restart backend" after a change.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="env-empty"><LoadingOne size={20} className="spin" /></div>
      ) : (
        groups.map((group) => (
          <div key={group.id} className="sv-card" style={{ marginBottom: 20 }}>
            <div className="sv-card-head">
              <div className="sv-brand-name">{group.label}</div>
            </div>
            <div className="sv-card-body env-stack">
              {group.defs.map((def) => (
                <EnvVarRow
                  key={def.key}
                  def={def}
                  configured={status[def.key] ?? false}
                  onChanged={refreshStatus}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {!loading && visibleCatalog.length > 0 && (
        <div className="env-summary">{configuredCount} of {visibleCatalog.length} configured</div>
      )}
    </div>
  )
}

function EnvVarRow({ def, configured, onChanged }: { def: EnvVarDef; configured: boolean; onChanged: () => void }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(!configured)

  async function handleSave() {
    if (!value.trim()) return
    setSaving(true)
    try {
      await window.nexus?.envVars?.set(def.key, value.trim())
      setValue('')
      setEditing(false)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    setSaving(true)
    try {
      await window.nexus?.envVars?.delete(def.key)
      setValue('')
      setEditing(true)
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="env-var-row">
      <div className="env-var-info">
        <div className="env-var-label-row">
          <span className="env-var-key">{def.key}</span>
          {configured && (
            <span className="env-var-badge"><CheckOne size={11} /> Configured</span>
          )}
        </div>
        <div className="sv-setting-desc">
          {def.description}
          {def.helpUrl && (
            <>
              {' '}
              <a href={def.helpUrl} target="_blank" rel="noreferrer" className="env-var-link">Get one</a>
            </>
          )}
        </div>
      </div>

      {configured && !editing ? (
        <div className="env-var-actions">
          <button className="env-inline-btn" onClick={() => setEditing(true)}>Change</button>
          <button className="env-inline-btn env-var-remove" onClick={() => void handleClear()} disabled={saving}>
            <Delete size={11} /> Remove
          </button>
        </div>
      ) : (
        <div className="env-var-actions">
          <input
            type="password"
            className="env-var-input"
            placeholder={def.label}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
          />
          <button className="env-inline-btn env-var-save" onClick={() => void handleSave()} disabled={saving || !value.trim()}>
            {saving ? <LoadingOne size={11} className="spin" /> : 'Save'}
          </button>
          {configured && (
            <button className="env-inline-btn" onClick={() => { setEditing(false); setValue('') }} disabled={saving}>Cancel</button>
          )}
        </div>
      )}
    </div>
  )
}

const ENVIRONMENT_CSS = `
.env-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.env-primary-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: 8px;
  padding: 7px 13px;
  background: var(--color-cta);
  color: white;
  font-size: var(--font-size-xs);
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}
.env-primary-btn:disabled { opacity: 0.6; cursor: default; }

.env-notice {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: 8px;
  padding: 9px 12px;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: 16px;
}

.env-hero {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg);
  padding: 18px;
  margin-bottom: 20px;
}
.env-icon {
  width: 42px;
  height: 42px;
  border-radius: 9px;
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  background: var(--color-surface);
  flex-shrink: 0;
}
.env-hero h2 { margin: 0 0 4px; font-size: var(--font-size-base); }
.env-hero p { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-sm); line-height: 1.6; }

.env-empty {
  min-height: 160px;
  border: 1px dashed var(--color-border);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

.env-summary {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  text-align: right;
  margin-top: -8px;
}

.env-var-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 12px;
  background: var(--color-surface);
  border-radius: 10px;
  border: 1px solid var(--color-border);
  flex-wrap: wrap;
}
.env-var-info { flex: 1; min-width: 220px; }
.env-var-label-row { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
.env-var-key { font-size: var(--font-size-sm); font-weight: 700; color: var(--color-text); font-family: var(--font-mono, monospace); }
.env-var-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-success, #22c55e);
  font-size: var(--font-size-2xs);
  font-weight: 700;
}
.env-var-link { color: var(--color-primary); }

.env-var-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.env-var-input {
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  padding: 6px 9px;
  border-radius: 7px;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  outline: none;
  width: 220px;
  font-family: inherit;
}
.env-var-input:focus { border-color: var(--color-primary); }

.env-inline-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: 1px solid var(--color-border);
  color: var(--color-text);
  background: var(--color-bg);
  border-radius: 7px;
  font-size: var(--font-size-2xs);
  font-weight: 600;
  cursor: pointer;
}
.env-inline-btn:hover:not(:disabled) { border-color: var(--color-primary); color: var(--color-primary); }
.env-inline-btn:disabled { opacity: 0.5; cursor: default; }
.env-var-remove:hover:not(:disabled) { border-color: var(--color-error); color: var(--color-error); }

.spin { animation: spin 1s linear infinite; display: inline-block; }
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
`
