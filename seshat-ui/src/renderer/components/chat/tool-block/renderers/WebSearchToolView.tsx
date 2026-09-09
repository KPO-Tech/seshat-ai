import { useState } from 'react'
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
  const [showAll, setShowAll] = useState(false)
  const visibleHits = showAll ? hits : hits.slice(0, 5)
  const selectedCount = showAll ? hits.length : Math.min(hits.length || resultCount || 0, 5)

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
          <span>{selectedCount || 'No'} selected result{selectedCount === 1 ? '' : 's'}</span>
          {stat && <span className="tb-hcard-header-stat">{stat}</span>}
        </>
      }
    >
      {hits.length > 0 ? (
        <>
          <div className="tb-links">
            {visibleHits.map((hit, index) => {
              const domain = domainLabel(hit.url)
              return (
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
                  <Favicon domain={domain} fallback={sourceInitial(hit.title || domain)} />
                  <span className="tb-link-copy">
                    <span className="tb-link-title">{hit.title || hit.url}</span>
                  </span>
                  <span className="tb-link-domain">{domain}</span>
                </a>
              )
            })}
          </div>
          {hits.length > 5 && (
            <button
              type="button"
              className="tb-links-more"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? 'Show fewer sources' : `View all sources (${hits.length})`}
            </button>
          )}
        </>
      ) : (
        <Section label="Sources">
          <div className="tb-ask-note">No sources found in the search result.</div>
        </Section>
      )}
    </HeaderCard>
  )
}

function Favicon({ domain, fallback }: { domain: string; fallback: string }) {
  const [failed, setFailed] = useState(false)
  if (!domain || failed) {
    return <span className="tb-link-favicon tb-link-favicon--fallback">{fallback}</span>
  }
  return (
    <span className="tb-link-favicon" aria-hidden="true">
      <img
        src={`https://icons.duckduckgo.com/ip3/${domain}.ico`}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

function domainLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function sourceInitial(value: string): string {
  const first = value.trim().charAt(0)
  return first ? first.toUpperCase() : 'S'
}
