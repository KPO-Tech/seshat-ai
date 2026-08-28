import { HeaderCard, Section, CodeBox } from '../common'
import { fmtDuration, parseWebSearchHits } from '../helpers'
import type { ToolViewProps } from '../types'
import { openInAppBrowser, shouldOpenInAppBrowser } from '@/lib/openInAppBrowser'

export function WebSearchToolView({ tool, result, sessionId }: ToolViewProps) {
  const query = typeof tool.input.query === 'string' ? tool.input.query : ''
  const hits = parseWebSearchHits(result?.content)
  const provider = result?.metadata?.provider != null ? String(result.metadata.provider) : ''
  const mode = result?.metadata?.mode != null ? String(result.metadata.mode) : ''
  const resultCount = result?.metadata?.result_count != null ? Number(result.metadata.result_count) : hits.length
  const duration = result?.durationMs != null ? fmtDuration(result.durationMs) : ''
  const countLabel = Number.isFinite(resultCount) && resultCount > 0
    ? `${resultCount} result${resultCount === 1 ? '' : 's'}`
    : ''
  const stat = [provider, mode, countLabel, duration].filter(Boolean).join(' · ')

  if (result?.isError) {
    return (
      <HeaderCard header={<span>{query || 'Web Search'}</span>}>
        {result.content && <CodeBox content={result.content} variant="error" bare />}
      </HeaderCard>
    )
  }

  return (
    <HeaderCard
      header={
        <>
          <span title={query}>{query || 'Web Search'}</span>
          {stat && <span className="tb-hcard-header-stat">{stat}</span>}
        </>
      }
    >
      {hits.length > 0 ? (
        <div className="tb-links">
          {hits.map((hit, index) => (
            <a
              key={`${hit.url}-${index}`}
              className="tb-link-item"
              href={hit.url}
              target="_blank"
              rel="noreferrer"
              title={hit.url}
              onClick={(event) => {
                if (!shouldOpenInAppBrowser(event, hit.url)) return
                event.preventDefault()
                openInAppBrowser(hit.url, sessionId)
              }}
            >
              <span className="tb-link-index">{index + 1}.</span>
              <span className="tb-link-copy">
                <span className="tb-link-title">{hit.title || hit.url}</span>
                <span className="tb-link-url">{hit.url}</span>
                {hit.snippet && <span className="tb-link-snippet">{hit.snippet}</span>}
              </span>
            </a>
          ))}
        </div>
      ) : (
        <Section label="Sources">
          <div className="tb-ask-note">No sources found in the search result.</div>
        </Section>
      )}
    </HeaderCard>
  )
}
