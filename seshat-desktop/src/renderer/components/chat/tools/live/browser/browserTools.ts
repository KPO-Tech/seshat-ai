import type { ToolUseBlock } from '../../../lib/chatTypes'

export function browserContextId(sessionId?: string) {
  return sessionId ? `session:${sessionId}` : 'chat'
}

export function browserTargetFromTool(tool: ToolUseBlock) {
  const input = { ...tool.input, ...tool._progress?.input }
  return text(input.url) || text(input.target) || text(input.href)
}

export function browserActionLabel(tool: ToolUseBlock) {
  const name = tool.name.toLowerCase()
  if (name.includes('navigate') || name.includes('open')) return 'Navigate'
  if (name.includes('click')) return 'Click'
  if (name.includes('type')) return 'Type'
  if (name.includes('scroll')) return 'Scroll'
  if (name.includes('screenshot')) return 'Screenshot'
  if (name.includes('snapshot')) return 'Snapshot'
  if (name.includes('extract')) return 'Extract'
  return 'Browser'
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
