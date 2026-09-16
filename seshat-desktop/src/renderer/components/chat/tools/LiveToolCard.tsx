import { useEffect, useState } from 'react'
import type { ToolUseBlock } from '../lib/chatTypes'
import type { ToolPresentation } from './catalog/toolPresentation'
import { CodePanel, getToolStatus, StatusPill, ToolGlyph, toolSnippet } from './ToolDetails'
import { EditorLiveView } from './live/EditorLiveView'
import { TerminalLiveView } from './live/TerminalLiveView'

export function LiveToolCard({ sessionId, tool, presentation }: { sessionId?: string; tool: ToolUseBlock; presentation: ToolPresentation }) {
  const [open, setOpen] = useState(Boolean(presentation.initiallyOpen))
  const status = getToolStatus(tool)
  const snippet = tool._progress?.summary || tool._progress?.message || toolSnippet(tool)

  useEffect(() => {
    setOpen(status === 'running' || status === 'pending' || status === 'awaiting_approval')
  }, [status])

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface-muted)]"
      >
        <span className="flex size-7 items-center justify-center rounded-md bg-[var(--surface-muted)] text-[var(--text-secondary)]">
          <ToolGlyph name={tool.name} surface={presentation.surface} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{presentation.label}</span>
            {status === 'running' && <span className="size-1.5 shrink-0 rounded-full bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary)]" />}
          </span>
          {snippet && <span className="block truncate text-[11px] text-[var(--text-muted)]">{snippet}</span>}
        </span>
        <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)]">
          {presentation.surface}
        </span>
        <StatusPill status={status} />
      </button>
      {open && (
        <div className="grid gap-2 border-t border-[var(--border-soft)] p-3">
          <LiveBody sessionId={sessionId} tool={tool} surface={presentation.surface} />
        </div>
      )}
    </div>
  )
}

function LiveBody({ sessionId, tool, surface }: { sessionId?: string; tool: ToolUseBlock; surface: ToolPresentation['surface'] }) {
  if (surface === 'terminal') return <TerminalLiveView sessionId={sessionId} tool={tool} />
  if (surface === 'editor') return <EditorLiveView tool={tool} />
  return <GenericLiveBody tool={tool} />
}

function GenericLiveBody({ tool }: { tool: ToolUseBlock }) {
  return (
    <>
      <CodePanel title="Input" value={tool.input} />
      {tool._progress && <CodePanel title="Progress" value={tool._progress} />}
      {tool._partialInput && <CodePanel title="Partial input" value={tool._partialInput} />}
      {tool._result && <CodePanel title={tool._result.is_error || tool._result.isError ? 'Error' : 'Result'} value={tool._result.content} />}
    </>
  )
}
