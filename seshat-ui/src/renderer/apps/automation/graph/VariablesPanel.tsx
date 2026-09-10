import { useEffect, useMemo, useState } from 'react'
import { Plus, Edit as EditIcon, Delete as DeleteIcon, CheckOne, Close, LoadingOne, Copy, Search, Dollar } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { useOrganizationStore } from '@/stores/organization'
import type { Variable } from './types'

// Editable name+value row, shared by the "new variable" row and an
// existing row switched into edit mode - same fields either way.
function VariableEditRow({
  initialName,
  initialValue,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initialName: string
  initialValue: string
  saving: boolean
  error: string | null
  onSave: (name: string, value: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initialName)
  const [value, setValue] = useState(initialValue)
  return (
    <div className="au-overview-row au-var-row-editing">
      <div className="au-overview-main au-var-edit-fields">
        <input
          className="au-var-input au-var-input-name"
          placeholder="NAME"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          spellCheck={false}
        />
        <input
          className="au-var-input au-var-input-value"
          placeholder="Value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
        />
        {error && <div className="au-var-error">{error}</div>}
      </div>
      <div className="au-overview-actions">
        <button type="button" className="au-icon-btn" aria-label="Save" onClick={() => onSave(name.trim(), value)} disabled={saving}>
          {saving ? <LoadingOne size={13} className="spin" /> : <CheckOne size={13} />}
        </button>
        <button type="button" className="au-icon-btn" aria-label="Cancel" onClick={onCancel} disabled={saving}>
          <Close size={13} />
        </button>
      </div>
    </div>
  )
}

// The Variables settings page (Tier 3.2) - org-wide, not job-scoped, so
// unlike RunsPanel.tsx this is fully self-contained (reads the current
// organization directly) and reachable from Overview too, not gated behind
// an open job. Name+value pairs, referenced as $vars.NAME in any
// automation's expressions (see ExpressionField.tsx's chips).
//
// A later pass (this one) took structural cues from the Stitch mockup under
// docs/produits/platforms/automation/design/ - a real page header + search
// toolbar (same shell pattern as Projects/Templates) and a card treatment
// for each row, plus the spec's own explicit "copier la référence" ask
// (automation-app-pages.md §11) via a one-click $vars.NAME copy button.
// Deliberately NOT carried over from the mockup: per-variable type badges,
// "used by N projects"/"referenced projects" coverage, last-revision
// attribution, an "unused variables" audit, a runtime-cache/lineage panel,
// and Export - none of that is backed by a real field on Variable (see
// graph/types.ts: just id/organization_id/name/value), and this engine
// doesn't track which jobs reference which variable today.
export function VariablesPanel() {
  const organizationId = useOrganizationStore((s) => s.currentOrganizationId)
  const [variables, setVariables] = useState<Variable[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    setVariables(null)
    setError(null)
    api
      .get<{ variables: Variable[] }>(`/automation/variables?organization_id=${encodeURIComponent(organizationId)}`)
      .then((res) => {
        if (!cancelled) setVariables(res.variables ?? [])
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load variables.')
      })
    return () => {
      cancelled = true
    }
  }, [organizationId])

  async function createVariable(name: string, value: string) {
    if (!organizationId) return
    setSaving(true)
    setSaveError(null)
    try {
      const created = await api.post<Variable>('/automation/variables', { organization_id: organizationId, name, value })
      setVariables((v) => [...(v ?? []), created].sort((a, b) => a.name.localeCompare(b.name)))
      setCreating(false)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to create this variable.')
    } finally {
      setSaving(false)
    }
  }

  async function updateVariable(id: string, name: string, value: string) {
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await api.put<Variable>(`/automation/variables/${id}`, { name, value })
      setVariables((v) => (v ?? []).map((item) => (item.id === id ? updated : item)).sort((a, b) => a.name.localeCompare(b.name)))
      setEditingId(null)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to update this variable.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteVariable(variable: Variable) {
    if (!window.confirm(`Delete "${variable.name}"? Any expression referencing $vars.${variable.name} will stop resolving.`)) return
    setDeletingId(variable.id)
    try {
      await api.delete(`/automation/variables/${variable.id}`)
      setVariables((v) => (v ?? []).filter((item) => item.id !== variable.id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete this variable.')
    } finally {
      setDeletingId(null)
    }
  }

  function copyRef(variable: Variable) {
    void navigator.clipboard.writeText(`$vars.${variable.name}`)
    setCopiedId(variable.id)
    window.setTimeout(() => setCopiedId((id) => (id === variable.id ? null : id)), 1200)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return variables ?? []
    return (variables ?? []).filter((v) => v.name.toLowerCase().includes(q) || v.value.toLowerCase().includes(q))
  }, [variables, search])

  if (!organizationId) {
    return (
      <div className="au-loading">
        <style>{VARIABLES_PANEL_CSS}</style>
        Waiting for your organization…
      </div>
    )
  }

  return (
    <div className="au-overview">
      <style>{VARIABLES_PANEL_CSS}</style>
      <div className="au-var-page-head">
        <h1>Variables</h1>
        <button type="button" className="au-save-btn" onClick={() => setCreating(true)} disabled={creating}>
          <Plus size={14} /> New variable
        </button>
      </div>

      <div className="au-var-toolbar">
        <div className="au-var-search-row">
          <Search size={14} className="au-var-search-icon" />
          <input
            className="au-var-search"
            placeholder="Search variables…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>

      {creating && (
        <VariableEditRow
          initialName=""
          initialValue=""
          saving={saving}
          error={saveError}
          onSave={(name, value) => void createVariable(name, value)}
          onCancel={() => {
            setCreating(false)
            setSaveError(null)
          }}
        />
      )}

      {variables === null ? (
        <div className="au-loading">Loading…</div>
      ) : error ? (
        <div className="au-loading au-loading-error">{error}</div>
      ) : filtered.length === 0 && !creating ? (
        <div className="au-stub au-stub--inline">
          {variables.length === 0 ? (
            <>
              <h2>No variables yet</h2>
              <p>Named values reusable across every automation's expressions - reference one as $vars.NAME once created.</p>
              <button type="button" className="au-save-btn au-empty-action" onClick={() => setCreating(true)}>
                <Plus size={14} /> New variable
              </button>
            </>
          ) : (
            <>
              <h2>No matches</h2>
              <p>Try a different search.</p>
            </>
          )}
        </div>
      ) : (
        <div className="au-var-cards">
          {filtered.map((variable) =>
            editingId === variable.id ? (
              <VariableEditRow
                key={variable.id}
                initialName={variable.name}
                initialValue={variable.value}
                saving={saving}
                error={saveError}
                onSave={(name, value) => void updateVariable(variable.id, name, value)}
                onCancel={() => {
                  setEditingId(null)
                  setSaveError(null)
                }}
              />
            ) : (
              <div key={variable.id} className="au-var-card">
                <div className="au-var-card-icon">
                  <Dollar size={18} />
                </div>
                <div className="au-overview-main">
                  <div className="au-overview-name-row">
                    <button type="button" className="au-var-ref" onClick={() => copyRef(variable)}>
                      <span className="au-var-name">$vars.{variable.name}</span>
                      {copiedId === variable.id ? <CheckOne size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                  <div className="au-overview-desc au-var-value">{variable.value}</div>
                </div>
                <div className="au-overview-actions">
                  <button type="button" className="au-icon-btn" aria-label="Edit" onClick={() => setEditingId(variable.id)}>
                    <EditIcon size={13} />
                  </button>
                  <button
                    type="button" className="au-icon-btn" aria-label="Delete"
                    onClick={() => void deleteVariable(variable)}
                    disabled={deletingId === variable.id}
                  >
                    {deletingId === variable.id ? <LoadingOne size={13} className="spin" /> : <DeleteIcon size={13} />}
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}

const VARIABLES_PANEL_CSS = `
.au-var-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 6px;
}

.au-var-page-head h1 {
  margin: 0;
  font-size: var(--font-size-3xl);
  font-weight: 700;
  color: var(--color-text);
  letter-spacing: -0.01em;
}

.au-var-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
}

.au-var-search-row {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
}

.au-var-search-icon { color: var(--color-text-muted); flex-shrink: 0; }

.au-var-search {
  flex: 1;
  height: 100%;
  background: none;
  border: none;
  outline: none;
  color: var(--color-text);
  font-size: var(--font-size-xs);
}

.au-var-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Same visual vocabulary as Projects' cards (radius-2xl, no border,
   soft-resting/medium-on-hover shadow) - a fixed neutral icon tile rather
   than a toneFor() color, since a variable has no category-like field to
   derive a tone from. */
.au-var-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border-radius: var(--radius-2xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-soft);
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.au-var-card:hover {
  box-shadow: var(--shadow-medium);
  transform: translateY(-1px);
}

.au-var-card-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--color-text);
  color: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* The variable's own name IS its reference (see automation-app-pages.md
   §11's "copier la référence") - clicking copies "$vars.NAME" instead of
   showing the bare name plus a separate copy affordance. */
.au-var-ref {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  border: none;
  background: none;
  color: var(--color-text);
  cursor: pointer;
}

.au-var-ref:hover { color: var(--color-primary); }

.au-var-row-editing {
  align-items: flex-start;
}

.au-var-edit-fields {
  flex: 1;
  gap: 6px;
}

.au-var-input {
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  font-size: var(--font-size-xs);
}

.au-var-input-name {
  max-width: 240px;
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
}

.au-var-error {
  color: #ff6b6b;
  font-size: var(--font-size-2xs);
}

.au-var-name {
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.au-var-value {
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
  word-break: break-all;
}
`
