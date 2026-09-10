import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/api/client'
import { fetchLatestNodeTrace } from './runHistory'

export type SiblingNode = { id: string; type: string }

type Props = {
  nodeType: string
  propName: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  multiline: boolean
  nodeId: string
  siblingNodes: SiblingNode[]
  jobId?: string
  // Tier 3.2 - the effective organization id (see ParameterForm's own doc
  // comment) so the live preview resolves $vars.NAME against real values,
  // and the org-scoped variable names to offer as insert chips.
  organizationId?: string
  variableNames: string[]
}

// filter/if's own "expression" parameter is JS in its entirety - no leading
// "=" (that convention belongs to every other node, see ResolveValue in the
// SDK). switch's "cases" is a JSON map (case name -> expression), which
// this field-level component doesn't handle - see ParameterForm.tsx, which
// only ever mounts ExpressionField for string/text properties.
function isAlwaysExpressionField(nodeType: string, propName: string): boolean {
  return (nodeType === 'filter' || nodeType === 'if') && propName === 'expression'
}

function isActiveExpression(nodeType: string, propName: string, value: string): boolean {
  return isAlwaysExpressionField(nodeType, propName) || value.trim().startsWith('=')
}

// Wraps a string/text NodeProperty's plain <input>/<textarea> (kept exactly
// as ParameterForm rendered it before - no code-editor library, see the
// Tier 2.2 plan's deliberate scope-down) with two additions: an always-
// visible row of "insert variable" chips (not a popover - this codebase's
// established preference, see AgentPickerField/SecretRefField's own "always
// visible, nothing hidden behind a click" comments) and, once the field
// looks like an expression, an inline (not floating) preview panel that
// resolves it against real or sample data via POST /dataflow/preview-
// expression - the same bindings ($json/$itemIndex/$now/$today/$node) a
// real Graph run gives dataflow.ResolveValue.
export function ExpressionField({ nodeType, propName, value, onChange, placeholder, multiline, nodeId, siblingNodes, jobId, organizationId, variableNames }: Props) {
  const alwaysExpr = isAlwaysExpressionField(nodeType, propName)
  const active = isActiveExpression(nodeType, propName, value)
  const fieldRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [sampleItem, setSampleItem] = useState('{}')
  const [sampleSeeded, setSampleSeeded] = useState(false)
  const [itemIndex, setItemIndex] = useState(0)
  const [result, setResult] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)

  function insertSnippet(snippet: string) {
    const el = fieldRef.current
    let base = value
    let cursor = base.length
    if (el && typeof el.selectionStart === 'number') cursor = el.selectionStart

    if (!alwaysExpr && !base.trim().startsWith('=')) {
      base = '=' + base
      cursor += 1
    }
    const next = base.slice(0, cursor) + snippet + base.slice(cursor)
    onChange(next)
    // Restore focus/cursor after the insert on the next tick, once React has
    // committed the new value to the DOM.
    const nextCursor = cursor + snippet.length
    window.setTimeout(() => {
      el?.focus()
      el?.setSelectionRange(nextCursor, nextCursor)
    }, 0)
  }

  function togglePreview() {
    const next = !previewOpen
    setPreviewOpen(next)
    if (next && !sampleSeeded) {
      setSampleSeeded(true)
      if (jobId) {
        void fetchLatestNodeTrace(jobId, nodeId).then((trace) => {
          const seed = trace?.input?.[0]
          if (seed) setSampleItem(JSON.stringify(seed, null, 2))
        })
      }
    }
  }

  useEffect(() => {
    if (!previewOpen) return
    const source = alwaysExpr ? value : value.trim().replace(/^=/, '')
    if (!source.trim()) {
      setResult(null)
      setPreviewError(null)
      return
    }
    let item: Record<string, unknown>
    try {
      item = sampleItem.trim() === '' ? {} : JSON.parse(sampleItem)
    } catch {
      setPreviewError('Sample $json is not valid JSON.')
      setResult(null)
      return
    }

    const timer = window.setTimeout(() => {
      setPreviewing(true)
      api.post<{ value: unknown }>('/automation/dataflow/preview-expression', { expression: source, item, item_index: itemIndex, organization_id: organizationId })
        .then((res) => {
          setResult(typeof res.value === 'string' ? res.value : JSON.stringify(res.value, null, 2))
          setPreviewError(null)
        })
        .catch((err) => {
          setResult(null)
          setPreviewError(err instanceof ApiError ? err.message : 'Unable to resolve this expression.')
        })
        .finally(() => setPreviewing(false))
    }, 400)
    return () => window.clearTimeout(timer)
  }, [previewOpen, value, sampleItem, itemIndex, alwaysExpr, organizationId])

  return (
    <div className="gf-expr-field">
      <style>{EXPRESSION_FIELD_CSS}</style>
      {multiline ? (
        <textarea
          ref={fieldRef}
          className="gf-field-input gf-field-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          rows={3}
        />
      ) : (
        <input
          ref={fieldRef}
          className="gf-field-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}

      <div className="gf-expr-chips">
        {active && <span className="gf-expr-badge">ƒx</span>}
        <button type="button" className="gf-expr-chip" onClick={() => insertSnippet('$json')}>$json</button>
        <button type="button" className="gf-expr-chip" onClick={() => insertSnippet('$itemIndex')}>$itemIndex</button>
        <button type="button" className="gf-expr-chip" onClick={() => insertSnippet('$now')}>$now</button>
        <button type="button" className="gf-expr-chip" onClick={() => insertSnippet('$today')}>$today</button>
        {siblingNodes.map((n) => (
          <button key={n.id} type="button" className="gf-expr-chip" onClick={() => insertSnippet(`$node('${n.id}')`)}>
            $node('{n.id}')
          </button>
        ))}
        {variableNames.map((name) => (
          <button key={name} type="button" className="gf-expr-chip" onClick={() => insertSnippet(`$vars.${name}`)}>
            $vars.{name}
          </button>
        ))}
      </div>

      {active && (
        <button type="button" className="gf-agent-new-link" onClick={togglePreview}>
          {previewOpen ? 'Hide preview' : 'Preview result'}
        </button>
      )}

      {active && previewOpen && (
        <div className="gf-expr-preview">
          <label className="gf-field-label">Sample $json</label>
          <textarea
            className="gf-field-input gf-field-textarea"
            value={sampleItem}
            onChange={(e) => setSampleItem(e.target.value)}
            spellCheck={false}
            rows={3}
          />
          <label className="gf-field-label">Item index</label>
          <input
            className="gf-field-input"
            type="number"
            value={itemIndex}
            onChange={(e) => setItemIndex(Number(e.target.value) || 0)}
          />
          <div className="gf-expr-result-label">
            {previewing ? 'Resolving…' : 'Result'}
          </div>
          {previewError ? (
            <div className="gf-field-error">{previewError}</div>
          ) : (
            <pre className="gf-webhook-payload gf-expr-result">{result ?? '(empty)'}</pre>
          )}
          <div className="gf-field-hint">
            $node(...) previews as empty here - it only sees real data once this graph has actually run.
          </div>
        </div>
      )}
    </div>
  )
}

const EXPRESSION_FIELD_CSS = `
.gf-expr-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gf-expr-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.gf-expr-badge {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-primary-subtle);
  color: var(--color-cta);
  font-size: 10px;
  font-weight: 800;
  font-style: italic;
}

.gf-expr-chip {
  padding: 2px 7px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 999px;
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: 10px;
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
  cursor: pointer;
}

.gf-expr-chip:hover {
  color: var(--color-text);
  border-color: var(--color-border);
  background: var(--color-hover);
}

.gf-expr-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  background: var(--color-surface);
}

.gf-expr-result-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 2px;
}

.gf-expr-result {
  max-height: 140px;
}
`
