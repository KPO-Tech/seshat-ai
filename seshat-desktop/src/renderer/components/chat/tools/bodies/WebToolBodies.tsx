import { useState } from 'react'
import type { ToolUseBlock } from '../../lib/chatTypes'
import { openInAppBrowser, shouldOpenInAppBrowser } from '@renderer/lib/openInAppBrowser'
import { CodePanel, formatDuration, hostFromUrl } from '../ToolDetails'

export function WebSearchBody({ tool, sessionId }: { tool: ToolUseBlock; sessionId?: string }) {
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
            <a
              key={`${hit.url}-${index}`}
              href={hit.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 border-b border-[var(--border-soft)] px-3 py-2 last:border-b-0 hover:bg-[var(--surface-panel)]"
              onClick={(event) => {
                if (!shouldOpenInAppBrowser(event, hit.url)) return
                event.preventDefault()
                openInAppBrowser(hit.url, sessionId)
              }}
            >
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

export function WebFetchBody({ tool, sessionId }: { tool: ToolUseBlock; sessionId?: string }) {
  const url = typeof tool.input.url === 'string' ? tool.input.url : ''
  const parsed = parseFetchResult(tool._result?.content ?? '')
  const source = parsed.fetchedFrom || url
  const stat = [parsed.status, parsed.mode, parsed.size, parsed.time || formatDuration(tool._result)].filter(Boolean).join(' | ')

  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] px-3 py-2">
        {source ? (
          <a
            href={source}
            target="_blank"
            rel="noreferrer"
            className="truncate text-[12px] font-semibold text-[var(--text-primary)] hover:text-[var(--accent-primary)]"
            onClick={(event) => {
              if (!shouldOpenInAppBrowser(event, source)) return
              event.preventDefault()
              openInAppBrowser(source, sessionId)
            }}
          >
            {source}
          </a>
        ) : <span className="text-[12px] font-semibold">Web Fetch</span>}
        {stat && <span className="shrink-0 text-[10.5px] text-[var(--text-muted)]">{stat}</span>}
      </div>
      {tool._result?.is_error || tool._result?.isError ? <CodePanel title="Error" value={tool._result.content} /> : <CodePanel title="Extraction" value={parsed.content} />}
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
