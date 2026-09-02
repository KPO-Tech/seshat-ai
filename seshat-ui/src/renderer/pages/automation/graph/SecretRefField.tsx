import { useEffect, useRef, useState } from 'react'
import { Add, CheckCorrect } from '@icon-park/react'
import { SelectorPill, SELECTOR_PILL_CSS } from '@/components/ui/SelectorPill'
import { api, ApiError } from '@/api/client'

type DataflowSecret = { id: string; name: string }

type Props = {
  value: string
  onChange: (name: string) => void
}

// Picks an existing org-scoped dataflow secret by name, or creates one
// inline without leaving the parameter form - the first "pick or create"
// control in this codebase (no exact precedent to reuse wholesale, see the
// planning research), built on the existing SelectorPill trigger + the same
// click-outside pattern ChatTopBar's selectors already use.
export function SecretRefField({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [secrets, setSecrets] = useState<DataflowSecret[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  function openMenu() {
    setOpen((o) => !o)
    if (secrets === null && !loading) {
      setLoading(true)
      api.get<{ dataflow_secrets: DataflowSecret[] }>('/automation/dataflow-secrets')
        .then((res) => setSecrets(res.dataflow_secrets ?? []))
        .catch((err) => setListError(err instanceof ApiError ? err.message : 'Unable to load secrets.'))
        .finally(() => setLoading(false))
    }
  }

  function pick(name: string) {
    onChange(name)
    setOpen(false)
  }

  async function createSecret() {
    const name = newName.trim()
    if (!name || !newValue) {
      setCreateError('Name and value are both required.')
      return
    }
    setSaving(true)
    setCreateError(null)
    try {
      const created = await api.post<DataflowSecret>('/automation/dataflow-secrets', { name, value: newValue })
      setSecrets((s) => [...(s ?? []), created])
      onChange(created.name)
      setCreating(false)
      setOpen(false)
      setNewName('')
      setNewValue('')
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Unable to create this secret.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="gf-secret-field" ref={rootRef}>
      <style>{SELECTOR_PILL_CSS}</style>
      <style>{SECRET_FIELD_CSS}</style>
      <SelectorPill label={value || 'Select secret…'} onClick={openMenu} />
      {open && (
        <div className="selector-menu gf-secret-menu">
          {creating ? (
            <div className="gf-secret-create">
              <input placeholder="Secret name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              <input placeholder="Value" type="password" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
              {createError && <div className="gf-secret-error">{createError}</div>}
              <div className="gf-secret-create-actions">
                <button type="button" className="ib-action-btn primary" onClick={() => void createSecret()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="ib-action-btn" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {loading && <div className="gf-secret-empty">Loading…</div>}
              {listError && <div className="gf-secret-empty gf-secret-error">{listError}</div>}
              {!loading && !listError && (secrets ?? []).length === 0 && <div className="gf-secret-empty">No secrets yet</div>}
              {!loading && (secrets ?? []).map((s) => (
                <button key={s.id} className={`selector-menu-item${s.name === value ? ' active' : ''}`} type="button" onClick={() => pick(s.name)}>
                  <span className="selector-menu-copy"><span>{s.name}</span></span>
                  {s.name === value && <CheckCorrect size={12} />}
                </button>
              ))}
              <button className="selector-menu-item gf-secret-new" type="button" onClick={() => setCreating(true)}>
                <span className="selector-menu-copy"><span>New secret</span></span>
                <Add size={12} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const SECRET_FIELD_CSS = `
.gf-secret-field {
  position: relative;
  display: inline-block;
}

.gf-secret-menu {
  min-width: 220px;
}

.gf-secret-new {
  border-top: 1px solid var(--color-border-subtle);
  margin-top: 2px;
  padding-top: 9px;
  color: var(--color-cta);
}

.gf-secret-create {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px;
}

.gf-secret-create input {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-xs);
}

.gf-secret-create-actions {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.gf-secret-empty {
  padding: 8px;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.gf-secret-error {
  color: #ff6b6b;
}
`
