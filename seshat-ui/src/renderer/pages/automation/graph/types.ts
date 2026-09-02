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
  properties?: NodeProperty[]
}

// Mirrors github.com/KPO-Tech/seshat/pkg/dataflow's NodeProperty family
// (node.go) - a small, deliberately flat parameter schema (not n8n's
// ~20-type INodeProperties) so the editor can render real per-field forms
// for the node types that fit it. A node with no properties (subworkflow,
// set - see the SDK's own comments on why those stay JSON) has `properties`
// undefined/empty; the editor falls back to raw JSON for those, and for any
// future node type shipped before its schema is written.
export type NodePropertyType = 'string' | 'text' | 'number' | 'boolean' | 'options' | 'json'

export type NodePropertyOption = {
  label: string
  value: string
}

export type DisplayCondition = {
  field: string
  equals: string[]
}

export type NodeProperty = {
  name: string
  displayName: string
  type: NodePropertyType
  required?: boolean
  default?: unknown
  placeholder?: string
  description?: string
  options?: NodePropertyOption[]
  displayIf?: DisplayCondition
}

// UI-only position, stashed inside a node's own `parameters` under this
// reserved key so canvas layout round-trips through the plain
// DataflowDefinition JSON without needing a backend schema change - every
// node executor's ValidateParameters only ever checks for the presence of
// its own required keys, never rejects unrecognized extra ones, so this is
// safe to carry alongside real parameters.
export const UI_POSITION_KEY = '__ui_position'

export type UIPosition = { x: number; y: number }
