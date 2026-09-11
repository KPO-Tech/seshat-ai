import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

// Renders a "reference" edge (see convert.ts's REFERENCE_EDGE_TYPE) - a
// query node's Agent link or a query/tools node's Tools wiring - visually
// distinct from a real data-flow connection: dashed, and colored by
// `data.kind` rather than the node's own category color, since these edges
// mean "structural link" not "data moves this way".
const KIND_COLOR: Record<string, string> = {
  agent: '#B197FC',
  tool: '#FFC53D',
}

export function ReferenceEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const kind = (data?.kind as string) ?? 'agent'
  const color = KIND_COLOR[kind] ?? KIND_COLOR.agent
  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      style={{ stroke: color, strokeWidth: 1.75, strokeDasharray: '5 4' }}
    />
  )
}

export const GRAPH_EDGE_TYPES = { reference: ReferenceEdge }
