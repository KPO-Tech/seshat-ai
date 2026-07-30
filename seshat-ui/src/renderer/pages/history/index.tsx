import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Left, Search, Edit, Delete, History as HistoryIcon } from '@icon-park/react'
import { useSessionStore } from '@/stores/session'
import { api } from '@/api/client'
import { UNTITLED_SESSION_TITLE } from '@/lib/sessionTitle'
import { deleteSession } from '@/lib/deleteSession'

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

// Full chat history management - the sidebar's "Recents" list is capped to
// 12 and has no bulk actions, just per-item rename/delete. This is the
// dedicated page for everything else: every session ever created, a search
// filter, and a "Delete all" that the sidebar deliberately doesn't offer
// (too destructive for a spot a stray click could reach).
export function HistoryPage() {
  const navigate = useNavigate()
  const sessions = useSessionStore((s) => s.sessions)
  const activeId = useSessionStore((s) => s.activeId)
  const setActive = useSessionStore((s) => s.setActive)
  const updateSession = useSessionStore((s) => s.updateSession)

  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt).getTime()
      const bTime = new Date(b.updatedAt || b.createdAt).getTime()
      return bTime - aTime
    }),
    [sessions],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((s) => (s.title || UNTITLED_SESSION_TITLE).toLowerCase().includes(q))
  }, [sorted, query])

  function openSession(id: string) {
    setActive(id)
    navigate(`/conversation/${id}`)
  }

  function startRename(id: string, currentTitle?: string) {
    setEditingId(id)
    setEditingTitle((currentTitle || UNTITLED_SESSION_TITLE).trim())
  }

  async function commitRename(id: string) {
    const nextTitle = editingTitle.trim()
    setEditingId(null)
    if (!nextTitle) { setEditingTitle(''); return }
    updateSession(id, { title: nextTitle, updatedAt: new Date().toISOString() })
    setEditingTitle('')
    try {
      await api.patch(`/sessions/${id}`, { title: nextTitle })
    } catch {
      // noop for now
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(null)
    try {
      await deleteSession(id)
      if (activeId === id) navigate('/')
    } catch {
      // noop for now
    }
  }

  async function handleDeleteAll() {
    setDeletingAll(true)
    try {
      await Promise.all(sessions.map((s) => deleteSession(s.id).catch(() => {})))
      navigate('/')
    } finally {
      setDeletingAll(false)
      setConfirmDeleteAll(false)
    }
  }

  return (
    <div className="hist-root">
      <style>{CSS}</style>

      <header className="hist-topbar">
        <button className="hist-back-chip" onClick={() => navigate('/')}>
          <Left size={11} /> Home
        </button>
        <span className="hist-topbar-sep">/</span>
        <span className="hist-topbar-title">Chat History</span>

        <div className="hist-search">
          <Search size={12} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
          />
        </div>

        {confirmDeleteAll ? (
          <div className="hist-confirm-all">
            <span>Delete all {sessions.length} conversations?</span>
            <button className="hist-confirm-cancel" onClick={() => setConfirmDeleteAll(false)} disabled={deletingAll}>
              Cancel
            </button>
            <button className="hist-confirm-delete" onClick={() => void handleDeleteAll()} disabled={deletingAll}>
              {deletingAll ? 'Deleting…' : 'Confirm'}
            </button>
          </div>
        ) : (
          <button
            className="hist-delete-all-btn"
            onClick={() => setConfirmDeleteAll(true)}
            disabled={sessions.length === 0}
          >
            <Delete size={11} /> Delete all
          </button>
        )}
      </header>

      <div className="hist-body">
        <div className="hist-container">
          {filtered.length === 0 ? (
            <div className="hist-empty">
              <HistoryIcon size={22} />
              <h2>{sessions.length === 0 ? 'No conversations yet' : 'No matches'}</h2>
              <p>
                {sessions.length === 0
                  ? 'Start a new chat and it will show up here.'
                  : 'Try a different search term.'}
              </p>
            </div>
          ) : (
            <>
              <div className="hist-count">
                {filtered.length} conversation{filtered.length === 1 ? '' : 's'}
                {query.trim() && sessions.length !== filtered.length ? ` of ${sessions.length}` : ''}
              </div>
              <div className="hist-list">
                {filtered.map((s) => (
                  <div key={s.id} className={`hist-row${s.id === activeId ? ' active' : ''}`}>
                    {editingId === s.id ? (
                      <input
                        className="hist-rename"
                        value={editingTitle}
                        autoFocus
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => { void commitRename(s.id) }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); void commitRename(s.id) }
                          else if (e.key === 'Escape') { setEditingId(null); setEditingTitle('') }
                        }}
                      />
                    ) : (
                      <button type="button" className="hist-row-main" onClick={() => openSession(s.id)}>
                        <span className="hist-row-title">{s.title || UNTITLED_SESSION_TITLE}</span>
                        <span className="hist-row-date">{fmtDate(s.updatedAt || s.createdAt)}</span>
                      </button>
                    )}

                    {deletingId === s.id ? (
                      <div className="hist-row-confirm">
                        <button className="hist-confirm-cancel" onClick={() => setDeletingId(null)}>Cancel</button>
                        <button className="hist-confirm-delete" onClick={() => void handleDelete(s.id)}>Delete</button>
                      </div>
                    ) : (
                      <div className="hist-row-actions">
                        <button className="hist-icon-btn" title="Rename" onClick={() => startRename(s.id, s.title)}>
                          <Edit size={12} />
                        </button>
                        <button className="hist-icon-btn hist-icon-btn--danger" title="Delete" onClick={() => setDeletingId(s.id)}>
                          <Delete size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const CSS = `
.hist-root {
  display: flex; flex-direction: column;
  width: 100%; height: 100%;
  background: var(--color-surface);
  color: var(--color-text);
  overflow: hidden;
}

.hist-topbar {
  display: flex; align-items: center; gap: 6px;
  padding: 0 17px; height: 52px; flex-shrink: 0;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border-subtle);
}
.hist-back-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 7px; border-radius: 5px; border: none;
  background: var(--color-hover); color: var(--color-text-secondary);
  font-size: 10px; font-weight: 600; cursor: pointer;
}
.hist-back-chip:hover { background: var(--color-border); color: var(--color-text); }
.hist-topbar-sep { color: var(--color-text-muted); font-size: 12px; }
.hist-topbar-title { font-size: 13px; font-weight: 700; white-space: nowrap; }

.hist-search {
  margin-left: 16px;
  display: flex; align-items: center; gap: 6px;
  padding: 5px 9px; border-radius: 8px;
  border: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
  color: var(--color-text-muted);
  flex: 1;
  max-width: 320px;
}
.hist-search input {
  border: none; background: transparent; outline: none;
  color: var(--color-text); font-size: 11px; width: 100%;
}

.hist-delete-all-btn {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 10px; border-radius: 7px;
  border: 1px solid rgba(var(--color-error-rgb), 0.28);
  background: rgba(var(--color-error-rgb), 0.1); color: var(--color-error);
  font-size: 10px; font-weight: 700; cursor: pointer;
  flex-shrink: 0;
}
.hist-delete-all-btn:hover:not(:disabled) { background: rgba(var(--color-error-rgb), 0.16); }
.hist-delete-all-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.hist-confirm-all {
  margin-left: auto;
  display: flex; align-items: center; gap: 8px;
  font-size: 10px; color: var(--color-text); white-space: nowrap;
  flex-shrink: 0;
}

.hist-body { flex: 1; overflow-y: auto; padding: 32px 24px 60px; }

/* Centers the whole page's content in a comfortable reading column instead
   of everything hugging the left edge with the rest of a wide window left
   bare - the column itself still gets wide enough that a title has real
   room to use (see .hist-row-title's 2-line clamp) before anything needs
   to truncate. */
.hist-container { max-width: 860px; margin: 0 auto; width: 100%; }

.hist-empty {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  gap: 8px; max-width: 380px; margin: 60px auto 0; color: var(--color-text-muted);
}
.hist-empty h2 { font-size: 14px; font-weight: 700; color: var(--color-text); margin: 4px 0 0; }
.hist-empty p { font-size: 11px; line-height: 1.6; margin: 0; }

.hist-count {
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--color-text-muted); margin-bottom: 12px; padding: 0 2px;
}

.hist-list { display: flex; flex-direction: column; gap: 8px; }

.hist-row {
  display: flex; align-items: stretch; gap: 8px;
  border: 1px solid var(--color-border-subtle); border-radius: 12px;
  background: var(--color-bg);
  padding: 3px;
  transition: border-color 0.15s;
}
.hist-row:hover { border-color: var(--color-border); }
.hist-row.active { border-color: rgba(239, 124, 47, 0.3); }

.hist-row-main {
  flex: 1; min-width: 0;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  border: none; background: transparent; cursor: pointer;
  padding: 12px 14px; text-align: left; border-radius: 9px;
}
.hist-row-main:hover { background: var(--color-hover); }

.hist-row-title {
  font-size: 12.5px; line-height: 1.5; color: var(--color-text);
  min-width: 0;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hist-row-date {
  font-size: 10px; color: var(--color-text-muted); flex-shrink: 0;
  white-space: nowrap;
}

.hist-rename {
  flex: 1; min-width: 0;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(239, 124, 47, 0.22);
  color: var(--color-text);
  border-radius: 8px;
  padding: 8px 11px;
  font-size: 12px;
  outline: none;
  margin: 2px;
}

.hist-row-actions { display: flex; gap: 3px; flex-shrink: 0; padding-right: 4px; }
.hist-icon-btn {
  width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--color-border-subtle);
  background: transparent; color: var(--color-text-muted);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.hist-icon-btn:hover { background: var(--color-hover); color: var(--color-text); }
.hist-icon-btn--danger:hover { background: rgba(var(--color-error-rgb), 0.1); color: var(--color-error); }

.hist-row-confirm {
  display: flex; gap: 6px; flex-shrink: 0; padding-right: 6px;
}

.hist-confirm-cancel {
  background: transparent; border: 1px solid var(--color-border-subtle); color: var(--color-text-muted);
  padding: 4px 8px; border-radius: 6px; font-size: 10px; cursor: pointer; white-space: nowrap;
}
.hist-confirm-delete {
  background: rgba(var(--color-error-rgb), 0.12); border: 1px solid rgba(var(--color-error-rgb), 0.3); color: var(--color-error);
  padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
`
