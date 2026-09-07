import type { TestStatus, TestRunNodeResult } from './GraphNode'

type Props = {
  canTest: boolean
  status: TestStatus | undefined
  result: TestRunNodeResult | undefined
  stale: boolean
  onTest: () => void
}

// One per-node section (not per-field, like PinnedOutputField) - runs this
// node's real ancestor chain (see GraphEditor.tsx's testNode/
// ancestorClosure, Tier 2.4) and shows what it actually produced, without
// needing the whole job saved-and-scheduled to see it. Only rendered once
// the job has been saved at least once (canTest - the same precondition
// Scheduling's whole-graph "Run now" already has), same as the
// webhook_trigger URL panel's own "save first" precedent.
export function TestNodeField({ canTest, status, result, stale, onTest }: Props) {
  if (!canTest) return null

  return (
    <div className="gf-field gf-test-field">
      <style>{TEST_NODE_FIELD_CSS}</style>
      <button type="button" className="gf-action-btn" onClick={onTest} disabled={status === 'running'}>
        {status === 'running' ? 'Testing…' : 'Test this node'}
      </button>
      {stale && status !== 'running' && (
        <div className="gf-field-hint">Something changed upstream since this was last tested - retest to see the real result.</div>
      )}
      {status && status !== 'running' && (
        <div className="gf-test-result">
          <div className="gf-test-result-label">{result?.success ? 'Last result' : 'Error'}</div>
          {result?.success ? (
            <pre className="gf-webhook-payload gf-test-result-body">{JSON.stringify(result.output ?? [], null, 2)}</pre>
          ) : (
            <div className="gf-field-error">{result?.error ?? 'Test failed.'}</div>
          )}
        </div>
      )}
    </div>
  )
}

const TEST_NODE_FIELD_CSS = `
.gf-test-field {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.gf-test-result {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gf-test-result-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.gf-test-result-body {
  max-height: 160px;
}
`
