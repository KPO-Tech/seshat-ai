import { useState } from 'react'
import { Copy, CheckOne, Delete } from '@icon-park/react'
import { stripUIPosition } from './convert'
import { SecretRefField } from './SecretRefField'
import { AgentPickerField } from './AgentPickerField'
import { WebhookLastCall } from './WebhookLastCall'
import { ExpressionField, type SiblingNode } from './ExpressionField'
import { PinnedOutputField } from './PinnedOutputField'
import { TestNodeField } from './TestNodeField'
import { RetrySettingsField, type RetrySettingsValue } from './RetrySettingsField'
import { ConnectionTestField } from './ConnectionTestField'
import type { TestStatus, TestRunNodeResult } from './GraphNode'
import { NEXUS_BASE } from '@/api/client'
import type { NodeProperty } from './types'

type Props = {
  nodeType: string
  nodeId: string
  parameters: Record<string, unknown>
  properties: NodeProperty[] | undefined
  // From the live node-types catalog (NodeDescription.isTestable, Tier 3.5)
  // - shows a "Test connection" affordance for node types whose executor
  // implements the SDK's TestableExecutor. Catalog metadata, like
  // `properties` itself - never persisted onto the node's own data.
  isTestable?: boolean
  // Only known once the job has been saved - see the webhook_trigger URL
  // block below for why (a webhook needs a stable per-job token, minted
  // server-side on first save, not something a NodeProperty can express).
  jobId?: string
  webhookToken?: string
  // The effective organization id (a saved job's own, or the caller's
  // current/default one before that - see automation/index.tsx) - lets
  // ExpressionField's preview resolve $vars.NAME (Tier 3.2) correctly, and
  // is passed through unconditionally (unlike jobId/webhookToken, this is
  // available even for a never-saved job).
  organizationId?: string
  // The organization's own Variables, by name only (never the value here -
  // ExpressionField just needs names for its chips) - see
  // GraphEditor.tsx's own fetch, alongside nodeTypes.
  variableNames: string[]
  // Every other node on the same graph - lets ExpressionField offer
  // $node('id') for each one without ParameterForm needing to know
  // anything about expressions itself.
  siblingNodes: SiblingNode[]
  // Node-level, not a parameter - see PinnedOutputField.
  pinnedOutput: Record<string, unknown>[] | undefined
  onPinnedOutputChange: (next: Record<string, unknown>[] | undefined) => void
  // Node-level, not a parameter - see RetrySettingsField (Tier 3.1).
  retrySettings: RetrySettingsValue
  onRetrySettingsChange: (next: RetrySettingsValue) => void
  // "Test this node" (Tier 2.4) - see TestNodeField.
  canTestNode: boolean
  testStatus: TestStatus | undefined
  testResult: TestRunNodeResult | undefined
  testStale: boolean
  onTestNode: () => void
  onSave: (next: Record<string, unknown>) => void
  onDelete: () => void
  onDuplicate: () => void
}

// Small copied-state-with-timeout helper used by parameter fields that expose
// generated values or examples.
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="gf-action-btn"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? <CheckOne size={13} /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
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

// Shared by saveForm and ConnectionTestField's getParams - the same
// per-property coercion (boolean/number/json/string) either needs, so the
// logic lives in exactly one place. Errors are only fatal for an actual
// save; a connection test tolerates an unrelated required field being
// empty (e.g. a SQL node's query) since it only reads its own secretRef.
function buildParamsFromDrafts(properties: NodeProperty[], parameters: Record<string, unknown>, drafts: Record<string, string | boolean>): { params: Record<string, unknown>; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
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
      if (p.required) errors[p.name] = 'Required'
      else delete next[p.name]
      continue
    }

    if (p.type === 'number') {
      const n = Number(text)
      if (Number.isNaN(n)) errors[p.name] = 'Must be a number'
      else next[p.name] = n
    } else if (p.type === 'json') {
      try {
        next[p.name] = JSON.parse(text)
      } catch (err) {
        errors[p.name] = err instanceof Error ? err.message : 'Invalid JSON'
      }
    } else {
      next[p.name] = text
    }
  }

  return { params: next, errors }
}

// Real per-field form for node types whose Properties schema (from the SDK,
// see pkg/dataflow/node.go) covers their parameters - falls back to raw
// JSON for any node type without one (subworkflow/set, deliberately - see
// the SDK's own comments - and any future type shipped before its schema
// is written). Consumers should mount this with `key={nodeId}` so switching
// the selected node resets the local draft instead of merging stale state.
export function ParameterForm({ nodeType, nodeId, parameters, properties, isTestable, jobId, webhookToken, organizationId, variableNames, siblingNodes, pinnedOutput, onPinnedOutputChange, retrySettings, onRetrySettingsChange, canTestNode, testStatus, testResult, testStale, onTestNode, onSave, onDelete, onDuplicate }: Props) {
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
    const { params: next, errors: nextErrors } = buildParamsFromDrafts(properties, parameters, drafts)
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
      <PinnedOutputField nodeId={nodeId} jobId={jobId} value={pinnedOutput} onChange={onPinnedOutputChange} />
      <RetrySettingsField value={retrySettings} onChange={onRetrySettingsChange} />
      <TestNodeField canTest={canTestNode} status={testStatus} result={testResult} stale={testStale} onTest={onTestNode} />
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
              ) : p.type === 'json' ? (
                <textarea
                  className="gf-field-input gf-field-textarea"
                  value={(drafts[p.name] as string) ?? ''}
                  onChange={(e) => setField(p.name, e.target.value)}
                  placeholder={p.placeholder}
                  spellCheck={false}
                  rows={5}
                />
              ) : p.type === 'text' || p.type === 'string' ? (
                <ExpressionField
                  nodeType={nodeType}
                  propName={p.name}
                  value={(drafts[p.name] as string) ?? ''}
                  onChange={(v) => setField(p.name, v)}
                  placeholder={p.placeholder}
                  multiline={p.type === 'text'}
                  nodeId={nodeId}
                  siblingNodes={siblingNodes}
                  jobId={jobId}
                  organizationId={organizationId}
                  variableNames={variableNames}
                />
              ) : (
                <input
                  className="gf-field-input"
                  type="number"
                  value={(drafts[p.name] as string) ?? ''}
                  onChange={(e) => setField(p.name, e.target.value)}
                  placeholder={p.placeholder}
                />
              )}
              {p.type !== 'boolean' && !(nodeType === 'agent' && (p.name === 'agent' || p.name === 'prompt')) && p.description && <div className="gf-field-hint">{p.description}</div>}
              {errors[p.name] && <div className="gf-field-error">{errors[p.name]}</div>}
            </div>
          ))}
          {isTestable && (
            <ConnectionTestField
              organizationId={organizationId}
              nodeType={nodeType}
              getParams={() => buildParamsFromDrafts(properties!, parameters, drafts).params}
            />
          )}
          {nodeType === 'webhook_trigger' && (
            <div className="gf-field">
              <label className="gf-field-label">Webhook URL</label>
              {jobId && webhookToken ? (
                <div className="gf-webhook-url-row">
                  <code className="gf-webhook-url">{`${NEXUS_BASE}/webhooks/${webhookToken}`}</code>
                  <CopyButton text={`${NEXUS_BASE}/webhooks/${webhookToken}`} />
                </div>
              ) : (
                <div className="gf-field-hint">Save this automation to get your webhook URL.</div>
              )}
            </div>
          )}
          {nodeType === 'webhook_trigger' && <WebhookLastCall jobId={jobId} />}
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
          <button type="button" className="gf-action-btn" onClick={onDuplicate}>
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
