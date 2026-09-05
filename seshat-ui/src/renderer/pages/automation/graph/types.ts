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
  // Freezes a node's output to a fixed set of items instead of actually
  // running it, keyed by node ID - mirrors the SDK's
  // Definition.PinnedData (Tier 2.3). Kept at this top level (not inside a
  // node's own `parameters`) since "frozen test output" is a different
  // concept from real node configuration.
  pinned_data?: Record<string, Record<string, unknown>[]>
}

export type NodeDescription = {
  type: string
  name: string
  description: string
  category: string
  properties?: NodeProperty[]
  // A trigger node (e.g. schedule_trigger) is a graph's entry point and its
  // own activation config, not a data transform - the editor renders it
  // without an input handle and groups it separately, without hardcoding a
  // type-name list. See pkg/dataflow's NodeDescription.IsTrigger.
  isTrigger?: boolean
}

// Mirrors github.com/KPO-Tech/seshat/pkg/dataflow's NodeProperty family
// (node.go) - a small, deliberately flat parameter schema (not n8n's
// ~20-type INodeProperties) so the editor can render real per-field forms
// for the node types that fit it. A node with no properties (subworkflow,
// set - see the SDK's own comments on why those stay JSON) has `properties`
// undefined/empty; the editor falls back to raw JSON for those, and for any
// future node type shipped before its schema is written.
export type NodePropertyType = 'string' | 'text' | 'number' | 'boolean' | 'options' | 'json' | 'secretRef'

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
