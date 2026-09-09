import type { FormEvent, MutableRefObject } from 'react'
import { Book, Caution, CloseOne, FileText, Home, LoadingOne, Message as MessageIcon, Search } from '@icon-park/react'
import type { TaggedSearchResult } from '../api/types'
import type { AnswerPart } from '../lib/citations'

export function SearchWorkspace({
  query,
  submittedQuery,
  rawResults,
  rawLoading,
  rawError,
  isStreaming,
  sessionError,
  pendingPrompt,
  assistantText,
  answerParts,
  highlightedIndex,
  resultRefs,
  sessionId,
  onQueryChange,
  onReset,
  onSubmit,
  onScrollToResult,
  onContinue,
}: {
  query: string
  submittedQuery: string
  rawResults: TaggedSearchResult[]
  rawLoading: boolean
  rawError: string | null
  isStreaming: boolean
  sessionError: string | null
  pendingPrompt: string | null
  assistantText: string
  answerParts: AnswerPart[]
  highlightedIndex: number | null
  resultRefs: MutableRefObject<Array<HTMLElement | null>>
  sessionId: string | null
  onQueryChange: (value: string) => void
  onReset: () => void
  onSubmit: (e: FormEvent) => void
  onScrollToResult: (n: number) => void
  onContinue: () => void
}) {
  const hasSearch = Boolean(submittedQuery)

  return (
    <div className={`k-search-page ${hasSearch ? 'has-results' : ''}`}>
      <section className="k-search-stage">
        {!hasSearch && (
          <div className="k-search-brand">
            <Book size={34} />
            <h2>Seshat Knowledge</h2>
          </div>
        )}
        <form className="k-page-searchbar" onSubmit={onSubmit}>
          {hasSearch && (
            <button type="button" className="k-search-home" onClick={onReset} aria-label="Reset knowledge search">
              <Home size={15} />
            </button>
          )}
          <Search size={18} />
          <input
            type="text"
            placeholder="Search your indexed knowledge"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            autoFocus
          />
          {query && (
            <button type="button" className="k-clear-query" onClick={() => onQueryChange('')} aria-label="Clear search">
              <CloseOne size={13} />
            </button>
          )}
          <button type="submit" className="k-search-submit" disabled={!query.trim() || rawLoading || isStreaming}>
            <Search size={15} />
          </button>
        </form>
      </section>

      {hasSearch && (
        <section className="k-search-results-page">
          <main className="k-search-main">
            <div className="k-search-tabs">
              <button type="button" className="active">All</button>
              <button type="button" disabled>Documents</button>
              <button type="button" disabled>Collections</button>
            </div>

            <article className="k-ai-overview">
              <div className="k-ai-label">
                <Book size={15} />
                <span>Knowledge overview</span>
                {isStreaming && <LoadingOne size={13} className="spin" />}
              </div>
              {sessionError && <div className="k-inline-error"><Caution size={13} />{sessionError}</div>}
              {!sessionError && !assistantText && (isStreaming || pendingPrompt) && (
                <div className="k-inline-empty"><LoadingOne size={13} className="spin" /> Searching knowledge</div>
              )}
              {answerParts.length > 0 ? (
                <div className="k-ai-answer">
                  {answerParts.map((part, i) =>
                    part.type === 'citation' ? (
                      <button
                        key={i}
                        type="button"
                        className="k-citation-chip"
                        onClick={() => onScrollToResult(part.n)}
                        disabled={part.n - 1 >= rawResults.length}
                      >
                        [{part.n}]
                      </button>
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )}
                </div>
              ) : !rawLoading && !sessionError ? (
                <p className="k-ai-placeholder">Ask from indexed documents and Seshat will cite the matching chunks.</p>
              ) : null}
              {(assistantText || sessionId) && (
                <button type="button" className="k-continue-chat" onClick={onContinue}>
                  <MessageIcon size={13} />
                  Continue in chat
                </button>
              )}
            </article>

            <div className="k-result-count">
              {rawLoading ? 'Searching...' : `${rawResults.length} matching chunks for "${submittedQuery}"`}
            </div>
            {rawError && <div className="k-inline-error"><Caution size={13} />{rawError}</div>}
            {!rawLoading && !rawError && rawResults.length === 0 && (
              <div className="k-inline-empty">No results found for "{submittedQuery}".</div>
            )}
            <div className="k-search-result-list">
              {rawResults.map((r, i) => (
                <article
                  key={`${r.corpus_id}-${r.key}-${i}`}
                  ref={(el) => { resultRefs.current[i] = el }}
                  className={`k-search-result ${highlightedIndex === i ? 'highlighted' : ''}`}
                >
                  <div className="k-search-source">
                    <FileText size={15} />
                    <span>{r.metadata?.filename ?? r.corpus_name}</span>
                    <small>{r.corpus_name}</small>
                  </div>
                  <h3>{r.metadata?.filename ?? r.corpus_name}</h3>
                  <p>{r.text}</p>
                  <div className="k-search-meta">
                    <span>[{i + 1}]</span>
                    <span>score {r.score.toFixed(3)}</span>
                  </div>
                </article>
              ))}
            </div>
          </main>

          <aside className="k-search-side">
            <div className="k-side-card">
              <h3>Search scope</h3>
              <strong>Included knowledge</strong>
              <span>Personal and organization collections available to this account.</span>
            </div>
          </aside>
        </section>
      )}
    </div>
  )
}
