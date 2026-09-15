export type TextBlock = { type: 'text'; text: string }
export type ThinkingBlock = { type: 'thinking'; thinking: string }
export type ToolUseBlock = {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
  _status?: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval'
  _result?: ToolResult
  _partialInput?: string
}
export type ToolResultBlock = { type: 'tool_result'; tool_use_id?: string; content?: string; is_error?: boolean }

export type ChatContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: ChatContentBlock[]
  created_at?: number
  status?: 'sending' | 'sent' | 'error'
}

export type ChatSession = {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  providerSettingId?: string
  modelId?: string
}

export type ToolResult = {
  id?: string
  tool_use_id?: string
  content: string
  is_error?: boolean
  duration_ms?: number
  durationMs?: number
}

export type StreamingBlock = TextBlock | ThinkingBlock | ToolUseBlock

export type QueryDone = {
  session_id: string
  content: string
  stop_reason?: string
  messages?: ChatMessage[]
  tool_results?: ToolResult[]
}

export type StreamEvent =
  | { event: string; data: unknown }
  | { event: 'done'; data: QueryDone }
  | { event: 'error'; data: { error?: string; message?: string } }
