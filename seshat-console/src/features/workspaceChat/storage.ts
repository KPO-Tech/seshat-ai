import type { WorkspaceChatMessage, WorkspaceChatSession, WorkspaceChatSessionConfig } from '@/features/workspaceChat/types'

function generateID(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export function createWorkspaceChatSession(config: Partial<WorkspaceChatSessionConfig> = {}): WorkspaceChatSession {
  const now = new Date().toISOString()
  return {
    id: generateID('wchat'),
    title: 'Untitled scenario',
    createdAt: now,
    updatedAt: now,
    messages: [],
    config: {
      organizationId: config.organizationId ?? null,
      providerSettingId: config.providerSettingId ?? null,
      modelId: config.modelId ?? '',
      agentPresetId: config.agentPresetId ?? null,
      corpusId: config.corpusId ?? null,
      permissionMode: config.permissionMode ?? '',
      executionOrigin: 'interactive',
    },
  }
}

export function createWorkspaceChatMessage(input: Pick<WorkspaceChatMessage, 'role' | 'content' | 'status'>): WorkspaceChatMessage {
  return {
    id: generateID('wmsg'),
    createdAt: new Date().toISOString(),
    ...input,
  }
}
