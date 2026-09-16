import type { ToolUseBlock } from '../../lib/chatTypes'
import { parseMcpName } from '../catalog/toolCatalog'
import { CodePanel, prettyJsonOrRaw } from '../ToolDetails'

export function RagBody({ tool }: { tool: ToolUseBlock }) {
  const query = typeof tool.input.query === 'string' ? tool.input.query : ''
  const corpus = typeof tool.input.corpus_id === 'string' ? tool.input.corpus_id : ''
  return (
    <div className="grid gap-2">
      {(query || corpus) && (
        <div className="flex flex-wrap gap-2">
          {query && <span className="rounded-md bg-[var(--accent-primary)]/10 px-2 py-1 text-[11px] font-semibold text-[var(--accent-primary)]">{query}</span>}
          {corpus && <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">corpus: {corpus}</span>}
        </div>
      )}
      {tool._result?.content && <CodePanel title={tool._result.is_error || tool._result.isError ? 'Error' : 'Results'} value={tool._result.content} />}
    </div>
  )
}

export function McpBody({ tool }: { tool: ToolUseBlock }) {
  const parsed = parseMcpName(tool.name, tool.input)
  const args = Object.entries(tool.input).filter(([key]) => !['tool', '_tool', 'server', '_server'].includes(key))
  return (
    <div className="grid gap-2">
      <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2">
        <div className="text-[12px] font-semibold text-[var(--text-primary)]">{parsed.server || 'MCP'}</div>
        {parsed.tool && <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{parsed.tool}</div>}
      </div>
      {args.length > 0 && <CodePanel title="Arguments" value={Object.fromEntries(args)} />}
      {tool._result?.content && <CodePanel title={tool._result.is_error || tool._result.isError ? 'Error' : 'Result'} value={prettyJsonOrRaw(tool._result.content)} />}
    </div>
  )
}
