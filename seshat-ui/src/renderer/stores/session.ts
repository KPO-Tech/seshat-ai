import { create } from 'zustand'
import type { Message, ContentBlock, ToolApproval, ToolPromptRequest, PlanDocument } from '@/api/types'

export type MessageAttachment = {
  id: string
  filename: string
  content_type?: string
  size?: number
  category?: 'images' | 'documents' | 'other'
  local_path?: string
  preview_url?: string
  page_preview_urls?: string[]
}

export type ChatSession = {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt?: string
  providerSettingId?: string
  providerLabel?: string
  modelId?: string
  modelLabel?: string
  permissionMode?: string
  executionOrigin?: string
  // "" / undefined for a normal chat session, or a product origin such as
  // "knowledge" / "inbox" for one-off agent sessions that should stay full
  // sessions while remaining easy to filter from product-neutral recents.
  source?: string
  workspacePath?: string
  projectPath?: string
  draftPrompt?: string
  draftAgentSlug?: string
  // File IDs already uploaded (via /sessions/:id/files) before this session's
  // first message was sent - attached from the Home screen, where a session
  // has to exist for the upload but the real send is deferred to
  // Conversation.tsx's draftPrompt auto-send effect. See Home.tsx.
  draftFileIds?: string[]
  draftAttachments?: MessageAttachment[]
  planArtifact?: string
  // Active plan documents keyed by plan_id
  plans?: Record<string, PlanDocument>
}

// Streaming state machine per block index
export type StreamingBlock =
  | { type: 'text'; index: number; text: string }
  | { type: 'thinking'; index: number; thinking: string }
  | {
      type: 'tool_use'
      index: number
      id: string
      name: string
      input: Record<string, unknown>
      metadata?: Record<string, unknown>
      _status?: 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed'
      _result?: { content: string; isError: boolean; durationMs?: number; metadata?: Record<string, unknown> }
      _approval?: ToolApproval
      _prompt?: ToolPromptRequest
      _partialInput?: string
      _message?: string
    }

// Per-tool activity entry in the activity log
export type ToolActivity = {
  toolName: string
  stage: 'pending' | 'running' | 'completed' | 'failed'
  message?: string
  startedAt: number
  endedAt?: number
}

export type PendingPermission = ToolApproval

// State for a single sub-agent instance identified by tool use ID
export type SubagentState = {
  toolUseId: string
  // Stable agent_id returned by spawn_agent (distinct from toolUseId, the key
  // this state is stored under). Only set for agents spawned via spawn_agent -
  // undefined for the synchronous `agent` tool, which has no cancel endpoint
  // since it never outlives its own tool call. Required to call
  // POST /subagents/{agentId}/cancel.
  agentId?: string
  agentType: string
  task: string
  status: 'running' | 'completed' | 'failed'
  streaming: StreamingBlock[]
  messages: Message[]
  turnNumber: number
  inputTokens: number
  outputTokens: number
  activeTool: ToolActivity | null
  activityLog: ToolActivity[]
  isThinking: boolean
  startedAt: number
  endedAt?: number
  error?: string
  result?: string
}

// Live observable state of the agent for a given session
export type AgentState = {
  executionMode: 'execute' | 'plan' | 'pair_programming'
  turnNumber: number
  inputTokens: number
  outputTokens: number
  activeTool: ToolActivity | null
  activityLog: ToolActivity[]
  isThinking: boolean
  pendingPermission: PendingPermission | null
  // Named pre-generation setup phase (loading tools, resuming session,
  // searching knowledge) — see turn.stage in useChat.ts's handleRuntimeEvent.
  // Superseded implicitly once isThinking flips true on turn.started, so no
  // separate "stage ended" signal is needed.
  stage: { stage: string; label: string } | null
}

const defaultAgentState = (): AgentState => ({
  executionMode: 'execute',
  turnNumber: 0,
  inputTokens: 0,
  outputTokens: 0,
  activeTool: null,
  activityLog: [],
  isThinking: false,
  pendingPermission: null,
  stage: null,
})

export const EMPTY_STREAMING: StreamingBlock[] = []
export const DEFAULT_AGENT_STATE = defaultAgentState()

type SessionState = {
  sessions: ChatSession[]
  activeId: string | null
  streamingBySession: Record<string, StreamingBlock[]>
  isStreamingBySession: Record<string, boolean>
  agentStates: Record<string, AgentState>

  setActive: (id: string | null) => void
  addSession: (session: ChatSession) => void
  upsertSession: (session: ChatSession) => void
  updateSession: (id: string, patch: Partial<ChatSession>) => void
  updateTitle: (id: string, title: string) => void
  addMessage: (sessionId: string, message: Message) => void
  updateMessage: (sessionId: string, messageId: string, updater: (message: Message) => Message) => void
  appendStreamBlock: (sessionId: string, block: StreamingBlock) => void
  getStreaming: (sessionId: string) => StreamingBlock[]
  setStreaming: (sessionId: string, blocks: StreamingBlock[]) => void
  updateStreamBlock: (sessionId: string, index: number, delta: Partial<StreamingBlock>) => void
  clearStreaming: (sessionId: string) => void
  isSessionStreaming: (sessionId: string) => boolean
  setIsStreaming: (sessionId: string, v: boolean) => void
  removeSession: (id: string) => void
  getActive: () => ChatSession | undefined
  // Wipes every session and derived state - called on logout / account switch
  // so a different account's data never carries over. See stores/auth.ts.
  resetAll: () => void

  // Agent state
  getAgentState: (sessionId: string) => AgentState
  updateAgentState: (sessionId: string, patch: Partial<AgentState>) => void
  pushToolActivity: (sessionId: string, activity: ToolActivity) => void
  resetAgentState: (sessionId: string) => void

  // Plan documents
  upsertPlan: (sessionId: string, plan: PlanDocument) => void
  getPlan: (sessionId: string, planId: string) => PlanDocument | undefined
  getSessionPlans: (sessionId: string) => PlanDocument[]
  getPendingPlan: (sessionId: string) => PlanDocument | undefined

  // Sub-agent state (keyed by sessionId -> toolUseId -> SubagentState)
  subagentsBySession: Record<string, Record<string, SubagentState>>
  getSubagents: (sessionId: string) => SubagentState[]
  getSubagent: (sessionId: string, toolUseId: string) => SubagentState | undefined
  upsertSubagent: (sessionId: string, toolUseId: string, patch: Partial<SubagentState> & { agentType?: string; task?: string }) => void
  appendSubagentStreamBlock: (sessionId: string, toolUseId: string, block: StreamingBlock) => void
  updateSubagentStreamBlock: (sessionId: string, toolUseId: string, index: number, delta: Partial<StreamingBlock>) => void
  clearSubagentStreaming: (sessionId: string, toolUseId: string) => void
  pushSubagentToolActivity: (sessionId: string, toolUseId: string, activity: ToolActivity) => void
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeId: null,
  streamingBySession: {},
  isStreamingBySession: {},
  agentStates: {},
  subagentsBySession: {},

  setActive: (id) => set({ activeId: id }),

  addSession: (session) =>
    set((s) => ({ sessions: [session, ...s.sessions], activeId: session.id })),

  upsertSession: (session) =>
    set((s) => {
      const existing = s.sessions.find((item) => item.id === session.id)
      if (!existing) {
        // Insert without touching activeId - callers that want to activate the
        // session (e.g. direct-URL navigation) should call setActive separately.
        return { sessions: [session, ...s.sessions] }
      }
      return {
        sessions: s.sessions.map((item) => (item.id === session.id ? { ...item, ...session } : item)),
      }
    }),

  updateSession: (id, patch) =>
    set((s) => ({
      sessions: s.sessions.map((sess) => (sess.id === id ? { ...sess, ...patch } : sess)),
    })),

  updateTitle: (id, title) =>
    set((s) => ({
      sessions: s.sessions.map((sess) => (sess.id === id ? { ...sess, title } : sess)),
    })),

  addMessage: (sessionId, message) =>
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, messages: [...sess.messages, message] } : sess
      ),
    })),

  updateMessage: (sessionId, messageId, updater) =>
    set((s) => ({
      sessions: s.sessions.map((sess) => {
        if (sess.id !== sessionId) return sess
        return {
          ...sess,
          messages: sess.messages.map((message) => (message.id === messageId ? updater(message) : message)),
        }
      }),
    })),

  appendStreamBlock: (sessionId, block) =>
    set((s) => ({
      streamingBySession: {
        ...s.streamingBySession,
        [sessionId]: [...(s.streamingBySession[sessionId] ?? []), block],
      },
    })),

  getStreaming: (sessionId) => get().streamingBySession[sessionId] ?? EMPTY_STREAMING,

  setStreaming: (sessionId, blocks) =>
    set((s) => ({
      streamingBySession: {
        ...s.streamingBySession,
        [sessionId]: blocks,
      },
    })),

  updateStreamBlock: (sessionId, index, delta) =>
    set((s) => ({
      streamingBySession: {
        ...s.streamingBySession,
        [sessionId]: (s.streamingBySession[sessionId] ?? []).map((b) =>
          b.index === index ? ({ ...b, ...delta } as StreamingBlock) : b
        ),
      },
    })),

  clearStreaming: (sessionId) =>
    set((s) => ({
      streamingBySession: {
        ...s.streamingBySession,
        [sessionId]: [],
      },
    })),

  isSessionStreaming: (sessionId) => Boolean(get().isStreamingBySession[sessionId]),

  setIsStreaming: (sessionId, v) =>
    set((s) => ({
      isStreamingBySession: {
        ...s.isStreamingBySession,
        [sessionId]: v,
      },
    })),

  removeSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((sess) => sess.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
      streamingBySession: Object.fromEntries(
        Object.entries(s.streamingBySession).filter(([sessionId]) => sessionId !== id)
      ),
      isStreamingBySession: Object.fromEntries(
        Object.entries(s.isStreamingBySession).filter(([sessionId]) => sessionId !== id)
      ),
      agentStates: Object.fromEntries(
        Object.entries(s.agentStates).filter(([sessionId]) => sessionId !== id)
      ) as Record<string, AgentState>,
      subagentsBySession: Object.fromEntries(
        Object.entries(s.subagentsBySession).filter(([sessionId]) => sessionId !== id)
      ) as Record<string, Record<string, SubagentState>>,
    })),

  getActive: () => {
    const { sessions, activeId } = get()
    return sessions.find((s) => s.id === activeId)
  },

  resetAll: () =>
    set({
      sessions: [],
      activeId: null,
      streamingBySession: {},
      isStreamingBySession: {},
      agentStates: {},
      subagentsBySession: {},
    }),

  // Agent state

  getAgentState: (sessionId) => {
    return get().agentStates[sessionId] ?? DEFAULT_AGENT_STATE
  },

  updateAgentState: (sessionId, patch) =>
    set((s) => ({
      agentStates: {
        ...s.agentStates,
          [sessionId]: { ...(s.agentStates[sessionId] ?? DEFAULT_AGENT_STATE), ...patch },
      },
    })),

  pushToolActivity: (sessionId, activity) =>
    set((s) => {
      const current = s.agentStates[sessionId] ?? DEFAULT_AGENT_STATE
      // Keep last 50 entries
      const log = [...current.activityLog, activity].slice(-50)
      return {
        agentStates: {
          ...s.agentStates,
          [sessionId]: { ...current, activityLog: log },
        },
      }
    }),

  resetAgentState: (sessionId) =>
    set((s) => ({
      agentStates: { ...s.agentStates, [sessionId]: defaultAgentState() },
    })),

  // Plan documents

  upsertPlan: (sessionId, plan) =>
    set((s) => ({
      sessions: s.sessions.map((sess) => {
        if (sess.id !== sessionId) return sess
        const existing = sess.plans ?? {}
        return { ...sess, plans: { ...existing, [plan.id]: plan } }
      }),
    })),

  getPlan: (sessionId, planId) => {
    const sess = get().sessions.find((s) => s.id === sessionId)
    return sess?.plans?.[planId]
  },

  getSessionPlans: (sessionId) => {
    const sess = get().sessions.find((s) => s.id === sessionId)
    return sess?.plans ? Object.values(sess.plans) : []
  },

  getPendingPlan: (sessionId) => {
    const sess = get().sessions.find((s) => s.id === sessionId)
    if (!sess?.plans) return undefined
    return Object.values(sess.plans).find((p) => p.status === 'pending')
  },

  // Sub-agent state

  getSubagents: (sessionId) => {
    const byId = get().subagentsBySession[sessionId]
    return byId ? Object.values(byId) : []
  },

  getSubagent: (sessionId, toolUseId) => get().subagentsBySession[sessionId]?.[toolUseId],

  upsertSubagent: (sessionId, toolUseId, patch) =>
    set((s) => {
      const byId = s.subagentsBySession[sessionId] ?? {}
      const existing = byId[toolUseId]
      const next: SubagentState = existing
        ? { ...existing, ...patch }
        : {
            toolUseId,
            agentType: patch.agentType ?? 'agent',
            task: patch.task ?? '',
            status: patch.status ?? 'running',
            streaming: [],
            messages: [],
            turnNumber: 0,
            inputTokens: 0,
            outputTokens: 0,
            activeTool: null,
            activityLog: [],
            isThinking: false,
            startedAt: Date.now(),
            ...patch,
          }
      return {
        subagentsBySession: {
          ...s.subagentsBySession,
          [sessionId]: { ...byId, [toolUseId]: next },
        },
      }
    }),

  appendSubagentStreamBlock: (sessionId, toolUseId, block) =>
    set((s) => {
      const byId = s.subagentsBySession[sessionId] ?? {}
      const existing = byId[toolUseId]
      if (!existing) return s
      return {
        subagentsBySession: {
          ...s.subagentsBySession,
          [sessionId]: {
            ...byId,
            [toolUseId]: { ...existing, streaming: [...existing.streaming, block] },
          },
        },
      }
    }),

  updateSubagentStreamBlock: (sessionId, toolUseId, index, delta) =>
    set((s) => {
      const byId = s.subagentsBySession[sessionId] ?? {}
      const existing = byId[toolUseId]
      if (!existing) return s
      return {
        subagentsBySession: {
          ...s.subagentsBySession,
          [sessionId]: {
            ...byId,
            [toolUseId]: {
              ...existing,
              streaming: existing.streaming.map((b) =>
                b.index === index ? ({ ...b, ...delta } as StreamingBlock) : b
              ),
            },
          },
        },
      }
    }),

  clearSubagentStreaming: (sessionId, toolUseId) =>
    set((s) => {
      const byId = s.subagentsBySession[sessionId] ?? {}
      const existing = byId[toolUseId]
      if (!existing) return s
      return {
        subagentsBySession: {
          ...s.subagentsBySession,
          [sessionId]: { ...byId, [toolUseId]: { ...existing, streaming: [] } },
        },
      }
    }),

  pushSubagentToolActivity: (sessionId, toolUseId, activity) =>
    set((s) => {
      const byId = s.subagentsBySession[sessionId] ?? {}
      const existing = byId[toolUseId]
      if (!existing) return s
      const log = [...existing.activityLog, activity].slice(-50)
      return {
        subagentsBySession: {
          ...s.subagentsBySession,
          [sessionId]: { ...byId, [toolUseId]: { ...existing, activityLog: log } },
        },
      }
    }),
}))

// Helper: build content blocks from streaming state (for final commit)
export function streamingToContentBlocks(streaming: StreamingBlock[]): ContentBlock[] {
  return streaming.map((b) => {
    if (b.type === 'text') return { type: 'text', text: b.text }
    if (b.type === 'thinking') return { type: 'thinking', thinking: b.thinking }
    return {
      type: 'tool_use',
      id: b.id,
      name: b.name,
      input: { ...b.input },
      metadata: b.metadata ? { ...b.metadata } : undefined,
      _status: b._status,
      _result: b._result
        ? {
            ...b._result,
            metadata: b._result.metadata ? { ...b._result.metadata } : undefined,
          }
        : undefined,
      _approval: b._approval ? { ...b._approval, toolInput: { ...b._approval.toolInput } } : undefined,
      _prompt: b._prompt
        ? {
            ...b._prompt,
            options: b._prompt.options ? b._prompt.options.map((option) => ({ ...option })) : undefined,
            metadata: b._prompt.metadata ? { ...b._prompt.metadata } : undefined,
          }
        : undefined,
      _partialInput: b._partialInput,
      _message: b._message,
    }
  })
}
