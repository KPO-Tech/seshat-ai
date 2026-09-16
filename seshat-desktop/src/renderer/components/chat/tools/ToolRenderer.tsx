import type { ToolUseBlock } from '../lib/chatTypes'
import { getToolPresentation } from './catalog/toolPresentation'
import { AgentActivityCard } from './AgentActivityCard'
import { LiveToolCard } from './LiveToolCard'
import { ToolCard } from './ToolCard'

export function ToolRenderer({ tool, grouped = false }: { tool: ToolUseBlock; grouped?: boolean }) {
  const presentation = getToolPresentation(tool.name)
  if (presentation.mode === 'agent_activity') return <AgentActivityCard tool={tool} presentation={presentation} />
  if (presentation.mode === 'live_workspace') return <LiveToolCard tool={tool} presentation={presentation} />
  return <ToolCard tool={tool} presentation={presentation} grouped={grouped} />
}
