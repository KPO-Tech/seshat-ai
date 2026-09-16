import type { ToolUseBlock } from '../lib/chatTypes'
import { getToolPresentation } from './catalog/toolPresentation'
import { AgentActivityCard } from './AgentActivityCard'
import { LiveToolCard } from './LiveToolCard'
import { ToolCard } from './ToolCard'

export function ToolRenderer({ sessionId, tool, grouped = false }: { sessionId?: string; tool: ToolUseBlock; grouped?: boolean }) {
  const presentation = getToolPresentation(tool.name)
  if (tool._approval || tool._prompt) return <ToolCard sessionId={sessionId} tool={tool} presentation={presentation} grouped={grouped} />
  if (presentation.mode === 'agent_activity') return <AgentActivityCard tool={tool} presentation={presentation} />
  if (presentation.mode === 'live_workspace') return <LiveToolCard tool={tool} presentation={presentation} />
  return <ToolCard sessionId={sessionId} tool={tool} presentation={presentation} grouped={grouped} />
}
