import { useEffect, useMemo, useState } from 'react'
import type { ToolUseBlock } from '../lib/chatTypes'
import { toolCategory, type ToolCategory } from './catalog/toolCatalog'
import { getToolStatus, ToolGlyph } from './ToolDetails'
import { ToolRenderer } from './ToolRenderer'

export function QuietToolGroup({ sessionId, tools }: { sessionId?: string; tools: ToolUseBlock[] }) {
  const summary = useMemo(() => buildSummary(tools), [tools])
  const hasActive = tools.some((tool) => isActiveStatus(getToolStatus(tool)))
  const hasFailed = tools.some((tool) => getToolStatus(tool) === 'failed')
  const [open, setOpen] = useState(hasActive || hasFailed)

  useEffect(() => {
    if (hasActive || hasFailed) setOpen(true)
    else setOpen(false)
  }, [hasActive, hasFailed, tools.length])

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--surface-muted)]"
      >
        <span className="flex -space-x-1.5">
          {summary.categories.slice(0, 3).map((category) => (
            <span key={category} className="flex size-6 items-center justify-center rounded-md border border-[var(--surface-panel)] bg-[var(--surface-muted)] text-[var(--text-muted)]">
              <CategoryGlyph category={category} />
            </span>
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{summary.title}</span>
          <span className="block truncate text-[10.5px] text-[var(--text-muted)]">{summary.detail}</span>
        </span>
        {hasActive && <span className="size-2 rounded-full bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary)]" />}
        <span className={['shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold', hasFailed ? 'bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]' : hasActive ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]'].join(' ')}>
          {hasFailed ? 'Needs review' : hasActive ? 'Working' : `${tools.length} steps`}
        </span>
        <span className="text-[12px] text-[var(--text-muted)]">{open ? 'Hide' : 'Details'}</span>
      </button>
      {open && (
        <div className="grid gap-1.5 border-t border-[var(--border-soft)] p-2">
          {tools.map((tool) => <ToolRenderer key={tool.id} sessionId={sessionId} tool={tool} grouped />)}
        </div>
      )}
    </div>
  )
}

function buildSummary(tools: ToolUseBlock[]) {
  const counts = new Map<ToolCategory, number>()
  for (const tool of tools) {
    const category = toolCategory(tool.name)
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  const entries = Array.from(counts.entries())
  const title = entries.map(([category, count]) => phrase(category, count)).join(', ')
  const detail = tools.slice(0, 4).map((tool) => tool.name.replace(/_/g, ' ')).join(' | ')
  return {
    title,
    detail: tools.length > 4 ? `${detail} | ${tools.length - 4} more` : detail,
    categories: entries.map(([category]) => category)
  }
}

function phrase(category: ToolCategory, count: number) {
  if (category === 'read') return count === 1 ? 'Read a file' : `Read ${count} files`
  if (category === 'search') return count === 1 ? 'Searched' : `Searched ${count} times`
  if (category === 'memory') return count === 1 ? 'Checked memory' : `Checked memory ${count} times`
  if (category === 'mcp') return count === 1 ? 'Used MCP' : `Used MCP ${count} times`
  if (category === 'automation') return count === 1 ? 'Updated automation' : `Updated automation ${count} times`
  return count === 1 ? 'Ran a tool' : `Ran ${count} tools`
}

function CategoryGlyph({ category }: { category: ToolCategory }) {
  if (category === 'read') return <ToolGlyph name="read_file" />
  if (category === 'search') return <ToolGlyph name="web_search" />
  if (category === 'memory') return <ToolGlyph name="memory_search_nodes" />
  if (category === 'mcp') return <ToolGlyph name="mcp" />
  if (category === 'automation') return <ToolGlyph name="schedule_job" />
  return <ToolGlyph name="tool" />
}

function isActiveStatus(status: string) {
  return status === 'running' || status === 'pending' || status === 'awaiting_approval'
}
