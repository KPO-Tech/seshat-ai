// Mirrors github.com/KPO-Tech/seshat/pkg/dataflow's JSON shapes exactly
// (Definition/Node/NodeDescription) - see that package's types.go/node.go.
// This is the wire format a job's `graph` field round-trips through the
// API unchanged; GraphEditor converts between this and React Flow's own
// node/edge model (see convert.ts).

// OnErrorMode mirrors the SDK's Node.OnError string values (Tier 3.1) -
// "" (absent) means today's default (stop the run) and is never sent
// explicitly, only the two opt-in modes below are.
export type OnErrorMode = 'continueRegularOutput' | 'continueErrorOutput'

export type DataflowNode = {
  id: string
  type: string
  parameters?: Record<string, unknown>
  connections?: Record<string, string[]>
  // Retry/OnError (Tier 3.1) - real production behavior, so these are
  // siblings of parameters/connections here too, matching the SDK's own
  // Node shape exactly (see pkg/dataflow's types.go) rather than a
  // PinnedData-style side map.
  retry_on_fail?: boolean
  max_tries?: number
  wait_between_tries_ms?: number
  on_error?: OnErrorMode
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

// Shared with automation/index.tsx (which owns RunStatus for a job's own
// last_run_status too) - defined here, a leaf module, rather than in
// index.tsx itself, so RunsPanel.tsx/GraphReplayViewer.tsx can import it
// without an index.tsx -> graph/RunsPanel.tsx -> index.tsx import cycle.
export type RunStatus = 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled'

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Queued', claimed: 'Claimed', running: 'Running',
  completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled',
}

// Mirrors github.com/EngineerProjects/seshat-ai/seshat-server's
// sdb.NodeTraceEntry JSON shape exactly (snake_case, as the API returns it,
// no camelCase remapping - same convention scheduling/index.tsx's own local
// RunNodeTraceEntry already follows for the flat Activities log). Real
// per-node execution detail for one past run (Tier 1.3), read-only - what
// Tier 2.6 replay renders in place of a node's live parameters.
export type NodeTraceEntry = {
  id: string
  type: string
  success: boolean
  skipped?: boolean
  pinned?: boolean
  error?: string
  input?: Record<string, unknown>[]
  input_source?: { node?: string; port?: string }[]
  output?: Record<string, unknown>[]
  output_by_port?: Record<string, Record<string, unknown>[]>
  started_at: string
  ended_at: string
  duration_ms?: number
}

// Mirrors automation.Run (seshat-server/internal/server/automation/runs.go)
// - one execution instance of a job, as returned by GET /jobs/{id}/runs and
// GET /runs/{id}. Only the fields Tier 2.6's Runs list/replay actually use;
// see JobRun for the full set if a future feature needs more of it.
export type Run = {
  id: string
  status: RunStatus
  queued_at: string
  started_at?: string
  finished_at?: string
  error_text?: string
  node_trace?: NodeTraceEntry[]
  // The job's graph exactly as it was when this run was queued (see
  // sdb.JobRun.GraphSnapshot) - what replay draws the canvas from, instead
  // of the job's current live graph, so an edit made after the run doesn't
  // misattribute node_trace onto today's shape. Absent for Prompt jobs and
  // for runs recorded before this field existed.
  graph_snapshot?: DataflowDefinition
}

// Mirrors dataflowvariables.Variable (seshat-server) - an org-scoped named
// value (Tier 3.2's "Variables"), referenced as $vars.NAME in any
// expression. Value is included (unlike a dataflow secret's own CRUD
// shape) since a Variable isn't a credential - safe to show in a list.
export type Variable = {
  id: string
  organization_id: string
  name: string
  value: string
}

// UI-only position, stashed inside a node's own `parameters` under this
// reserved key so canvas layout round-trips through the plain
// DataflowDefinition JSON without needing a backend schema change - every
// node executor's ValidateParameters only ever checks for the presence of
// its own required keys, never rejects unrecognized extra ones, so this is
// safe to carry alongside real parameters.
export const UI_POSITION_KEY = '__ui_position'

export type UIPosition = { x: number; y: number }
