import type { components } from '@/api/schema'

export type WorkspaceChatRole = 'user' | 'assistant' | 'system'
export type WorkspaceChatMessageStatus = 'draft' | 'complete' | 'error'
export type WorkspaceBlockKind = 'thinking' | 'tool' | 'text'
export type WorkspaceTraceStatus = 'pending' | 'running' | 'completed' | 'failed'

export type WorkspaceChatEvent = components['schemas']['WorkspaceChatEvent']
export type WorkspaceChatToolProgress = components['schemas']['WorkspaceChatToolProgress']
export type WorkspaceChatWebSearchTrace = components['schemas']['WorkspaceChatWebSearchTrace']

// One ordered unit of an assistant turn, in the exact order the server
// generated it. A real multi-step agentic turn interleaves thinking, tool
// calls and text any number of times (think, search, think some more,
// search again, then answer) - this single ordered array is what lets the
// UI render that real order instead of grouping every trace item before
// any text regardless of when either actually happened, which is what
// the separate trace[]/content pairing this replaced always did.
export interface WorkspaceChatBlock {
  id: string
  kind: WorkspaceBlockKind
  // thinking/text blocks
  content?: string
  // tool blocks
  status?: WorkspaceTraceStatus
  toolName?: string
  query?: string
  summary?: string
  input?: Record<string, unknown>
  result?: string
  durationMs?: number
  webSearch?: WorkspaceChatWebSearchTrace
}

export interface WorkspaceChatMessage {
  id: string
  role: WorkspaceChatRole
  // The full plain-text content - the only thing user/system messages
  // ever have. Assistant messages carry their real content in `blocks`
  // instead (see WorkspaceChatBlock's own doc comment) and leave this '';
  // kept required on the type rather than made role-conditional so every
  // call site doesn't need a role-narrowing check just to read it.
  content: string
  createdAt: string
  status: WorkspaceChatMessageStatus
  blocks?: WorkspaceChatBlock[]
}

export interface WorkspaceChatSessionConfig {
  organizationId: string | null
  providerSettingId: string | null
  modelId: string
  agentPresetId: string | null
  corpusId: string | null
  permissionMode: string
  executionOrigin: 'interactive'
}

export interface WorkspaceChatSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: WorkspaceChatMessage[]
  config: WorkspaceChatSessionConfig
}
