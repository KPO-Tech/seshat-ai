import { useEffect, useRef, useState } from 'react'
import { Add, CheckCorrect } from '@icon-park/react'
import { SelectorPill, SELECTOR_MENU_CLASS, SELECTOR_MENU_COPY_CLASS, SELECTOR_MENU_ITEM_CLASS } from '@/components/ui/SelectorPill'
import { api, ApiError } from '@/api/client'

type DataflowSecret = { id: string; name: string }

type Props = {
  value: string
  onChange: (name: string) => void
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
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
    <div className="relative inline-block" ref={rootRef}>
      <SelectorPill label={value || 'Select secret…'} onClick={openMenu} />
      {open && (
        <div className={cx(SELECTOR_MENU_CLASS, 'min-w-[220px]')}>
          {creating ? (
            <div className="flex flex-col gap-2 p-1">
              <input className="h-[30px] rounded-md border border-app-border bg-app-bg px-2 text-[var(--font-size-xs)] text-app-text" placeholder="Secret name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
              <input className="h-[30px] rounded-md border border-app-border bg-app-bg px-2 text-[var(--font-size-xs)] text-app-text" placeholder="Value" type="password" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
              {createError && <div className="text-app-error">{createError}</div>}
              <div className="mt-0.5 flex gap-1.5">
                <button type="button" className="gf-action-btn primary" onClick={() => void createSecret()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="gf-action-btn" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {loading && <div className="p-2 text-[var(--font-size-xs)] text-app-text-muted">Loading…</div>}
              {listError && <div className="p-2 text-[var(--font-size-xs)] text-app-error">{listError}</div>}
              {!loading && !listError && (secrets ?? []).length === 0 && <div className="p-2 text-[var(--font-size-xs)] text-app-text-muted">No secrets yet</div>}
              {!loading && (secrets ?? []).map((s) => (
                <button
                  key={s.id}
                  className={cx(
                    SELECTOR_MENU_ITEM_CLASS,
                    s.name === value && 'border-[color-mix(in_srgb,var(--color-primary)_22%,var(--color-border-subtle))] bg-[color-mix(in_srgb,var(--color-primary)_11%,var(--color-surface))] text-app-primary',
                  )}
                  type="button"
                  onClick={() => pick(s.name)}
                >
                  <span className={SELECTOR_MENU_COPY_CLASS}><span>{s.name}</span></span>
                  {s.name === value && <CheckCorrect size={12} />}
                </button>
              ))}
              <button className={cx(SELECTOR_MENU_ITEM_CLASS, 'mt-0.5 border-t-app-border-subtle pt-[9px] text-[var(--color-cta)]')} type="button" onClick={() => setCreating(true)}>
                <span className={SELECTOR_MENU_COPY_CLASS}><span>New secret</span></span>
                <Add size={12} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
