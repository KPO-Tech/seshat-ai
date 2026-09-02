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
}

export type FlowGraphNode = Node<GraphNodeData, 'dataflow'>

export function GraphNode({ id, data, selected }: NodeProps<FlowGraphNode>) {
  const ports = outputPortsForNode(data.dfType, data.parameters)
  const color = data.categoryColor ?? 'var(--color-text-muted)'

  return (
    <div className={`gf-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} id={INPUT_HANDLE} className="gf-handle gf-handle-target" />
      <div className="gf-node-card">
        <div className="gf-node-icon" style={{ background: tintColor(color), color }}>
          {resolveNodeIcon(data.dfType, data.category ?? 'Other', 18)}
        </div>
        <div className="gf-node-text">
          <div className="gf-node-title">{data.title ?? data.dfType}</div>
          <div className="gf-node-subtitle">{id}</div>
        </div>
      </div>
      <div className="gf-node-ports">
        {ports.map((port) => (
          <div key={port} className="gf-node-port-row">
            {port !== 'main' && <span className="gf-port-label">{port}</span>}
            <Handle
              type="source"
              position={Position.Right}
              id={port}
              className="gf-handle"
              style={{ position: 'relative', transform: 'none', top: 0, right: 0, background: color }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export const GRAPH_NODE_TYPES = { dataflow: GraphNode }
