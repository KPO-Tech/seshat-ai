import type { ToolUseBlock } from '../lib/chatTypes'
import { catalogSnippet, toolCategory, toolLabel } from './catalog/toolCatalog'
import type { LiveToolSurface } from './catalog/toolPresentation'

export function getToolStatus(tool: ToolUseBlock) {
  return tool._result?.is_error || tool._result?.isError ? 'failed' : tool._status ?? (tool._result ? 'completed' : 'running')
}

export function toolSnippet(tool: ToolUseBlock) {
  const catalog = catalogSnippet(tool)
  if (catalog) return catalog
  const input = tool.input ?? {}
  const value = input.query ?? input.command ?? input.path ?? input.url ?? input.file_path ?? input.name ?? input.task
  return typeof value === 'string' ? value : null
}

export function compactToolLabel(tool: ToolUseBlock) {
  return tool._message && looksLikeSentence(tool._message) ? tool._message : toolLabel(tool.name)
}

export function toolResultSubtitle(tool: ToolUseBlock) {
  const status = getToolStatus(tool)
  if (status === 'failed') return 'failed'
  if (status !== 'completed' || !tool._result?.content) return null
  const lines = tool._result.content.split('\n').filter((line) => line.trim()).length
  return lines > 0 ? `${lines} line${lines === 1 ? '' : 's'}` : null
}

export function StatusPill({ status }: { status: string }) {
  return <span className={statusClass(status)}>{statusLabel(status)}</span>
}

export function CodePanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold text-[var(--text-muted)]">{title}</div>
      <pre className="no-scrollbar max-h-[220px] overflow-auto rounded-md bg-[var(--surface-muted)] p-3 text-[11px] leading-5 text-[var(--text-secondary)]">
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

export function ToolGlyph({ name, surface }: { name: string; surface?: LiveToolSurface }) {
  if (surface === 'browser' || name.includes('browser') || name.includes('navigate')) return <BrowserIcon />
  if (surface === 'terminal' || name.includes('bash') || name.includes('terminal')) return <TerminalIcon />
  if (surface === 'editor' || name.includes('write') || name.includes('edit')) return <EditIcon />
  if (name.includes('search') || name.includes('grep') || toolCategory(name) === 'search') return <SearchIcon />
  if (name.includes('agent')) return <AgentIcon />
  if (toolCategory(name) === 'mcp') return <PlugIcon />
  if (toolCategory(name) === 'memory') return <MemoryIcon />
  return <ToolIcon />
}

export function formatDuration(result: ToolUseBlock['_result']) {
  const ms = result?.duration_ms ?? result?.durationMs
  if (typeof ms !== 'number') return ''
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function prettyJsonOrRaw(value: string) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return value
  }
}

export function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

function looksLikeSentence(value: string) {
  const trimmed = value.trim()
  return trimmed.length >= 12 && trimmed.includes(' ')
}

function statusClass(status: string) {
  const base = 'rounded-md px-2 py-1 text-[10px] font-semibold'
  if (status === 'completed') return `${base} bg-[var(--accent-success)]/10 text-[var(--accent-success)]`
  if (status === 'failed') return `${base} bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]`
  if (status === 'awaiting_approval') return `${base} bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]`
  return `${base} bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]`
}

function statusLabel(status: string) {
  if (status === 'completed') return 'Done'
  if (status === 'failed') return 'Failed'
  if (status === 'awaiting_approval') return 'Approval'
  return 'Running'
}

function BrowserIcon() {
  return <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="12" height="10" rx="2" /><path d="M3 7h12" /><path d="M6 5.5h.01" /></svg>
}

function TerminalIcon() {
  return <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 6 3 3-3 3M9.5 12h4" /></svg>
}

function EditIcon() {
  return <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11.5 3.5a1.8 1.8 0 0 1 3 3L7 14l-3 .8.8-3Z" /></svg>
}

function SearchIcon() {
  return <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="8" cy="8" r="5" /><path d="m12 12 3 3" /></svg>
}

function AgentIcon() {
  return <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 3v2M5.5 5.5 7 7M12.5 5.5 11 7M5 10h8M6 14h6" /><rect x="4" y="7" width="10" height="8" rx="2" /></svg>
}

function PlugIcon() {
  return <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3v4M12 3v4M5 7h8v2a4 4 0 0 1-8 0V7ZM9 13v2" /></svg>
}

function MemoryIcon() {
  return <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="2" /><circle cx="12" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><path d="M7.7 7.3 8.5 10M10.3 7.3 9.5 10" /></svg>
}

function ToolIcon() {
  return <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3v5M12 10v5M4.5 4.5h3M10.5 13.5h3M6 12h6" /></svg>
}
