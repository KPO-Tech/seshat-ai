import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Book, LoadingOne, Message, Search, FileText, Caution, RightC, Left } from '@icon-park/react'
import { api, ApiError } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { useChat } from '@/hooks/useChat'

type TaggedSearchResult = {
  key: string
  text: string
  score: number
  metadata?: Record<string, string>
  corpus_id: string
  corpus_name: string
}

type KnowledgeSearchResponse = {
  results: TaggedSearchResult[]
  corpora_searched: number
}

// Wrapped so the agent reliably reaches for knowledge_search instead of
// answering from its own memory - this is a dedicated search surface, not a
// general chat, so the whole point is an answer grounded in retrieved
// documents. Displayed verbatim as the "user" turn if this session is later
// opened in the normal chat view, which reads fine on its own.
function buildAgentInstruction(query: string): string {
  return `${query}\n\n(Use the knowledge_search tool to search the knowledge base and answer using only what it returns. Cite sources inline with bracketed numbers like [1], [2] matching the tool's numbered results.)`
}

export function KnowledgePage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [rawResults, setRawResults] = useState<TaggedSearchResult[]>([])
  const [rawLoading, setRawLoading] = useState(false)
  const [rawError, setRawError] = useState<string | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)
  const resultRefs = useRef<Array<HTMLDivElement | null>>([])
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runRawSearch = useCallback(async (q: string) => {
    setRawLoading(true)
    setRawError(null)
    try {
      const res = await api.post<KnowledgeSearchResponse>('/knowledge/search', { query: q, top_k: 8 })
      setRawResults(res.results ?? [])
    } catch (err) {
      setRawError(err instanceof ApiError ? err.message : 'Unable to search the knowledge base.')
      setRawResults([])
    } finally {
      setRawLoading(false)
    }
  }, [])

  async function ensureSession(): Promise<string | null> {
    if (sessionId) return sessionId
    try {
      const created = await api.post<{ session_id: string; title?: string; created_at?: number }>('/sessions', {
        source: 'knowledge',
      })
      useSessionStore.getState().upsertSession({
        id: created.session_id,
        title: created.title ?? 'Untitled conversation',
        messages: [],
        createdAt: new Date((created.created_at ?? 0) * 1000 || Date.now()).toISOString(),
        source: 'knowledge',
      })
      setSessionId(created.session_id)
      return created.session_id
    } catch (err) {
      setSessionError(err instanceof ApiError ? err.message : 'Unable to start the assistant.')
      return null
    }
  }

  // sendMessage's closure is bound to sessionId via useChat's own useCallback
  // dependency - it only reflects the *current* session once this component
  // re-renders with the new id, so the very first search (which creates the
  // session) can't call it in the same tick. Queueing the prompt here and
  // firing it from an effect once sessionId is actually set sidesteps that
  // stale-closure race without duplicating useChat's send logic.
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const { sendMessage, isStreaming } = useChat(sessionId ?? '')

  useEffect(() => {
    if (sessionId && pendingPrompt) {
      const prompt = pendingPrompt
      setPendingPrompt(null)
      void sendMessage(prompt)
    }
  }, [sessionId, pendingPrompt, sendMessage])

  async function runSearch(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    setSubmittedQuery(trimmed)
    void runRawSearch(trimmed)

    const instruction = buildAgentInstruction(trimmed)
    const existing = sessionId
    if (existing) {
      void sendMessage(instruction)
      return
    }
    const created = await ensureSession()
    if (created) setPendingPrompt(instruction)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void runSearch(query)
  }

  const session = useSessionStore((s) => (sessionId ? s.sessions.find((x) => x.id === sessionId) : undefined))
  const assistantText = useMemo(() => {
    if (!session) return ''
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const message = session.messages[i]
      if (message.role !== 'assistant') continue
      return message.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text)
        .join('\n\n')
    }
    return ''
  }, [session])

  function scrollToResult(n: number) {
    const index = n - 1
    const el = resultRefs.current[index]
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightedIndex(index)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightedIndex(null), 1600)
  }

  const answerParts = useMemo(() => splitCitations(assistantText), [assistantText])

  return (
    <div className="k-root">
      <style>{KNOWLEDGE_CSS}</style>

      <main className="k-content">
        <section className="k-toolbar">
          <div className="k-toolbar-heading">
            <button type="button" className="k-back-chip" onClick={() => navigate(-1)}>
              <Left size={11} /> Home
            </button>
            <h1>Knowledge</h1>
          </div>
          <form className="k-searchbar" onSubmit={handleSubmit}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search your knowledge base…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <button type="submit" disabled={!query.trim()}>Search</button>
          </form>
        </section>

        {!submittedQuery ? (
          <div className="k-empty">
            <Book size={40} />
            <p>Search across every corpus you have access to. Results and a cited answer will show up side by side.</p>
          </div>
        ) : (
          <section className="k-layout">
            <div className="k-results">
              <div className="k-pane-header">
                <span>Results</span>
                {rawLoading && <LoadingOne size={13} className="spin" />}
              </div>
              {rawError && (
                <div className="k-inline-error"><Caution size={13} />{rawError}</div>
              )}
              {!rawLoading && !rawError && rawResults.length === 0 && (
                <div className="k-inline-empty">No results found for "{submittedQuery}".</div>
              )}
              <div className="k-results-list">
                {rawResults.map((r, i) => (
                  <div
                    key={`${r.corpus_id}-${r.key}-${i}`}
                    ref={(el) => { resultRefs.current[i] = el }}
                    className={`k-result ${highlightedIndex === i ? 'highlighted' : ''}`}
                  >
                    <div className="k-result-meta">
                      <span className="k-result-index">[{i + 1}]</span>
                      <span className="k-result-corpus"><Book size={11} />{r.corpus_name}</span>
                      {r.metadata?.filename && (
                        <span className="k-result-file"><FileText size={11} />{r.metadata.filename}</span>
                      )}
                      <span className="k-result-score">{r.score.toFixed(3)}</span>
                    </div>
                    <p className="k-result-text">{r.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <aside className="k-answer">
              <div className="k-pane-header">
                <span>Answer</span>
                {isStreaming && <LoadingOne size={13} className="spin" />}
              </div>
              {sessionError && (
                <div className="k-inline-error"><Caution size={13} />{sessionError}</div>
              )}
              {!sessionError && !assistantText && (isStreaming || pendingPrompt) && (
                <div className="k-inline-empty">
                  <LoadingOne size={13} className="spin" /> Searching the knowledge base…
                </div>
              )}
              {answerParts.length > 0 && (
                <div className="k-answer-text">
                  {answerParts.map((part, i) =>
                    part.type === 'citation' ? (
                      <button
                        key={i}
                        type="button"
                        className="k-citation-chip"
                        onClick={() => scrollToResult(part.n)}
                        disabled={part.n - 1 >= rawResults.length}
                      >
                        [{part.n}]
                      </button>
                    ) : (
                      <span key={i}>{part.text}</span>
                    ),
                  )}
                </div>
              )}
              {sessionId && (assistantText || !isStreaming) && (
                <button
                  type="button"
                  className="k-continue-link"
                  onClick={() => navigate(`/conversation/${sessionId}`)}
                >
                  <Message size={13} /> Continue in chat <RightC size={13} />
                </button>
              )}
            </aside>
          </section>
        )}
      </main>
    </div>
  )
}

type AnswerPart = { type: 'text'; text: string } | { type: 'citation'; n: number }

function splitCitations(text: string): AnswerPart[] {
  if (!text) return []
  const parts: AnswerPart[] = []
  const re = /\[(\d+)\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    parts.push({ type: 'citation', n: Number(match[1]) })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push({ type: 'text', text: text.slice(lastIndex) })
  return parts
}

const KNOWLEDGE_CSS = `
.k-root {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--color-surface);
  color: var(--color-text);
  overflow: hidden;
}

.k-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.k-toolbar {
  min-height: 74px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 28px;
  border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
}

.k-toolbar h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.15;
  font-weight: 800;
  flex-shrink: 0;
}

.k-toolbar-heading {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.k-back-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 7px; border-radius: 5px; border: none;
  background: var(--color-hover); color: var(--color-text-secondary);
  font-size: 10px; font-weight: 600; cursor: pointer;
  transition: background 0.1s, color 0.1s; white-space: nowrap;
}
.k-back-chip:hover { background: var(--color-border); color: var(--color-text); }

.k-searchbar {
  flex: 1;
  min-width: 0;
  max-width: 640px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg);
  color: var(--color-text-muted);
}

.k-searchbar input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  font-size: 13px;
  outline: none;
}

.k-searchbar button {
  flex-shrink: 0;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 7px;
  background: var(--color-cta);
  color: white;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.k-searchbar button:disabled {
  opacity: 0.45;
  cursor: default;
}

.k-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--color-text-muted);
  padding: 40px;
  text-align: center;
}

.k-empty p {
  max-width: 420px;
  font-size: 13px;
  line-height: 1.6;
  margin: 0;
}

.k-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 14px;
  overflow: hidden;
  padding: 20px 24px;
}

.k-results,
.k-answer {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg);
  overflow: hidden;
}

.k-pane-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border-subtle);
  font-size: 11px;
  font-weight: 850;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.k-results-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.k-result {
  border: 1px solid var(--color-border-subtle);
  border-radius: 7px;
  padding: 10px 12px;
  transition: background 0.3s ease, border-color 0.3s ease;
}

.k-result.highlighted {
  background: rgba(239, 124, 47, 0.1);
  border-color: rgba(239, 124, 47, 0.4);
}

.k-result-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.k-result-index {
  font-weight: 850;
  color: var(--color-text-secondary);
}

.k-result-corpus,
.k-result-file {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.k-result-score {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.k-result-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
}

.k-answer-text {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.k-citation-chip {
  display: inline-flex;
  align-items: center;
  border: 0;
  border-radius: 5px;
  padding: 0 5px;
  margin: 0 1px;
  background: rgba(239, 124, 47, 0.16);
  color: var(--color-cta);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
  vertical-align: baseline;
}

.k-citation-chip:disabled {
  opacity: 0.5;
  cursor: default;
}

.k-inline-error,
.k-inline-empty {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px 16px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.k-inline-error {
  color: var(--color-danger, #ef4444);
}

.k-continue-link {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  border: 0;
  border-top: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.k-continue-link:hover {
  color: var(--color-text);
  background: var(--color-hover);
}

@media (max-width: 1000px) {
  .k-layout {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
  .k-results,
  .k-answer {
    min-height: 320px;
  }
}
`
