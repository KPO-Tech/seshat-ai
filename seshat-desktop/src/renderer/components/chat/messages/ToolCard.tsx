import { useState } from 'react'
import type { ToolUseBlock } from '../lib/chatTypes'
import { isSilentTool, toolLabel } from '../lib/toolCatalog'
import type { ToolPresentation } from '../lib/toolPresentation'
import { getToolStatus, StatusPill, ToolGlyph, compactToolLabel, toolResultSubtitle, toolSnippet } from './ToolDetails'
import { ToolBody } from './ToolBody'

export function ToolCard({ tool, presentation, grouped = false }: { tool: ToolUseBlock; presentation: ToolPresentation; grouped?: boolean }) {
  const [open, setOpen] = useState(Boolean(presentation.initiallyOpen))
  const status = getToolStatus(tool)
  const snippet = toolSnippet(tool)
  const silent = isSilentTool(tool.name)

  if (silent) {
    return <SilentToolLine tool={tool} open={open} setOpen={setOpen} grouped={grouped} />
  }

  return (
    <div className={['overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]', grouped ? '' : 'my-2'].join(' ')}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface-muted)]"
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-[var(--surface-muted)] text-[var(--text-muted)]">
          <ToolGlyph name={tool.name} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{toolLabel(tool.name) || presentation.label}</span>
          {snippet && <span className="block truncate text-[11px] text-[var(--text-muted)]">{snippet}</span>}
        </span>
        <StatusPill status={status} />
      </button>
      {open && (
        <div className="grid gap-2 border-t border-[var(--border-soft)] p-3">
          <ToolBody tool={tool} />
        </div>
      )}
    </div>
  )
}

function SilentToolLine({
  tool,
  open,
  setOpen,
  grouped
}: {
  tool: ToolUseBlock
  open: boolean
  setOpen: (updater: (value: boolean) => boolean) => void
  grouped: boolean
}) {
  const status = getToolStatus(tool)
  const failed = status === 'failed'
  const subtitle = toolResultSubtitle(tool)
  const snippet = toolSnippet(tool)
  const canOpen = failed || Boolean(tool._result?.content) || Boolean(tool._partialInput)

  return (
    <div className={['overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)]', grouped ? '' : 'my-1.5'].join(' ')}>
      <button
        type="button"
        onClick={() => { if (canOpen) setOpen((value) => !value) }}
        className="flex min-h-9 w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-[var(--surface-muted)]"
      >
        <span className="flex size-5 items-center justify-center text-[var(--text-muted)]">
          <ToolGlyph name={tool.name} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{compactToolLabel(tool) || toolLabel(tool.name)}</span>
          {(snippet || subtitle) && <span className={['block truncate text-[10.5px]', failed ? 'text-[var(--accent-danger)]' : 'text-[var(--text-muted)]'].join(' ')}>{failed ? 'failed' : snippet || subtitle}</span>}
        </span>
        {status === 'running' && <span className="size-2 rounded-full bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary)]" />}
        {canOpen && <span className="text-[12px] text-[var(--text-muted)]">{open ? 'Hide' : 'Details'}</span>}
      </button>
      {open && canOpen && (
        <div className="border-t border-[var(--border-soft)] p-3">
          <ToolBody tool={tool} />
        </div>
      )}
    </div>
  )
}
