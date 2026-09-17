import { create } from 'zustand'
import type { ChatContentBlock, RuntimeEvent, ToolUseBlock } from '@renderer/components/chat/lib/chatTypes'
import { emptyAgentSession, isAgentLaunchTool, reduceAgentEvent, reduceAgentTool, type AgentSessionState } from '@renderer/components/chat/tools/agents/agentState'

type AgentState = {
  sessions: Record<string, AgentSessionState>
  ingestTool: (sessionId: string, tool: ToolUseBlock) => void
  ingestBlocks: (sessionId: string, blocks: ChatContentBlock[]) => void
  ingestEvent: (sessionId: string, event: RuntimeEvent, blocks: ChatContentBlock[]) => void
  markStopped: (sessionId: string, toolUseId: string) => void
  resetSession: (sessionId: string) => void
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  sessions: {},
  ingestTool: (sessionId, tool) => {
    const id = sessionId.trim()
    if (!id || !isAgentLaunchTool(tool.name)) return
    set((state) => ({
      sessions: { ...state.sessions, [id]: reduceAgentTool(state.sessions[id] ?? emptyAgentSession, tool) }
    }))
  },
  ingestBlocks: (sessionId, blocks) => {
    for (const block of blocks) {
      if (block.type === 'tool_use') get().ingestTool(sessionId, block)
    }
  },
  ingestEvent: (sessionId, event, blocks) => {
    const id = sessionId.trim()
    if (!id) return
    const tools = blocks.filter((block): block is ToolUseBlock => block.type === 'tool_use')
    set((state) => ({
      sessions: { ...state.sessions, [id]: reduceAgentEvent(state.sessions[id] ?? emptyAgentSession, event, tools) }
    }))
  },
  markStopped: (sessionId, toolUseId) => set((state) => {
    const session = state.sessions[sessionId]
    const agent = session?.agents[toolUseId]
    if (!session || !agent) return state
    return {
      sessions: {
        ...state.sessions,
        [sessionId]: {
          agents: {
            ...session.agents,
            [toolUseId]: { ...agent, status: 'stopped', activeTool: undefined, endedAt: Date.now() }
          }
        }
      }
    }
  }),
  resetSession: (sessionId) => set((state) => ({
    sessions: { ...state.sessions, [sessionId]: emptyAgentSession }
  }))
}))
