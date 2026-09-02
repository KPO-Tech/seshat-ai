// Mirrors github.com/KPO-Tech/seshat/pkg/dataflow's JSON shapes exactly
// (Definition/Node/NodeDescription) - see that package's types.go/node.go.
// This is the wire format a job's `graph` field round-trips through the
// API unchanged; GraphEditor converts between this and React Flow's own
// node/edge model (see convert.ts).

export type DataflowNode = {
  id: string
  type: string
  parameters?: Record<string, unknown>
  connections?: Record<string, string[]>
}

export type DataflowDefinition = {
  name: string
  description?: string
  nodes: DataflowNode[]
}

export type NodeDescription = {
  type: string
  name: string
  description: string
  category: string
}

// UI-only position, stashed inside a node's own `parameters` under this
// reserved key so canvas layout round-trips through the plain
// DataflowDefinition JSON without needing a backend schema change - every
// node executor's ValidateParameters only ever checks for the presence of
// its own required keys, never rejects unrecognized extra ones, so this is
// safe to carry alongside real parameters.
export const UI_POSITION_KEY = '__ui_position'

export type UIPosition = { x: number; y: number }
