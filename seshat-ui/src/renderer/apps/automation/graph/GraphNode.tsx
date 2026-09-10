import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Pin, CheckOne, CloseOne, Loading, Attention, Reduce } from '@icon-park/react'
import { outputPortsForNode, INPUT_HANDLE } from './convert'
import { resolveNodeIcon, tintColor } from './nodeIcons'
import type { OnErrorMode } from './types'

// 'skipped' covers an if/switch branch not taken - reachable from a real
// past run's NodeTraceEntry.skipped (Tier 2.6 replay) and, in principle,
// from "test this node" (Tier 2.4) too, since testing a downstream node
// replays its real upstream chain which can itself branch.
export type TestStatus = 'running' | 'success' | 'error' | 'skipped'
export type TestRunNodeResult = { success: boolean; error?: string; output?: Record<string, unknown>[]; duration?: number }

export type GraphNodeData = {
  dfType: string
  parameters: Record<string, unknown>
  // categoryColor is resolved once by GraphEditor from the live node-types
  // catalog (so a new Category added server-side gets a color without a
  // frontend redeploy) and threaded in here rather than looked up per node.
  categoryColor?: string
  // Both backfilled by GraphEditor from the live catalog once it resolves -
  // UI-only, never read by convert.ts's flowToDefinition, so they never
  // leak into the saved DataflowDefinition.
  title?: string
  category?: string
  // Also backfilled from the live catalog (NodeDescription.isTrigger) - a
  // trigger node is a graph's own entry point, so it gets no input handle
  // (nothing should ever connect into it) and a distinct rounded-left shape.
  isTrigger?: boolean
  // Derived purely for rendering (see GraphEditor.tsx's previewTextFor) -
  // the current value of this node's most representative text/string
  // field (a prompt, a URL, a condition), so the card reads as "what this
  // step actually does" at a glance instead of only its type. Recomputed
  // every render from real parameters, never itself saved.
  previewText?: string
  // Real, save-relevant data (unlike title/category above) - round-trips
  // through convert.ts's flowToDefinition into the saved DataflowDefinition's
  // top-level pinned_data map (Tier 2.3). Present (even as []) means pinned;
  // undefined means not pinned.
  pinnedOutput?: Record<string, unknown>[]
  // Ephemeral "test this node" state (Tier 2.4) - UI-only like title/
  // category above, never read by flowToDefinition, reset on reload. See
  // GraphEditor.tsx's testNode/isNodeTestStale. Also reused, unchanged, by
  // GraphReplayViewer.tsx (Tier 2.6) to show a past run's real recorded
  // outcome instead of a live browser-side test - same badge, same tooltip
  // logic, just a different producer feeding the same two fields, since the
  // two concepts render identically (a node either ran successfully,
  // failed, or was skipped, whether that happened just now in the editor or
  // for real in a past scheduled run).
  testStatus?: TestStatus
  testResult?: TestRunNodeResult
  testSnapshot?: string
  // Derived purely for rendering (see GraphEditor.tsx's isNodeTestStale) -
  // recomputed into a display-only copy of `nodes` each render, never part
  // of the state React Flow's own onNodesChange manages.
  isStale?: boolean
  // Static validation (Tier 2.5) - also derived purely for rendering, from
  // the node-types catalog's own NodeProperty.required (see validation.ts's
  // missingRequiredFields). Empty/undefined means nothing missing.
  validationWarnings?: string[]
  // Retry/OnError (Tier 3.1) - real, save-relevant config like
  // pinnedOutput above, round-tripped by convert.ts as Node siblings (not
  // inside parameters) - see RetrySettingsField.tsx.
  retryOnFail?: boolean
  maxTries?: number
  waitBetweenTriesMs?: number
  onError?: OnErrorMode
}

export type FlowGraphNode = Node<GraphNodeData, 'dataflow'>

export function GraphNode({ id, data, selected }: NodeProps<FlowGraphNode>) {
  const ports = outputPortsForNode(data.dfType, data.parameters, data.onError)
  const color = data.categoryColor ?? 'var(--color-text-muted)'

  return (
    <div className={`gf-node ${data.isTrigger ? 'trigger' : ''} ${selected ? 'selected' : ''}`}>
      {/* No override: React Flow centers a Left/Right handle vertically on
          the node's own bounding box by default - since .gf-node now wraps
          only the card (no trailing ports block adding extra height below
          it), that center lines up exactly with the card's own edge. */}
      {!data.isTrigger && (
        <Handle type="target" position={Position.Left} id={INPUT_HANDLE} className="gf-handle gf-handle-target" />
      )}
      <div className="gf-node-card">
        {!!data.validationWarnings?.length && (
          <div className="gf-node-validation-badge" title={`Missing required field${data.validationWarnings.length > 1 ? 's' : ''}: ${data.validationWarnings.join(', ')}`}>
            <Attention theme="filled" size={10} />
          </div>
        )}
        {data.pinnedOutput && (
          <div className="gf-node-pin-badge" title="Output pinned - this node won't actually run">
            <Pin theme="filled" size={10} />
          </div>
        )}
        {data.testStatus && (
          <div
            className={`gf-node-test-badge ${data.testStatus}${data.isStale ? ' stale' : ''}`}
            title={
              data.testStatus === 'running' ? 'Testing…'
                : data.testStatus === 'error' ? (data.testResult?.error ?? 'Test failed')
                : data.testStatus === 'skipped' ? 'Skipped - this branch was not taken'
                : data.isStale ? 'Tested, but something changed since - retest'
                : 'Tested successfully'
            }
          >
            {data.testStatus === 'running' ? <Loading size={10} />
              : data.testStatus === 'error' ? <CloseOne theme="filled" size={10} />
              : data.testStatus === 'skipped' ? <Reduce theme="filled" size={10} />
              : <CheckOne theme="filled" size={10} />}
          </div>
        )}
        <div className="gf-node-icon" style={{ background: tintColor(color), color }}>
          {resolveNodeIcon(data.dfType, data.category ?? 'Other', 16)}
        </div>
        <div className="gf-node-text">
          <div className="gf-node-title">{data.title ?? data.dfType}</div>
          <div className="gf-node-subtitle">{data.previewText ?? id}</div>
        </div>
      </div>
      {/* Multi-port nodes (if/switch) get one dot per port, evenly spaced
          down the card's own right edge - single-'main'-port nodes get one
          dot dead center, matching the target handle on the left. */}
      {ports.map((port, i) => {
        const topPct = ((i + 1) / (ports.length + 1)) * 100
        return (
          <div key={port} className="gf-port" style={{ top: `${topPct}%` }}>
            {port !== 'main' && <span className="gf-port-label">{port}</span>}
            <Handle
              type="source"
              position={Position.Right}
              id={port}
              className="gf-handle"
              style={{ position: 'relative', top: 0, right: 0, transform: 'none', background: color }}
            />
          </div>
        )
      })}
    </div>
  )
}

export const GRAPH_NODE_TYPES = { dataflow: GraphNode }
