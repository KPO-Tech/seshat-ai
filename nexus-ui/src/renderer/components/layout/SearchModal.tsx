import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Close, Sync } from '@icon-park/react'
import { api } from '@/api/client'
import type { SessionSearchResult } from '@/api/types'
import type { ChatSession } from '@/stores/session'
import { UNTITLED_SESSION_TITLE } from '@/lib/sessionTitle'

function relativeDate(value: string | number | undefined): string {
  if (!value) return ''
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
  const diff = Date.now() - date.getTime()
  const mins = diff / 60_000
  if (mins < 2) return 'just now'
  if (mins < 60) return `${Math.floor(mins)}m ago`
  const hours = mins / 60
  if (hours < 24) return `${Math.floor(hours)}h ago`
  const days = hours / 24
  if (days < 2) return 'yesterday'
  if (days < 7) return `${Math.floor(days)}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function lastUserText(session: ChatSession): string {
  const userMessages = session.messages.filter((m) => m.role === 'user')
  const last = userMessages[userMessages.length - 1]
  if (!last) return ''
  for (const block of last.content) {
    if (block.type === 'text' && block.text.trim()) return block.text.trim()
  }
  return ''
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="srch-mark">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

type SearchRow = {
  id: string
  title: string
  preview: string
  createdAt?: string | number
  updatedAt?: string | number
}

type Props = {
  open: boolean
  sessions: ChatSession[]
  onClose: () => void
  onSelect: (id: string) => void
}

export function SearchModal({ open, sessions, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(0)
  const [remoteResults, setRemoteResults] = useState<SearchRow[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const recentResults: SearchRow[] = [...sessions]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 10)
    .map((session) => ({
      id: session.id,
      title: session.title || UNTITLED_SESSION_TITLE,
      preview: lastUserText(session),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }))

  const results = query.trim() ? remoteResults : recentResults

  useEffect(() => {
    if (open) {
      setQuery('')
      setFocused(0)
      setRemoteResults([])
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  useEffect(() => { setFocused(0) }, [query])

  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (!trimmed) {
      setRemoteResults([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    const timeout = window.setTimeout(() => {
      api.get<{ results: SessionSearchResult[] }>(`/sessions/search?q=${encodeURIComponent(trimmed)}`)
        .then((data) => {
          if (cancelled) return
          setRemoteResults((data.results ?? []).map((result) => ({
            id: result.session_id,
            title: result.title || UNTITLED_SESSION_TITLE,
            preview: result.preview ?? '',
            createdAt: result.created_at,
            updatedAt: result.updated_at,
          })))
        })
        .catch(() => {
          if (!cancelled) setRemoteResults([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 120)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [open, query])

  const select = useCallback((id: string) => {
    onSelect(id)
    onClose()
  }, [onSelect, onClose])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocused((f) => Math.min(f + 1, Math.max(results.length - 1, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocused((f) => Math.max(f - 1, 0))
      } else if (e.key === 'Enter') {
        const s = results[focused]
        if (s) select(s.id)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, results, focused, select, onClose])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${focused}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [focused])

  if (!open) return null

  return (
    <div className="srch-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <style>{SEARCH_CSS}</style>
      <div className="srch-shell" role="dialog" aria-modal="true" aria-label="Search conversations">
        <div className="srch-input-row">
          <Search size={18} className="srch-input-icon" />
          <input
            ref={inputRef}
            className="srch-input"
            placeholder="Search conversations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {loading ? <Sync size={14} className="spin srch-loading-icon" /> : null}
          <button className="srch-esc-btn" onClick={onClose} tabIndex={-1}>
            <Close size={14} />
          </button>
        </div>

        <div className="srch-results" ref={listRef}>
          {results.length === 0 ? (
            <div className="srch-empty">{loading ? 'Searching…' : 'No conversations found'}</div>
          ) : results.map((result, idx) => {
            const date = relativeDate(result.updatedAt || result.createdAt)
            return (
              <button
                key={result.id}
                data-idx={idx}
                className={`srch-item ${idx === focused ? 'focused' : ''}`}
                onMouseEnter={() => setFocused(idx)}
                onMouseDown={(e) => { e.preventDefault(); select(result.id) }}
              >
                <div className="srch-item-body">
                  <span className="srch-item-title">{highlight(result.title, query)}</span>
                  {result.preview && (
                    <span className="srch-item-preview">{highlight(result.preview.slice(0, 140), query)}</span>
                  )}
                </div>
                <span className="srch-item-date">{date}</span>
              </button>
            )
          })}
        </div>

        <div className="srch-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}

const SEARCH_CSS = `
.srch-backdrop {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0,0,0,0.45); backdrop-filter: blur(3px);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
}

.srch-shell {
  width: 100%; max-width: 560px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.32);
  overflow: hidden;
  animation: srch-in 0.15s ease-out;
  display: flex; flex-direction: column;
  max-height: 70vh;
}

@keyframes srch-in {
  from { opacity: 0; transform: translateY(-8px) scale(0.98); }
  to   { opacity: 1; transform: none; }
}

.srch-input-row {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}

.srch-input-icon { color: var(--color-text-muted); flex-shrink: 0; }
.srch-loading-icon { color: var(--color-text-muted); }

.srch-input {
  flex: 1; background: none; border: none; outline: none;
  font-size: 16px; font-weight: 500; color: var(--color-text);
  font-family: var(--font-sans);
}

.srch-input::placeholder { color: var(--color-text-muted); }

.srch-esc-btn {
  background: var(--color-surface); border: 1px solid var(--color-border);
  color: var(--color-text-muted); border-radius: 6px;
  padding: 4px 8px; cursor: pointer; flex-shrink: 0;
  display: flex; align-items: center;
}
.srch-esc-btn:hover { background: var(--color-hover); }

.srch-results {
  overflow-y: auto; flex: 1;
  padding: 6px;
  display: flex; flex-direction: column; gap: 1px;
}

.srch-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 10px 12px; border-radius: 10px;
  border: none; background: transparent; text-align: left;
  cursor: pointer; width: 100%; transition: background 0.08s;
}

.srch-item:hover, .srch-item.focused {
  background: var(--color-surface);
}

.srch-item.focused {
  outline: 1.5px solid var(--color-primary);
  outline-offset: -1px;
}

.srch-item-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }

.srch-item-title {
  font-size: 14px; font-weight: 600; color: var(--color-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.srch-item-preview {
  font-size: 12px; color: var(--color-text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.srch-item-date {
  font-size: 11px; color: var(--color-text-muted);
  white-space: nowrap; flex-shrink: 0;
}

.srch-empty {
  display: flex; align-items: center; justify-content: center;
  min-height: 160px; color: var(--color-text-muted); font-size: 13px;
}

.srch-mark {
  background: rgba(239, 124, 47, 0.18);
  color: inherit;
  padding: 0 2px;
  border-radius: 4px;
}

.srch-footer {
  display: flex; align-items: center; gap: 16px; justify-content: flex-end;
  padding: 12px 16px; border-top: 1px solid var(--color-border-subtle);
  color: var(--color-text-muted); font-size: 12px;
}

.srch-footer kbd {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 2px 6px;
  font-family: var(--font-mono, monospace);
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`
