import type { Edge } from '@xyflow/react'
import type { FlowGraphNode } from './GraphNode'
import type { DataflowDefinition, DataflowNode, UIPosition } from './types'
import { UI_POSITION_KEY } from './types'

export const INPUT_HANDLE = 'in'

// outputPortsForNode is data-driven, not a hardcoded per-type table with a
// fallback that can drift - "if" and "switch" are the only two node types
// pkg/dataflow ships that emit on anything but "main" (see
// pkg/dataflow/nodes/logic.go), and switch's own port set comes straight
// from its casesOrder parameter, so a palette/canvas never needs updating
// just because the user edited a switch node's cases.
export function outputPortsForNode(type: string, parameters: Record<string, unknown> | undefined): string[] {
  if (type === 'if') return ['true', 'false']
  if (type === 'switch') {
    const order = Array.isArray(parameters?.casesOrder)
      ? (parameters!.casesOrder as unknown[]).filter((v): v is string => typeof v === 'string')
      : []
    return [...order, 'default']
  }
  return ['main']
}

function nodePosition(node: DataflowNode, index: number): UIPosition {
  const stored = node.parameters?.[UI_POSITION_KEY]
  if (stored && typeof stored === 'object' && 'x' in (stored as object) && 'y' in (stored as object)) {
    const { x, y } = stored as UIPosition
    if (typeof x === 'number' && typeof y === 'number') return { x, y }
  }
  // Fallback grid layout for a definition authored without the canvas
  // (e.g. hand-written JSON, or by the agent via inbox_create_workflow) -
  // 4 columns, evenly spaced, so it's never a pile of overlapping boxes at
  // (0,0) on first open.
  const column = index % 4
  const row = Math.floor(index / 4)
  return { x: column * 260, y: row * 160 }
}

// stripUIPosition removes the reserved layout key before showing a node's
// parameters as editable JSON - the position is a canvas concern, not
// something the parameters editor should let a user hand-corrupt.
export function stripUIPosition(parameters: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!parameters) return {}
  const { [UI_POSITION_KEY]: _omit, ...rest } = parameters
  return rest
}

export function definitionToFlow(def: DataflowDefinition): { nodes: FlowGraphNode[]; edges: Edge[] } {
  const nodes: FlowGraphNode[] = def.nodes.map((n, i) => ({
    id: n.id,
    type: 'dataflow',
    position: nodePosition(n, i),
    data: { dfType: n.type, parameters: n.parameters ?? {} },
  }))

  const edges: Edge[] = []
  for (const n of def.nodes) {
    for (const [port, targets] of Object.entries(n.connections ?? {})) {
      for (const targetId of targets) {
        edges.push({
          id: `${n.id}:${port}->${targetId}`,
          source: n.id,
          sourceHandle: port,
          target: targetId,
          targetHandle: INPUT_HANDLE,
        })
      }
    }
  }
  return { nodes, edges }
}

export function flowToDefinition(name: string, description: string, nodes: FlowGraphNode[], edges: Edge[]): DataflowDefinition {
  return {
    name,
    description: description || undefined,
    nodes: nodes.map((n) => {
      const parameters = { ...n.data.parameters }
      parameters[UI_POSITION_KEY] = { x: Math.round(n.position.x), y: Math.round(n.position.y) }

      const connections: Record<string, string[]> = {}
      for (const edge of edges) {
        if (edge.source !== n.id) continue
        const port = edge.sourceHandle || 'main'
        if (!connections[port]) connections[port] = []
        connections[port].push(edge.target)
      }

      return {
        id: n.id,
        type: (n.data?.dfType as string) ?? 'unknown',
        parameters,
        connections: Object.keys(connections).length > 0 ? connections : undefined,
      }
    }),
  }
}
