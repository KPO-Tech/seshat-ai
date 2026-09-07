import { useEffect, useState } from 'react'
import { Plus, Edit as EditIcon, Delete as DeleteIcon, CheckOne, Close, LoadingOne } from '@icon-park/react'
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
        <button type="button" className="au-icon-btn" title="Save" onClick={() => onSave(name.trim(), value)} disabled={saving}>
          {saving ? <LoadingOne size={13} className="spin" /> : <CheckOne size={13} />}
        </button>
        <button type="button" className="au-icon-btn" title="Cancel" onClick={onCancel} disabled={saving}>
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
export function VariablesPanel() {
  const organizationId = useOrganizationStore((s) => s.currentOrganizationId)
  const [variables, setVariables] = useState<Variable[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    setVariables(null)
    setError(null)
    api
      .get<{ variables: Variable[] }>(`/variables?organization_id=${encodeURIComponent(organizationId)}`)
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
      const created = await api.post<Variable>('/variables', { organization_id: organizationId, name, value })
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
      const updated = await api.put<Variable>(`/variables/${id}`, { name, value })
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
      await api.delete(`/variables/${variable.id}`)
      setVariables((v) => (v ?? []).filter((item) => item.id !== variable.id))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete this variable.')
    } finally {
      setDeletingId(null)
    }
  }

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
      <div className="au-var-toolbar">
        <button type="button" className="au-save-btn" onClick={() => setCreating(true)} disabled={creating}>
          <Plus size={14} /> New variable
        </button>
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
      ) : variables.length === 0 && !creating ? (
        <div className="au-stub">
          <h2>No variables yet</h2>
          <p>Named values reusable across every automation's expressions - reference one as $vars.NAME once created.</p>
        </div>
      ) : (
        variables.map((variable) =>
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
            <div key={variable.id} className="au-overview-row au-var-row">
              <div className="au-overview-main">
                <div className="au-overview-name-row">
                  <span className="au-overview-name au-var-name">{variable.name}</span>
                </div>
                <div className="au-overview-desc au-var-value">{variable.value}</div>
              </div>
              <div className="au-overview-actions">
                <button type="button" className="au-icon-btn" title="Edit" onClick={() => setEditingId(variable.id)}>
                  <EditIcon size={13} />
                </button>
                <button
                  type="button" className="au-icon-btn" title="Delete"
                  onClick={() => void deleteVariable(variable)}
                  disabled={deletingId === variable.id}
                >
                  {deletingId === variable.id ? <LoadingOne size={13} className="spin" /> : <DeleteIcon size={13} />}
                </button>
              </div>
            </div>
          ),
        )
      )}
    </div>
  )
}

const VARIABLES_PANEL_CSS = `
.au-var-toolbar {
  display: flex;
  justify-content: flex-end;
}

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
}

.au-var-value {
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
  word-break: break-all;
}
`
