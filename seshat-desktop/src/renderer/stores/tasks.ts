import { create } from 'zustand'
import type { ChatContentBlock, ToolUseBlock } from '@renderer/components/chat/lib/chatTypes'
import { emptyTaskSession, isTaskTool, reduceTaskTool, type TaskSessionState } from '@renderer/components/chat/tools/live/tasks/taskState'

type TaskState = {
  sessions: Record<string, TaskSessionState>
  ingestTool: (sessionId: string, tool: ToolUseBlock) => void
  ingestBlocks: (sessionId: string, blocks: ChatContentBlock[]) => void
  resetSession: (sessionId: string) => void
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  sessions: {},
  ingestTool: (sessionId, tool) => {
    const id = sessionId.trim()
    if (!id || !isTaskTool(tool.name)) return
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: reduceTaskTool(state.sessions[id] ?? emptyTaskSession, tool)
      }
    }))
  },
  ingestBlocks: (sessionId, blocks) => {
    const id = sessionId.trim()
    if (!id) return
    for (const block of blocks) {
      if (block.type === 'tool_use') get().ingestTool(id, block)
    }
  },
  resetSession: (sessionId) => set((state) => ({
    sessions: { ...state.sessions, [sessionId]: emptyTaskSession }
  }))
}))
