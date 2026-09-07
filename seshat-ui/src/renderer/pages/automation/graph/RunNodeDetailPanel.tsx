import type { NodeTraceEntry } from './types'

type Props = {
  trace: NodeTraceEntry | undefined
}

// Read-only sibling of ParameterForm, shown by GraphReplayViewer.tsx (Tier
// 2.6) in place of it - a past run's real recorded input/output for one
// node, never anything editable (no test button, no save, no pin toggle).
// The node's own identity (id/type) is already shown by the .gf-config-head
// header this renders under, so this panel is trace content only. `trace`
// is undefined when this run's node_trace has no entry for this node id at
// all - either a genuinely unreachable state once graph_snapshot is in play
// (every node in the canvas came from that run's own graph), or a
// pre-migration run replayed against the job's current live graph (see
// RunsPanel's graph_snapshot fallback), where a node added since really
// never ran during this run.
export function RunNodeDetailPanel({ trace }: Props) {
  return (
    <div className="gf-field gf-run-detail">
      <style>{RUN_NODE_DETAIL_CSS}</style>

      {!trace ? (
        <div className="gf-field-hint">Not recorded in this run.</div>
      ) : (
        <>
          <div className={`gf-run-status gf-run-status--${trace.skipped ? 'skipped' : trace.success ? 'success' : 'error'}`}>
            {trace.skipped ? 'Skipped - this branch was not taken' : trace.success ? 'Succeeded' : 'Failed'}
            {typeof trace.duration_ms === 'number' && <span className="gf-run-detail-duration">{trace.duration_ms}ms</span>}
          </div>
          {trace.pinned && <div className="gf-field-hint">Output was pinned for this run - no real call was made.</div>}
          {!trace.success && !trace.skipped && <div className="gf-field-error">{trace.error ?? 'This node failed.'}</div>}

          {!!trace.input?.length && (
            <div className="gf-run-detail-section">
              <div className="gf-field-label">Input</div>
              <pre className="gf-webhook-payload">{JSON.stringify(trace.input, null, 2)}</pre>
            </div>
          )}
          {!!trace.output?.length && (
            <div className="gf-run-detail-section">
              <div className="gf-field-label">Output</div>
              <pre className="gf-webhook-payload">{JSON.stringify(trace.output, null, 2)}</pre>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const RUN_NODE_DETAIL_CSS = `
.gf-run-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-xs);
  font-weight: 700;
}

.gf-run-status--success { color: #2ecc71; }
.gf-run-status--error { color: #ff6b6b; }
.gf-run-status--skipped { color: var(--color-text-muted); }

.gf-run-detail-duration {
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
  font-weight: 400;
}

.gf-run-detail-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
`
