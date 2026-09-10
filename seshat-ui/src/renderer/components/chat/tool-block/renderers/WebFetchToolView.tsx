import { HeaderCard, CodeBox } from '../common'
import type { ToolViewProps } from '../types'
import { openInAppBrowser, shouldOpenInAppBrowser } from '@/lib/openInAppBrowser'

export function WebFetchToolView({ tool, result, sessionId }: ToolViewProps) {
  const url = (tool.input.url as string) ?? ''
  const prompt = (tool.input.prompt as string) ?? ''
  let hostname = url
  try {
    if (url) hostname = new URL(url).hostname
  } catch {
    // not a valid absolute URL - fall back to showing it verbatim
  }

  const parsed = parseFetchResult(result?.content ?? '')
  const status = parsed.status || (result?.isError ? 'Error' : '')
  const size = formatBytes(parsed.sizeBytes)
  const duration = parsed.time || (result?.durationMs != null ? `${result.durationMs}ms` : '')
  const mode = parsed.mode
  const stat = [status, mode, size, duration].filter(Boolean).join(' · ')
  const sourceUrl = parsed.fetchedFrom || url
  const payload = JSON.stringify({
    prompt,
    extraction: parsed.content,
  }, null, 2)

  if (result?.isError) {
    return (
      <HeaderCard
        header={
          <>
            <span title={url}>{hostname || 'Web Fetch'}</span>
            {stat && <span className="tb-hcard-header-stat">{stat}</span>}
          </>
        }
      >
        {result.content && <CodeBox content={result.content} variant="error" bare />}
      </HeaderCard>
    )
  }

  return (
    <HeaderCard
      header={
        <>
          {sourceUrl ? (
            <a
              className="tb-hcard-header-link"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              title={sourceUrl}
              onClick={(event) => {
                if (!shouldOpenInAppBrowser(event, sourceUrl)) return
                event.preventDefault()
                openInAppBrowser(sourceUrl, sessionId)
              }}
            >
              {sourceUrl}
            </a>
          ) : (
            <span>Web Fetch</span>
          )}
          {stat && <span className="tb-hcard-header-stat">{stat}</span>}
        </>
      }
    >
      <div className="tb-fetch-card">
        {payload && <CodeBox content={payload} language="json" bare />}
      </div>
    </HeaderCard>
  )
}

function parseFetchResult(content: string) {
  const lines = content.split(/\r?\n/)
  const meta = {
    fetchedFrom: '',
    mode: '',
    status: '',
    sizeBytes: undefined as number | undefined,
    time: '',
    content: content.trim(),
  }

  let resultIndex = -1
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (/^Result:\s*$/i.test(line)) {
      resultIndex = i
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
    if (key === 'size') {
      const parsed = Number.parseInt(value, 10)
      if (Number.isFinite(parsed)) meta.sizeBytes = parsed
    }
  }

  if (resultIndex >= 0) {
    meta.content = lines.slice(resultIndex + 1).join('\n').trim()
  }
  meta.content = meta.content.replace(/^Processed preapproved content for prompt:\s*.*?\n+/is, '').trim()
  return meta
}

function formatBytes(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
