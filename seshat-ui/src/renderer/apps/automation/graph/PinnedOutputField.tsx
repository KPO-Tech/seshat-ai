import { useState } from 'react'
import { fetchLatestNodeTrace } from './runHistory'

type Props = {
  nodeId: string
  jobId?: string
  value: Record<string, unknown>[] | undefined
  onChange: (next: Record<string, unknown>[] | undefined) => void
}

function toDraft(items: Record<string, unknown>[] | undefined): string {
  return JSON.stringify(items ?? [{}], null, 2)
}

// One per-node section (not per-field, unlike ExpressionField) - freezes
// this node's entire output instead of letting it actually run, so the
// rest of the graph can be built/tested without firing a real (slow,
// costly, sometimes destructive - a real email, a real ticket) call. See
// dataflow.Definition.PinnedData (Tier 2.3): pinning bypasses the node's
// real Execute (and even its ValidateParameters/registry lookup)
// entirely, so this works for any node type regardless of whether its own
// config is currently valid.
export function PinnedOutputField({ nodeId, jobId, value, onChange }: Props) {
  const pinned = value !== undefined
  const [draft, setDraft] = useState(() => toDraft(value))
  const [error, setError] = useState<string | null>(null)
  const [loadingLastOutput, setLoadingLastOutput] = useState(false)

  function togglePinned(next: boolean) {
    if (next) {
      setError(null)
      applyDraft(draft)
    } else {
      onChange(undefined)
    }
  }

  function applyDraft(text: string) {
    setDraft(text)
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) throw new Error('Pinned output must be a JSON array of items.')
      setError(null)
      onChange(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON')
    }
  }

  function useLastRealOutput() {
    if (!jobId) return
    setLoadingLastOutput(true)
    void fetchLatestNodeTrace(jobId, nodeId)
      .then((trace) => {
        if (trace?.output) applyDraft(JSON.stringify(trace.output, null, 2))
      })
      .finally(() => setLoadingLastOutput(false))
  }

  return (
    <div className="gf-field gf-pin-field">
      <style>{PINNED_OUTPUT_FIELD_CSS}</style>
      <label className="gf-field-checkbox">
        <input type="checkbox" checked={pinned} onChange={(e) => togglePinned(e.target.checked)} />
        Pin output
      </label>
      <div className="gf-field-hint">
        Freezes this node's output to the data below instead of actually running it - lets you build and test the rest of the graph without firing a real call.
      </div>

      {pinned && (
        <div className="gf-pin-body">
          <textarea
            className="gf-field-input gf-field-textarea"
            value={draft}
            onChange={(e) => applyDraft(e.target.value)}
            spellCheck={false}
            rows={4}
          />
          {error && <div className="gf-field-error">{error}</div>}
          <button type="button" className="gf-agent-new-link" onClick={useLastRealOutput} disabled={!jobId || loadingLastOutput}>
            {loadingLastOutput ? 'Loading…' : 'Use last real output'}
          </button>
          {!jobId && <div className="gf-field-hint">Save this automation to pull in a real run's last output.</div>}
        </div>
      )}
    </div>
  )
}

const PINNED_OUTPUT_FIELD_CSS = `
.gf-pin-field {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.gf-pin-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}
`
