import type { components } from '@/api/schema'

export type WorkspaceChatRole = 'user' | 'assistant' | 'system'
export type WorkspaceChatMessageStatus = 'draft' | 'complete' | 'error'
export type WorkspaceTraceKind = 'thinking' | 'tool'
export type WorkspaceTraceStatus = 'pending' | 'running' | 'completed' | 'failed'

export type WorkspaceChatEvent = components['schemas']['WorkspaceChatEvent']
export type WorkspaceChatToolProgress = components['schemas']['WorkspaceChatToolProgress']
export type WorkspaceChatWebSearchTrace = components['schemas']['WorkspaceChatWebSearchTrace']

export interface WorkspaceTraceStep {
  id: string
  kind: WorkspaceTraceKind
  status: WorkspaceTraceStatus
  // thinking steps
  content?: string
  // tool steps
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
  content: string
  createdAt: string
  status: WorkspaceChatMessageStatus
  trace?: WorkspaceTraceStep[]
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
