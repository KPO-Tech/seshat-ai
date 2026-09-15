import { useState } from 'react'
import type { ToolUseBlock } from './chatTypes'

export function ToolCard({ tool }: { tool: ToolUseBlock }) {
  const [open, setOpen] = useState(false)
  const status = tool._result?.is_error ? 'failed' : tool._status ?? (tool._result ? 'completed' : 'running')
  const snippet = toolSnippet(tool)

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--surface-muted)]"
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-[var(--surface-muted)] text-[var(--text-muted)]">
          <ToolIcon name={tool.name} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{humanize(tool.name)}</span>
          {snippet && <span className="block truncate text-[11px] text-[var(--text-muted)]">{snippet}</span>}
        </span>
        <span className={statusClass(status)}>{statusLabel(status)}</span>
      </button>
      {open && (
        <div className="grid gap-2 border-t border-[var(--border-soft)] p-3">
          <CodePanel title="Input" value={tool.input} />
          {tool._partialInput && <CodePanel title="Partial input" value={tool._partialInput} />}
          {tool._result && <CodePanel title="Result" value={tool._result.content} />}
        </div>
      )}
    </div>
  )
}

function CodePanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold text-[var(--text-muted)]">{title}</div>
      <pre className="max-h-[220px] overflow-auto rounded-md bg-[var(--surface-muted)] p-3 text-[11px] leading-5 text-[var(--text-secondary)] no-scrollbar">
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

function statusClass(status: string) {
  const base = 'rounded-md px-2 py-1 text-[10px] font-semibold'
  if (status === 'completed') return `${base} bg-[var(--accent-success)]/10 text-[var(--accent-success)]`
  if (status === 'failed') return `${base} bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]`
  return `${base} bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]`
}

function statusLabel(status: string) {
  if (status === 'completed') return 'Done'
  if (status === 'failed') return 'Failed'
  if (status === 'awaiting_approval') return 'Approval'
  return 'Running'
}

function toolSnippet(tool: ToolUseBlock) {
  const input = tool.input ?? {}
  const query = input.query ?? input.command ?? input.path ?? input.url ?? input.file_path ?? input.name
  return typeof query === 'string' ? query : null
}

function humanize(value: string) {
  return value.replace(/^mcp__/, '').replace(/__/g, ' / ').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function ToolIcon({ name }: { name: string }) {
  if (name.includes('search') || name.includes('grep')) return <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="5" /><path d="m12 12 3 3" /></svg>
  if (name.includes('write') || name.includes('edit')) return <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11.5 3.5a1.8 1.8 0 0 1 3 3L7 14l-3 .8.8-3Z" /></svg>
  if (name.includes('bash') || name.includes('terminal')) return <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 6 3 3-3 3M9.5 12h4" /></svg>
  return <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3v5M12 10v5M4.5 4.5h3M10.5 13.5h3M6 12h6" /></svg>
}
