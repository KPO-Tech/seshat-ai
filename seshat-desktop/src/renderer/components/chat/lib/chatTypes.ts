export type TextBlock = { type: 'text'; text: string }
export type ThinkingBlock = { type: 'thinking'; thinking: string }
export type ToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
  _status?: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval'
  _result?: ToolResult
  _progress?: ToolProgress
  _partialInput?: string
  _message?: string
  _approval?: ToolApproval
  _prompt?: ToolPromptRequest
  _plan?: RuntimePlanEvent
}
export type ToolResultBlock = { type: 'tool_result'; tool_use_id?: string; content?: string; is_error?: boolean }

export type ToolApproval = {
  toolUseId: string
  toolName: string
  toolInput: Record<string, unknown>
  description?: string
  metadata?: Record<string, unknown>
}

export type ToolPromptRequest = {
  promptId: string
  type?: string
  message?: string
  options?: Array<{ label: string; value?: unknown; description?: string }>
  default?: unknown
  metadata?: Record<string, unknown>
}

export type ToolProgress = {
  toolUseId?: string
  toolName?: string
  stage?: 'pending' | 'running' | 'completed' | 'failed' | string
  message?: string
  summary?: string
  percentComplete?: number
  input?: Record<string, unknown>
  result?: string
  durationMs?: number
  metadata?: Record<string, unknown>
}

export type ChatContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock

export type ChatExecutionMode = 'execute' | 'plan'

export type TokenUsage = {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  cached_input_tokens?: number
  cache_creation_input_tokens?: number
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: ChatContentBlock[]
  created_at?: number
  status?: 'sending' | 'sent' | 'error'
  usage?: TokenUsage
  turn_number?: number
  stop_reason?: string
  is_complete?: boolean
}

export type ChatSession = {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  status?: 'idle' | 'running' | 'completed' | 'stopped' | 'failed'
  providerSettingId?: string
  modelId?: string
  executionMode?: ChatExecutionMode
}

export type ToolResult = {
  id?: string
  tool_use_id?: string
  content: string
  is_error?: boolean
  isError?: boolean
  duration_ms?: number
  durationMs?: number
  metadata?: Record<string, unknown>
}

export type StreamingBlock = TextBlock | ThinkingBlock | ToolUseBlock

export type QueryDone = {
  session_id: string
  content: string
  stop_reason?: string
  turn_number?: number
  is_complete?: boolean
  usage?: TokenUsage
  messages?: ChatMessage[]
  tool_results?: ToolResult[]
}

export type StreamEvent =
  | { event: string; data: unknown }
  | { event: 'done'; data: QueryDone }
  | { event: 'error'; data: { error?: string; message?: string } }
  | { event: 'runtime'; data: RuntimeEvent }
  | { event: 'session_titled'; data: { session_id?: string; title?: string } }

export type RuntimeEvent = {
  type?: string
  tool_progress?: RuntimeToolProgress
  toolProgress?: RuntimeToolProgress
  permission_request?: RuntimePermissionRequest
  permissionRequest?: RuntimePermissionRequest
  prompt_request?: RuntimePromptRequest
  promptRequest?: RuntimePromptRequest
  plan_event?: RuntimePlanEvent
  planEvent?: RuntimePlanEvent
}

export type RuntimeToolProgress = {
  tool_use_id?: string
  toolUseId?: string
  tool_name?: string
  toolName?: string
  name?: string
  stage?: string
  message?: string
  summary?: string
  percent_complete?: number
  percentComplete?: number
  input?: Record<string, unknown>
  tool_input?: Record<string, unknown>
  result?: string
  duration_ms?: number
  durationMs?: number
  metadata?: Record<string, unknown>
}

export type RuntimePermissionRequest = {
  tool_use_id?: string
  toolUseId?: string
  tool_name?: string
  toolName?: string
  tool_input?: Record<string, unknown>
  toolInput?: Record<string, unknown>
  description?: string
  metadata?: Record<string, unknown>
}

export type RuntimePromptRequest = {
  type?: string
  message?: string
  options?: Array<{ label: string; value?: unknown; description?: string }>
  default?: unknown
  metadata?: Record<string, unknown>
}

export type RuntimePlanEvent = {
  plan_id?: string
  planId?: string
  slug?: string
  filename?: string
  status?: string
  version?: number
  content?: string
}

export type PlanDocument = {
  id: string
  session_id: string
  slug: string
  filename: string
  content: string
  status: 'pending' | 'validated' | 'rejected' | string
  version: number
  created_at: number
  updated_at: number
}
