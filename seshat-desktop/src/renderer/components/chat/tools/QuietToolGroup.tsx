import type { ToolUseBlock } from '../lib/chatTypes'
import { toolCategory } from './catalog/toolCatalog'
import { ToolRenderer } from './ToolRenderer'

export function QuietToolGroup({ tools }: { tools: ToolUseBlock[] }) {
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] px-3 py-2">
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">{summarizeTools(tools)}</span>
        <span className="shrink-0 rounded-md bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)]">
          {tools.length} steps
        </span>
      </div>
      <div className="grid gap-1.5 p-2">
        {tools.map((tool) => <ToolRenderer key={tool.id} tool={tool} grouped />)}
      </div>
    </div>
  )
}

function summarizeTools(tools: ToolUseBlock[]) {
  const counts = new Map<string, number>()
  for (const tool of tools) {
    const category = toolCategory(tool.name)
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  return Array.from(counts.entries()).map(([category, count]) => phrase(category, count)).join(', ')
}

function phrase(category: string, count: number) {
  if (category === 'read') return count === 1 ? 'Read a file' : `Read ${count} files`
  if (category === 'search') return count === 1 ? 'Searched' : `Searched ${count} times`
  if (category === 'memory') return count === 1 ? 'Checked memory' : `Checked memory ${count} times`
  if (category === 'mcp') return count === 1 ? 'Used MCP' : `Used MCP ${count} times`
  if (category === 'automation') return count === 1 ? 'Updated automation' : `Updated automation ${count} times`
  return count === 1 ? 'Ran a tool' : `Ran ${count} tools`
}
