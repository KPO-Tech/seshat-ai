import { useState } from 'react'
import type { ToolUseBlock } from '../lib/chatTypes'
import { parseMcpName, toolEntry } from './catalog/toolCatalog'
import { CodePanel, formatDuration, hostFromUrl, prettyJsonOrRaw } from './ToolDetails'

export function ToolBody({ tool }: { tool: ToolUseBlock }) {
  const body = toolEntry(tool.name).body ?? 'generic'
  if (body === 'web_search') return <WebSearchBody tool={tool} />
  if (body === 'web_fetch') return <WebFetchBody tool={tool} />
  if (body === 'rag') return <RagBody tool={tool} />
  if (body === 'mcp') return <McpBody tool={tool} />
  if (body === 'ask_user') return <AskUserBody tool={tool} />
  if (body === 'json') return <JsonBody tool={tool} />
  if (body === 'prose') return <ProseBody tool={tool} />
  return <GenericBody tool={tool} />
}

function GenericBody({ tool }: { tool: ToolUseBlock }) {
  return (
    <div className="grid gap-2">
      <CodePanel title="Input" value={tool.input} />
      {tool._partialInput && <CodePanel title="Partial input" value={tool._partialInput} />}
      {tool._result?.content && <CodePanel title={tool._result.is_error || tool._result.isError ? 'Error' : 'Result'} value={prettyJsonOrRaw(tool._result.content)} />}
    </div>
  )
}

function JsonBody({ tool }: { tool: ToolUseBlock }) {
  if (!tool._result?.content) return <GenericBody tool={tool} />
  return <CodePanel title={tool._result.is_error || tool._result.isError ? 'Error' : 'Result'} value={prettyJsonOrRaw(tool._result.content)} />
}

function ProseBody({ tool }: { tool: ToolUseBlock }) {
  if (!tool._result?.content) return <GenericBody tool={tool} />
  return (
    <div className="rounded-md bg-[var(--surface-muted)] px-3 py-2 text-[12px] leading-6 text-[var(--text-secondary)] whitespace-pre-wrap">
      {tool._result.content}
    </div>
  )
}

function WebSearchBody({ tool }: { tool: ToolUseBlock }) {
  const hits = parseWebSearchHits(tool._result?.content ?? '')
  const [showAll, setShowAll] = useState(false)
  const visibleHits = showAll ? hits : hits.slice(0, 5)
  const provider = metadataText(tool, 'provider')
  const count = Number(tool._result?.metadata?.result_count ?? hits.length)
  const stat = [provider, count > 0 ? `${count} result${count === 1 ? '' : 's'}` : '', formatDuration(tool._result)].filter(Boolean).join(' | ')

  if (tool._result?.is_error || tool._result?.isError) return <CodePanel title="Error" value={tool._result.content} />

  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] px-3 py-2">
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">Sources</span>
        {stat && <span className="truncate text-[10.5px] text-[var(--text-muted)]">{stat}</span>}
      </div>
      {visibleHits.length > 0 ? (
        <div className="no-scrollbar max-h-[240px] overflow-y-auto">
          {visibleHits.map((hit, index) => (
            <a key={`${hit.url}-${index}`} href={hit.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 border-b border-[var(--border-soft)] px-3 py-2 last:border-b-0 hover:bg-[var(--surface-panel)]">
              <Favicon domain={hostFromUrl(hit.url)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{hit.title || hit.url}</span>
                {hit.snippet && <span className="block truncate text-[11px] text-[var(--text-muted)]">{hit.snippet}</span>}
              </span>
              <span className="max-w-[160px] truncate text-[10.5px] text-[var(--text-muted)]">{hostFromUrl(hit.url)}</span>
            </a>
          ))}
        </div>
      ) : (
        <div className="px-3 py-2 text-[12px] text-[var(--text-muted)]">No sources found.</div>
      )}
      {hits.length > 5 && (
        <button type="button" onClick={() => setShowAll((value) => !value)} className="w-full px-3 py-2 text-left text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-panel)]">
          {showAll ? 'Show fewer sources' : `View all sources (${hits.length})`}
        </button>
      )}
    </div>
  )
}

function WebFetchBody({ tool }: { tool: ToolUseBlock }) {
  const url = typeof tool.input.url === 'string' ? tool.input.url : ''
  const parsed = parseFetchResult(tool._result?.content ?? '')
  const source = parsed.fetchedFrom || url
  const stat = [parsed.status, parsed.mode, parsed.size, parsed.time || formatDuration(tool._result)].filter(Boolean).join(' | ')

  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] px-3 py-2">
        {source ? <a href={source} target="_blank" rel="noreferrer" className="truncate text-[12px] font-semibold text-[var(--text-primary)] hover:text-[var(--accent-primary)]">{source}</a> : <span className="text-[12px] font-semibold">Web Fetch</span>}
        {stat && <span className="shrink-0 text-[10.5px] text-[var(--text-muted)]">{stat}</span>}
      </div>
      {tool._result?.is_error || tool._result?.isError ? <CodePanel title="Error" value={tool._result.content} /> : <CodePanel title="Extraction" value={parsed.content} />}
    </div>
  )
}

function RagBody({ tool }: { tool: ToolUseBlock }) {
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

function McpBody({ tool }: { tool: ToolUseBlock }) {
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

function AskUserBody({ tool }: { tool: ToolUseBlock }) {
  const question = tool._prompt?.message || (typeof tool.input.question === 'string' ? tool.input.question : '')
  return (
    <div className="grid gap-2">
      {question && <div className="rounded-md bg-[var(--surface-muted)] px-3 py-2 text-[12px] font-semibold text-[var(--text-primary)]">{question}</div>}
      {tool._result?.content && <CodePanel title="Answer" value={tool._result.content} />}
      {!tool._result?.content && <CodePanel title="Input" value={tool.input} />}
    </div>
  )
}

function Favicon({ domain }: { domain: string }) {
  const [failed, setFailed] = useState(false)
  if (!domain || failed) {
    return <span className="flex size-5 shrink-0 items-center justify-center rounded bg-[var(--accent-primary)] text-[9px] font-bold text-white">{domain.charAt(0).toUpperCase() || 'S'}</span>
  }
  return <img className="size-5 shrink-0 rounded object-cover" src={`https://icons.duckduckgo.com/ip3/${domain}.ico`} alt="" loading="lazy" onError={() => setFailed(true)} />
}

function parseWebSearchHits(content: string) {
  const lines = content.split('\n')
  const hits: Array<{ title: string; url: string; snippet: string }> = []
  for (let index = 0; index < lines.length; index += 1) {
    const titleMatch = lines[index]?.match(/^\d+\.\s+(.+)$/)
    const urlLine = lines[index + 1]?.trim()
    if (!titleMatch || !urlLine || !/^https?:\/\//i.test(urlLine)) continue
    const snippetLines: string[] = []
    for (let cursor = index + 2; cursor < lines.length; cursor += 1) {
      const line = lines[cursor]?.trim()
      if (!line || /^\d+\.\s+/.test(line)) break
      snippetLines.push(line)
    }
    hits.push({ title: titleMatch[1].trim(), url: urlLine, snippet: snippetLines.join(' ') })
  }
  return hits
}

function parseFetchResult(content: string) {
  const lines = content.split(/\r?\n/)
  const meta = { fetchedFrom: '', mode: '', status: '', size: '', time: '', content: content.trim() }
  let resultIndex = -1
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (/^Result:\s*$/i.test(line)) {
      resultIndex = index
      break
    }
    const match = line.match(/^([A-Za-z ]+):\s*(.*)$/)
    if (!match) continue
    const key = match[1].toLowerCase()
    const value = match[2].trim()
    if (key === 'fetched from') meta.fetchedFrom = value
    if (key === 'mode') meta.mode = value
    if (key === 'status') meta.status = value
    if (key === 'time') meta.time = value
    if (key === 'size') meta.size = value
  }
  if (resultIndex >= 0) meta.content = lines.slice(resultIndex + 1).join('\n').trim()
  meta.content = meta.content.replace(/^Processed preapproved content for prompt:\s*.*?\n+/is, '').trim()
  return meta
}

function metadataText(tool: ToolUseBlock, key: string) {
  const value = tool._result?.metadata?.[key]
  return value == null ? '' : String(value)
}
