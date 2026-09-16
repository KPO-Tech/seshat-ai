import { create } from 'zustand'
import type { ChatContentBlock, ToolUseBlock } from '@renderer/components/chat/lib/chatTypes'

export type BrowserActionRun = {
  id: string
  name: string
  label: string
  status: 'running' | 'completed' | 'failed' | 'pending'
  target: string
  message: string
  startedAt: number
  endedAt?: number
}

type BrowserSessionState = {
  actions: BrowserActionRun[]
}

type BrowserState = {
  sessions: Record<string, BrowserSessionState>
  ingestTool: (sessionId: string, tool: ToolUseBlock) => void
  ingestBlocks: (sessionId: string, blocks: ChatContentBlock[]) => void
  resetSession: (sessionId: string) => void
}

export const useBrowserStore = create<BrowserState>()((set, get) => ({
  sessions: {},
  ingestTool: (sessionId, tool) => {
    const id = sessionId.trim()
    if (!id || !isBrowserTool(tool.name)) return
    set((state) => ({
      sessions: {
        ...state.sessions,
        [id]: {
          actions: upsertAction(state.sessions[id]?.actions ?? [], tool)
        }
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
    sessions: {
      ...state.sessions,
      [sessionId]: { actions: [] }
    }
  }))
}))

function upsertAction(actions: BrowserActionRun[], tool: ToolUseBlock) {
  const current = actions.find((action) => action.id === tool.id)
  const nextStatus = normalizeStatus(tool)
  const next: BrowserActionRun = {
    id: tool.id,
    name: tool.name,
    label: browserActionLabel(tool.name),
    status: nextStatus,
    target: browserTarget(tool),
    message: tool._progress?.summary || tool._progress?.message || tool._message || '',
    startedAt: current?.startedAt ?? Date.now(),
    endedAt: nextStatus === 'completed' || nextStatus === 'failed' ? current?.endedAt ?? Date.now() : undefined
  }
  return [...actions.filter((action) => action.id !== tool.id), next].slice(-20)
}

export function isBrowserTool(name: string) {
  const value = name.toLowerCase()
  return value.startsWith('browser_') || value.includes('browser') || value.includes('playwright') || value.includes('selenium')
}

export function browserActionLabel(name: string) {
  const value = name.toLowerCase()
  if (value.includes('navigate') || value.includes('open')) return 'Navigate'
  if (value.includes('click')) return 'Click'
  if (value.includes('type')) return 'Type'
  if (value.includes('press')) return 'Press'
  if (value.includes('scroll')) return 'Scroll'
  if (value.includes('screenshot')) return 'Screenshot'
  if (value.includes('snapshot')) return 'Snapshot'
  if (value.includes('extract')) return 'Extract'
  if (value.includes('select')) return 'Select page'
  return 'Browser'
}

export function browserTarget(tool: ToolUseBlock) {
  const input = { ...tool.input, ...tool._progress?.input }
  return text(input.url) ||
    text(input.target) ||
    text(input.href) ||
    text(input.element_id) ||
    text(input.selector) ||
    text(input.query) ||
    text(input.direction) ||
    text(input.key)
}

function normalizeStatus(tool: ToolUseBlock): BrowserActionRun['status'] {
  if (tool._result?.is_error || tool._result?.isError || tool._status === 'failed') return 'failed'
  if (tool._status === 'completed' || tool._result) return 'completed'
  if (tool._status === 'pending') return 'pending'
  return 'running'
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
