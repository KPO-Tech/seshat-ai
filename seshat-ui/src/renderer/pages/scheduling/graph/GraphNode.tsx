import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { outputPortsForNode, INPUT_HANDLE } from './convert'

export type GraphNodeData = {
  dfType: string
  parameters: Record<string, unknown>
  // categoryColor is resolved once by GraphEditor from the live node-types
  // catalog (so a new Category added server-side gets a color without a
  // frontend redeploy) and threaded in here rather than looked up per node.
  categoryColor?: string
}

export type FlowGraphNode = Node<GraphNodeData, 'dataflow'>

export function GraphNode({ id, data, selected }: NodeProps<FlowGraphNode>) {
  const ports = outputPortsForNode(data.dfType, data.parameters)
  const color = data.categoryColor ?? 'var(--color-text-muted)'

  return (
    <div className={`gf-node ${selected ? 'selected' : ''}`} style={{ borderColor: selected ? 'var(--color-cta)' : undefined }}>
      <Handle type="target" position={Position.Left} id={INPUT_HANDLE} className="gf-handle" />
      <div className="gf-node-head" style={{ borderLeftColor: color }}>
        <span className="gf-node-type">{data.dfType}</span>
      </div>
      <div className="gf-node-id">{id}</div>
      <div className="gf-node-ports">
        {ports.map((port) => (
          <div key={port} className="gf-node-port-row">
            {port !== 'main' && <span className="gf-port-label">{port}</span>}
            <Handle
              type="source"
              position={Position.Right}
              id={port}
              className="gf-handle"
              style={{ position: 'relative', transform: 'none', top: 0, right: 0 }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export const GRAPH_NODE_TYPES = { dataflow: GraphNode }
