import { Section, CodeBox } from '../common'
import type { ToolViewProps } from '../types'

const CSS = `
.tb-browser-target {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-text);
  overflow: hidden;
}

.tb-browser-target-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
}

.tb-browser-target-page {
  flex-shrink: 0;
  font-size: 9.5px;
  font-family: monospace;
  color: var(--color-text-muted);
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--color-border-subtle);
  border-radius: 3px;
  padding: 1px 4px;
}

.tb-img-wrap {
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--color-border-subtle);
  background: rgba(0,0,0,0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  max-height: 480px;
}

.tb-img-wrap img {
  width: 100%;
  height: auto;
  max-height: 480px;
  object-fit: contain;
  display: block;
}
`

type ScreenshotResult = {
  page?: { id?: string; url?: string }
  mime_type?: string
  data_base64?: string
  bytes?: number
  full_page?: boolean
  persisted_path?: string
}

function parseScreenshotResult(content: string): ScreenshotResult | null {
  try {
    return JSON.parse(content) as ScreenshotResult
  } catch {
    return null
  }
}

// Best-effort "what is this action about" summary shown in the header row —
// browser_* tools each take a different primary argument (a URL, a snapshot
// element_id, a key, a scroll direction, ...), so there's no single field
// name that covers them all.
function browserTarget(tool: ToolViewProps['tool']): string | null {
  const input = tool.input
  const url = typeof input.url === 'string' ? input.url : ''
  if (url) return url
  const elementId = typeof input.element_id === 'string' ? input.element_id : ''
  const text = typeof input.text === 'string' ? input.text : ''
  if (elementId && text) return `${elementId} ← "${text}"`
  if (elementId) return elementId
  const key = typeof input.key === 'string' ? input.key : ''
  if (key) return `key: ${key}`
  const direction = typeof input.direction === 'string' ? input.direction : ''
  if (direction) return `scroll ${direction}`
  const query = typeof input.query === 'string' ? input.query : ''
  if (query) return query
  return null
}

export function BrowserToolView({ tool, result }: ToolViewProps) {
  const target = browserTarget(tool)
  const pageId = typeof tool.input.page_id === 'string' ? tool.input.page_id : ''

  if (!result || result.isError) {
    return (
      <>
        <style>{CSS}</style>
        {(target || pageId) && (
          <div className="tb-browser-target">
            {target && <span className="tb-browser-target-url">{target}</span>}
            {pageId && <span className="tb-browser-target-page">{pageId}</span>}
          </div>
        )}
        {result?.isError && result.content && (
          <Section label="Error"><pre className="tb-pre tb-pre--error">{result.content}</pre></Section>
        )}
      </>
    )
  }

  if (tool.name === 'browser_screenshot') {
    const parsed = parseScreenshotResult(result.content)
    const src = parsed?.data_base64
      ? `data:${parsed.mime_type ?? 'image/png'};base64,${parsed.data_base64}`
      : null
    return (
      <>
        <style>{CSS}</style>
        <div className="tb-browser-target">
          {parsed?.page?.url && <span className="tb-browser-target-url">{parsed.page.url}</span>}
          {parsed?.page?.id && <span className="tb-browser-target-page">{parsed.page.id}</span>}
        </div>
        {src ? (
          <Section label={parsed?.full_page ? 'Full page' : 'Viewport'}>
            <div className="tb-img-wrap">
              <img src={src} alt={parsed?.page?.url ?? 'Browser screenshot'} loading="lazy" />
            </div>
          </Section>
        ) : (
          <Section label="Result"><CodeBox content={result.content} /></Section>
        )}
      </>
    )
  }

  return (
    <>
      <style>{CSS}</style>
      {(target || pageId) && (
        <div className="tb-browser-target">
          {target && <span className="tb-browser-target-url">{target}</span>}
          {pageId && <span className="tb-browser-target-page">{pageId}</span>}
        </div>
      )}
      {result.content && (
        <Section label="Result">
          <CodeBox content={result.content} copyable />
        </Section>
      )}
    </>
  )
}
