export type OnErrorMode = 'continueRegularOutput' | 'continueErrorOutput'

export type DataflowNode = {
  id: string
  type: string
  parameters?: Record<string, unknown>
  connections?: Record<string, string[]>
  retry_on_fail?: boolean
  max_tries?: number
  wait_between_tries_ms?: number
  on_error?: OnErrorMode
  // Structural references, not data-flow (mirrors pkg/dataflow.Node exactly)
  // - tools lists node IDs a "query"/"tools" node may invoke as LLM tools;
  // agent is the "agent"-typed node ID providing a "query" node's identity.
  // Never routed through `connections` - see convert.ts's reference edges.
  tools?: string[]
  agent?: string
}

export type DataflowDefinition = {
  name: string
  description?: string
  nodes: DataflowNode[]
  pinned_data?: Record<string, Record<string, unknown>[]>
}

export type NodeDescription = {
  type: string
  name: string
  description: string
  category: string
  properties?: NodeProperty[]
  isTrigger?: boolean
  // Tier 3.5 - set by the SDK's Registry.Types() via a type assertion when
  // the node type's executor implements TestableExecutor (a SQL Ping, a
  // Redis PING, ...). Lets the editor show a "Test connection" affordance
  // without hardcoding a type-name list.
  isTestable?: boolean
}

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

export type RunStatus = 'queued' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled'

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Queued',
  claimed: 'Claimed',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

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

export type Run = {
  id: string
  status: RunStatus
  queued_at: string
  started_at?: string
  finished_at?: string
  error_text?: string
  node_trace?: NodeTraceEntry[]
  graph_snapshot?: DataflowDefinition
}

export type UIPosition = { x: number; y: number }
