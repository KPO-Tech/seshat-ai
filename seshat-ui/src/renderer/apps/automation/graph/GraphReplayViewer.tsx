import { useMemo, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Background, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Close } from '@icon-park/react'
import { definitionToFlow } from './convert'
import { GRAPH_NODE_TYPES, type FlowGraphNode, type TestStatus, type TestRunNodeResult } from './GraphNode'
import { GRAPH_EDITOR_CSS, categoryColor, previewTextFor } from './GraphEditor'
import { RunNodeDetailPanel } from './RunNodeDetailPanel'
import type { DataflowDefinition, NodeDescription, NodeTraceEntry } from './types'
import { useUIStore } from '@/stores/ui'

type Props = {
  // The run's own graph_snapshot (or, for a pre-migration run that has
  // none, RunsPanel's fallback to the job's current live graph) - never the
  // job's live, still-editable graph directly, so this component has no
  // reason to ever call back with a change.
  graph: DataflowDefinition
  nodeTrace: NodeTraceEntry[] | undefined
  nodeTypes: NodeDescription[]
}

// Read-only canvas for one past run (Tier 2.6) - reuses definitionToFlow,
// GRAPH_NODE_TYPES and GRAPH_EDITOR_CSS from the real editor so a replayed
// graph looks identical to the live one, but with none of GraphEditor's
// mutation machinery (no NodeCreator, no undo/redo, no drag-to-move, no
// connect/delete, no ParameterForm) - selecting a node shows its real
// recorded outcome via RunNodeDetailPanel instead.
function GraphReplayViewerInner({ graph, nodeTrace, nodeTypes }: Props) {
  const theme = useUIStore((s) => s.theme)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const initial = useMemo(() => definitionToFlow(graph), [graph])
  const categories = useMemo(() => Array.from(new Set(nodeTypes.map((n) => n.category))), [nodeTypes])
  const traceById = useMemo(() => {
    const map = new Map<string, NodeTraceEntry>()
    for (const entry of nodeTrace ?? []) map.set(entry.id, entry)
    return map
  }, [nodeTrace])

  // Same title/category/isTrigger/categoryColor backfill GraphEditor.tsx
  // does in its own useEffect (a saved node only ever carries its raw
  // dfType) - duplicated rather than shared since this is a one-time memo
  // over a frozen graph, not a live-updating effect over an editable one.
  // testStatus/testResult reuse GraphNode's existing 2.4 badge fields to
  // show this run's real recorded outcome (see GraphNode.tsx's comment).
  const nodesForCanvas: FlowGraphNode[] = useMemo(
    () =>
      initial.nodes.map((n) => {
        const desc = nodeTypes.find((nt) => nt.type === n.data.dfType)
        const category = desc?.category ?? 'Other'
        const trace = traceById.get(n.id)
        const testStatus: TestStatus | undefined = !trace ? undefined : trace.skipped ? 'skipped' : trace.success ? 'success' : 'error'
        const testResult: TestRunNodeResult | undefined = trace
          ? { success: trace.success, error: trace.error, output: trace.output, duration: trace.duration_ms }
          : undefined
        return {
          ...n,
          data: {
            ...n.data,
            categoryColor: categories.length ? categoryColor(category, categories) : undefined,
            title: desc?.name,
            category,
            isTrigger: desc?.isTrigger,
            previewText: previewTextFor(desc?.properties, n.data.parameters),
            testStatus,
            testResult,
          },
        }
      }),
    [initial.nodes, nodeTypes, categories, traceById],
  )

  const selectedNode = nodesForCanvas.find((n) => n.id === selectedNodeId) ?? null

  return (
    <div className="gf-root">
      <style>{GRAPH_EDITOR_CSS}</style>
      <div className="gf-body">
        <div className="gf-canvas">
          <ReactFlow<FlowGraphNode>
            nodes={nodesForCanvas}
            edges={initial.edges}
            nodeTypes={GRAPH_NODE_TYPES}
            nodesDraggable={false}
            nodesConnectable={false}
            edgesReconnectable={false}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            colorMode={theme}
            fitView
            fitViewOptions={{ maxZoom: 0.85 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} orientation="horizontal" />
          </ReactFlow>
        </div>

        {selectedNode && (
          <aside className="gf-config-panel">
            <header className="gf-config-head">
              <div>
                <strong>{selectedNode.id}</strong>
                <span>{selectedNode.data.dfType}</span>
              </div>
              <button type="button" onClick={() => setSelectedNodeId(null)} aria-label="Close">
                <Close size={14} />
              </button>
            </header>
            <div className="gf-config-body">
              <RunNodeDetailPanel trace={traceById.get(selectedNode.id)} />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

export function GraphReplayViewer(props: Props) {
  return (
    <ReactFlowProvider>
      <GraphReplayViewerInner {...props} />
    </ReactFlowProvider>
  )
}
