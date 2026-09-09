import type { Edge } from '@xyflow/react'
import type { FlowGraphNode } from './GraphNode'
import type { DataflowDefinition, DataflowNode, OnErrorMode, UIPosition } from './types'
import { UI_POSITION_KEY } from './types'

export const INPUT_HANDLE = 'in'

// outputPortsForNode is data-driven, not a hardcoded per-type table with a
// fallback that can drift - "if" and "switch" are the only two node types
// pkg/dataflow ships that emit on anything but "main" (see
// pkg/dataflow/nodes/logic.go), and switch's own port set comes straight
// from its casesOrder parameter, so a palette/canvas never needs updating
// just because the user edited a switch node's cases. onError is the one
// exception to "port set is purely type-driven" - any node type gains a
// second "error" port once its own onError is set to continueErrorOutput
// (Tier 3.1), since retry/error-handling is cross-cutting engine behavior,
// not a property of the node type itself.
export function outputPortsForNode(type: string, parameters: Record<string, unknown> | undefined, onError?: OnErrorMode): string[] {
  let ports: string[]
  if (type === 'if') {
    ports = ['true', 'false']
  } else if (type === 'switch') {
    const order = Array.isArray(parameters?.casesOrder)
      ? (parameters!.casesOrder as unknown[]).filter((v): v is string => typeof v === 'string')
      : []
    ports = [...order, 'default']
  } else {
    ports = ['main']
  }
  return onError === 'continueErrorOutput' ? [...ports, 'error'] : ports
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
    data: {
      dfType: n.type,
      parameters: n.parameters ?? {},
      pinnedOutput: def.pinned_data?.[n.id],
      retryOnFail: n.retry_on_fail,
      maxTries: n.max_tries,
      waitBetweenTriesMs: n.wait_between_tries_ms,
      onError: n.on_error,
    },
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

// ancestorClosure returns targetId plus every node that (transitively) feeds
// into it, and the edges connecting them - the sub-graph "test this node"
// (Tier 2.4) actually runs, so testing a downstream node replays its real
// upstream chain (pin costly upstream nodes first - Tier 2.3 - to skip
// re-running them for real). Plain backward BFS over the edges already held
// client-side; no engine internals needed.
export function ancestorClosure(nodes: FlowGraphNode[], edges: Edge[], targetId: string): { nodes: FlowGraphNode[]; edges: Edge[] } {
  const included = new Set<string>([targetId])
  const queue = [targetId]
  while (queue.length > 0) {
    const current = queue.pop()!
    for (const edge of edges) {
      if (edge.target === current && !included.has(edge.source)) {
        included.add(edge.source)
        queue.push(edge.source)
      }
    }
  }
  return {
    nodes: nodes.filter((n) => included.has(n.id)),
    edges: edges.filter((e) => included.has(e.source) && included.has(e.target)),
  }
}

export function flowToDefinition(name: string, description: string, nodes: FlowGraphNode[], edges: Edge[]): DataflowDefinition {
  const pinnedData: Record<string, Record<string, unknown>[]> = {}
  for (const n of nodes) {
    if (n.data.pinnedOutput !== undefined) pinnedData[n.id] = n.data.pinnedOutput
  }

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
        retry_on_fail: n.data.retryOnFail || undefined,
        max_tries: n.data.maxTries,
        wait_between_tries_ms: n.data.waitBetweenTriesMs,
        on_error: n.data.onError,
      }
    }),
    pinned_data: Object.keys(pinnedData).length > 0 ? pinnedData : undefined,
  }
}
