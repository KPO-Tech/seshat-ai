import { useEffect, useState } from 'react'
import { Left } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { GraphReplayViewer } from './GraphReplayViewer'
import { RUN_STATUS_LABEL } from './types'
import type { DataflowDefinition, NodeDescription, Run } from './types'

type Props = {
  jobId: string
  // The job's current live graph - only ever used as a fallback for a run
  // recorded before GraphSnapshot existed (see types.ts's Run.graph_snapshot
  // doc comment), never for a run that has its own snapshot.
  graph: DataflowDefinition | null
  nodeTypes: NodeDescription[]
  // Deep-link from Overview's Attention/Activity rows ("View execution →") -
  // once the runs fetch resolves, auto-select this run instead of requiring
  // a manual click. Silently ignored if the id isn't found (e.g. stale link
  // to a since-deleted run).
  initialRunId?: string
}

function formatRunTime(run: Run): string {
  const raw = run.started_at ?? run.queued_at ?? run.finished_at
  return raw ? new Date(raw).toLocaleString() : 'Not started'
}

function runDurationMs(run: Run): number | null {
  if (!run.started_at || !run.finished_at) return null
  return new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
}

// The run-history view Automation never had (see automation/index.tsx's own
// former comment on AutomationOverviewPanel: "no run-inspector/node-trace
// drill-down yet... a fast-follow if this page needs it too") - Tier 2.6.
// One-shot fetch, no polling (same precedent as runHistory.ts's own
// one-shot lookup) - a run list is glanced at, not watched live.
export function RunsPanel({ jobId, graph, nodeTypes, initialRunId }: Props) {
  const [runs, setRuns] = useState<Run[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<Run | null>(null)

  useEffect(() => {
    let cancelled = false
    setRuns(null)
    setError(null)
    setSelectedRun(null)
    api
      .get<{ runs: Run[] }>(`/automation/jobs/${jobId}/runs?limit=50`)
      .then((res) => {
        if (cancelled) return
        const fetched = res.runs ?? []
        setRuns(fetched)
        if (initialRunId) {
          const match = fetched.find((r) => r.id === initialRunId)
          if (match) setSelectedRun(match)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load runs.')
      })
    return () => {
      cancelled = true
    }
  }, [jobId, initialRunId])

  if (selectedRun) {
    const usingFallbackGraph = !selectedRun.graph_snapshot
    const replayGraph = selectedRun.graph_snapshot ?? graph ?? { name: 'Untitled graph', nodes: [] }
    return (
      <div className="au-runs-replay">
        <style>{RUNS_PANEL_CSS}</style>
        <header className="au-runs-replay-head">
          <button type="button" className="au-icon-btn" onClick={() => setSelectedRun(null)} title="Back to runs">
            <Left size={15} />
          </button>
          <strong>{formatRunTime(selectedRun)}</strong>
          <span className={`au-overview-badge au-overview-badge--${selectedRun.status}`}>{RUN_STATUS_LABEL[selectedRun.status]}</span>
        </header>
        {usingFallbackGraph && (
          <div className="au-runs-replay-note">
            This run predates graph snapshots - showing the automation's current graph, which may not exactly match what actually ran.
          </div>
        )}
        <div className="au-runs-replay-canvas">
          <GraphReplayViewer graph={replayGraph} nodeTrace={selectedRun.node_trace} nodeTypes={nodeTypes} />
        </div>
      </div>
    )
  }

  return (
    <div className="au-overview">
      <style>{RUNS_PANEL_CSS}</style>
      {runs === null ? (
        <div className="au-loading">Loading…</div>
      ) : error ? (
        <div className="au-loading au-loading-error">{error}</div>
      ) : runs.length === 0 ? (
        <div className="au-stub">
          <h2>No runs yet</h2>
          <p>Run this automation manually or wait for its next scheduled trigger - past runs show up here, replayable on the real canvas.</p>
        </div>
      ) : (
        runs.map((run) => {
          const duration = runDurationMs(run)
          return (
            <div key={run.id} className="au-overview-row" onClick={() => setSelectedRun(run)} role="button" tabIndex={0}>
              <div className="au-overview-main">
                <div className="au-overview-name-row">
                  <span className={`au-overview-badge au-overview-badge--${run.status}`}>{RUN_STATUS_LABEL[run.status]}</span>
                  <span className="au-overview-name">{formatRunTime(run)}</span>
                  {duration !== null && <span className="au-runs-duration">{duration}ms</span>}
                </div>
                {run.error_text && <div className="au-overview-desc">{run.error_text}</div>}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

const RUNS_PANEL_CSS = `
.au-runs-duration {
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
}

.au-runs-replay {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.au-runs-replay-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.au-runs-replay-note {
  flex-shrink: 0;
  padding: 8px 16px;
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
  border-bottom: 1px solid var(--color-border-subtle);
}

.au-runs-replay-canvas {
  flex: 1;
  min-height: 0;
  position: relative;
}
`
