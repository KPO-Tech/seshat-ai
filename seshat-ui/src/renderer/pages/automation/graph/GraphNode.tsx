import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { outputPortsForNode, INPUT_HANDLE } from './convert'
import { resolveNodeIcon, tintColor } from './nodeIcons'

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
}

export type FlowGraphNode = Node<GraphNodeData, 'dataflow'>

export function GraphNode({ id, data, selected }: NodeProps<FlowGraphNode>) {
  const ports = outputPortsForNode(data.dfType, data.parameters)
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
        <div className="gf-node-icon" style={{ background: tintColor(color), color }}>
          {resolveNodeIcon(data.dfType, data.category ?? 'Other', 16)}
        </div>
        <div className="gf-node-text">
          <div className="gf-node-title">{data.title ?? data.dfType}</div>
          <div className="gf-node-subtitle">{id}</div>
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
