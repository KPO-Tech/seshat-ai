import { useState } from 'react'
import type { ToolUseBlock } from '../lib/chatTypes'
import type { ToolPresentation } from '../lib/toolPresentation'
import { CodePanel, getToolStatus, StatusPill, ToolGlyph, toolSnippet } from './ToolDetails'

export function AgentActivityCard({ tool, presentation }: { tool: ToolUseBlock; presentation: ToolPresentation }) {
  const [open, setOpen] = useState(Boolean(presentation.initiallyOpen))
  const status = getToolStatus(tool)
  const snippet = toolSnippet(tool)

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface-muted)]"
      >
        <span className="flex size-7 items-center justify-center rounded-md bg-[var(--accent-primary)]/12 text-[var(--accent-primary)]">
          <ToolGlyph name={tool.name} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{presentation.label}</span>
          {snippet && <span className="block truncate text-[11px] text-[var(--text-muted)]">{snippet}</span>}
        </span>
        <StatusPill status={status} />
      </button>
      {open && (
        <div className="grid gap-2 border-t border-[var(--border-soft)] p-3">
          <CodePanel title="Task" value={tool.input} />
          {tool._result && <CodePanel title="Result" value={tool._result.content} />}
        </div>
      )}
    </div>
  )
}
