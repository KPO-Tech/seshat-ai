import { useState } from 'react'
import { Copy, Delete } from '@icon-park/react'
import { stripUIPosition } from './convert'
import { SecretRefField } from './SecretRefField'
import { AgentPickerField } from './AgentPickerField'
import type { NodeProperty } from './types'

type Props = {
  nodeType: string
  parameters: Record<string, unknown>
  properties: NodeProperty[] | undefined
  onSave: (next: Record<string, unknown>) => void
  onDelete: () => void
  onDuplicate: () => void
}

function toDraftString(value: unknown, type: NodeProperty['type']): string {
  if (value === undefined || value === null) return ''
  if (type === 'json') return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return String(value)
}

function passesDisplayIf(prop: NodeProperty, drafts: Record<string, string | boolean>): boolean {
  if (!prop.displayIf) return true
  const current = drafts[prop.displayIf.field]
  return prop.displayIf.equals.includes(typeof current === 'boolean' ? String(current) : (current ?? ''))
}

// Real per-field form for node types whose Properties schema (from the SDK,
// see pkg/dataflow/node.go) covers their parameters - falls back to raw
// JSON for any node type without one (subworkflow/set, deliberately - see
// the SDK's own comments - and any future type shipped before its schema
// is written). Consumers should mount this with `key={nodeId}` so switching
// the selected node resets the local draft instead of merging stale state.
export function ParameterForm({ nodeType, parameters, properties, onSave, onDelete, onDuplicate }: Props) {
  const clean = stripUIPosition(parameters)
  const hasSchema = !!properties && properties.length > 0

  const [drafts, setDrafts] = useState<Record<string, string | boolean>>(() => {
    if (!hasSchema) return {}
    const init: Record<string, string | boolean> = {}
    for (const p of properties!) {
      init[p.name] = p.type === 'boolean' ? !!clean[p.name] : toDraftString(clean[p.name] ?? p.default, p.type)
    }
    return init
  })
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(clean, null, 2))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  function setField(name: string, value: string | boolean) {
    setDrafts((d) => ({ ...d, [name]: value }))
    setErrors((e) => (e[name] ? { ...e, [name]: '' } : e))
  }

  function saveForm() {
    if (!properties) return
    const nextErrors: Record<string, string> = {}
    const next: Record<string, unknown> = { ...parameters }

    for (const p of properties) {
      if (!passesDisplayIf(p, drafts)) continue
      const raw = drafts[p.name]

      if (p.type === 'boolean') {
        next[p.name] = !!raw
        continue
      }

      const text = typeof raw === 'string' ? raw : ''
      if (text.trim() === '') {
        if (p.required) nextErrors[p.name] = 'Required'
        else delete next[p.name]
        continue
      }

      if (p.type === 'number') {
        const n = Number(text)
        if (Number.isNaN(n)) nextErrors[p.name] = 'Must be a number'
        else next[p.name] = n
      } else if (p.type === 'json') {
        try {
          next[p.name] = JSON.parse(text)
        } catch (err) {
          nextErrors[p.name] = err instanceof Error ? err.message : 'Invalid JSON'
        }
      } else {
        next[p.name] = text
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }
    setErrors({})
    onSave(next)
  }

  function saveJson() {
    let parsed: Record<string, unknown>
    try {
      parsed = jsonDraft.trim() === '' ? {} : JSON.parse(jsonDraft)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Invalid JSON')
      return
    }
    setFormError(null)
    onSave(parsed)
  }

  return (
    <>
      {hasSchema ? (
        <div className="gf-form">
          {properties!.filter((p) => passesDisplayIf(p, drafts)).map((p) => (
            <div key={p.name} className="gf-field">
              <label className="gf-field-label">
                {p.displayName}
                {p.required && <span className="gf-field-required">*</span>}
              </label>
              {p.type === 'boolean' ? (
                <label className="gf-field-checkbox">
                  <input type="checkbox" checked={!!drafts[p.name]} onChange={(e) => setField(p.name, e.target.checked)} />
                  {p.description}
                </label>
              ) : p.type === 'secretRef' ? (
                <SecretRefField value={(drafts[p.name] as string) ?? ''} onChange={(name) => setField(p.name, name)} />
              ) : nodeType === 'agent' && p.name === 'agent' ? (
                // The SDK's own schema leaves this a plain string (a valid
                // slug is only known per-tenant at runtime, which a
                // stateless Description() can't express) - the authoring UI
                // is where a real picker belongs instead. AgentPickerField
                // also lets a new agent be configured (name/provider/model)
                // inline, without leaving this panel to go to Companion.
                <AgentPickerField value={(drafts[p.name] as string) ?? ''} onChange={(v) => setField(p.name, v)} />
              ) : p.type === 'options' ? (
                <select className="gf-field-input" value={(drafts[p.name] as string) ?? ''} onChange={(e) => setField(p.name, e.target.value)}>
                  <option value="" disabled>Select…</option>
                  {(p.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : p.type === 'text' || p.type === 'json' ? (
                <textarea
                  className="gf-field-input gf-field-textarea"
                  value={(drafts[p.name] as string) ?? ''}
                  onChange={(e) => setField(p.name, e.target.value)}
                  placeholder={p.placeholder}
                  spellCheck={false}
                  rows={p.type === 'json' ? 5 : 3}
                />
              ) : (
                <input
                  className="gf-field-input"
                  type={p.type === 'number' ? 'number' : 'text'}
                  value={(drafts[p.name] as string) ?? ''}
                  onChange={(e) => setField(p.name, e.target.value)}
                  placeholder={p.placeholder}
                />
              )}
              {p.type !== 'boolean' && !(nodeType === 'agent' && p.name === 'agent') && p.description && <div className="gf-field-hint">{p.description}</div>}
              {errors[p.name] && <div className="gf-field-error">{errors[p.name]}</div>}
            </div>
          ))}
        </div>
      ) : (
        <>
          <label className="gf-config-label">Parameters (JSON)</label>
          <textarea
            className="gf-config-textarea"
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
            spellCheck={false}
            rows={14}
          />
          {formError && <div className="gf-config-error">{formError}</div>}
        </>
      )}
      <div className="gf-config-actions">
        <button type="button" className="gf-action-btn primary" onClick={hasSchema ? saveForm : saveJson}>
          Save parameters
        </button>
        <div className="gf-config-actions-row">
          <button type="button" className="gf-action-btn" onClick={onDuplicate} title="Duplicate node (Ctrl+D)">
            <Copy size={13} /> Duplicate
          </button>
          <button type="button" className="gf-action-btn" onClick={onDelete}>
            <Delete size={13} /> Delete
          </button>
        </div>
      </div>
    </>
  )
}
