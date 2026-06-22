import { Section } from '../common'
import { fmtDuration, parseWebSearchHits } from '../helpers'
import type { ToolViewProps } from '../types'

export function WebSearchToolView({ tool, result }: ToolViewProps) {
  const query = typeof tool.input.query === 'string' ? tool.input.query : ''
  const hits = parseWebSearchHits(result?.content)

  return (
    <>
      {query && (
        <Section label="Query">
          <div className="tb-inline-copy">{query}</div>
        </Section>
      )}

      <Section label="Sources">
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
              >
                <span className="tb-link-index">{index + 1}.</span>
                <span className="tb-link-copy">
                  <span className="tb-link-title">{hit.title || hit.url}</span>
                  <span className="tb-link-url">{hit.url}</span>
                </span>
              </a>
            ))}
          </div>
        ) : (
          <div className="tb-ask-note">No sources found in the search result.</div>
        )}
      </Section>

      {result?.metadata && (
        <div className="tb-footer">
          <span>Provider: {String(result.metadata.provider ?? '?')}</span>
          {result.durationMs != null && <span>Duration: {fmtDuration(result.durationMs)}</span>}
        </div>
      )}
    </>
  )
}
