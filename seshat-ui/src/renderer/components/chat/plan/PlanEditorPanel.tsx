import { useState, useEffect, useCallback, useRef } from 'react'
import { CheckOne, CloseOne, Edit, DocDetail } from '@icon-park/react'
import { MarkdownView } from '@/components/MarkdownView'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { useUIStore, buildRightPanelId } from '@/stores/ui'
import type { PlanDocument } from '@/api/types'

const CSS = `
.pep-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.pep-header {
  padding: 10px 11px;
  border-bottom: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.pep-header-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pep-icon {
  color: var(--color-accent);
  flex-shrink: 0;
}

.pep-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pep-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 779px;
}

.pep-badge--pending {
  background: rgba(239, 124, 47, 0.15);
  color: var(--color-accent);
}

.pep-badge--validated {
  background: rgba(var(--color-success-rgb), 0.12);
  color: var(--color-success);
}

.pep-badge--rejected {
  background: rgba(var(--color-error-rgb), 0.1);
  color: var(--color-error);
}

.pep-meta {
  font-size: 10px;
  color: var(--color-text-muted);
}

.pep-toolbar {
  display: flex;
  align-items: center;
  gap: 5px;
}

.pep-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 7px;
  border-radius: 5px;
  border: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.pep-tool-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.pep-tool-btn--active {
  background: rgba(239, 124, 47, 0.1);
  border-color: rgba(239, 124, 47, 0.3);
  color: var(--color-accent);
}

.pep-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  scrollbar-width: thin;
}

.pep-body::-webkit-scrollbar { width: 4px; }
.pep-body::-webkit-scrollbar-thumb {
  background: var(--color-border-subtle);
  border-radius: 3px;
}

.pep-markdown {
  padding: 11px 13px;
  flex: 1;
  position: relative;
  user-select: text;
}

.pep-editor {
  width: 100%;
  flex: 1;
  min-height: 300px;
  padding: 11px 13px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px;
  line-height: 1.6;
  resize: none;
  box-sizing: border-box;
}

/* ── Inline annotation float ── */
.pep-float {
  position: fixed;
  z-index: 200;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  filter: drop-shadow(0 4px 16px rgba(0,0,0,0.35));
}

.pep-float-btn {
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--color-accent);
  border: none;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s;
}

.pep-float-btn:hover {
  background: rgba(239, 124, 47, 0.9);
}

.pep-float-form {
  background: rgba(38, 36, 44, 0.98);
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  padding: 7px;
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pep-float-quote {
  font-size: 10px;
  color: var(--color-text-muted);
  border-left: 2px solid var(--color-accent);
  padding-left: 6px;
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pep-float-textarea {
  width: 100%;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--color-border-subtle);
  border-radius: 5px;
  color: var(--color-text);
  font-size: 10px;
  font-family: inherit;
  padding: 5px 6px;
  resize: none;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.pep-float-textarea:focus {
  border-color: rgba(239, 124, 47, 0.4);
}

.pep-float-actions {
  display: flex;
  gap: 5px;
  justify-content: flex-end;
}

.pep-float-cancel {
  padding: 3px 7px;
  border-radius: 5px;
  border: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 10px;
  cursor: pointer;
}

.pep-float-cancel:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.pep-float-add {
  padding: 3px 7px;
  border-radius: 5px;
  border: none;
  background: var(--color-accent);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.12s;
}

.pep-float-add:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Annotation list ── */
.pep-annotations {
  padding: 0 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex-shrink: 0;
}

.pep-annotations-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pep-annotations-clear {
  font-size: 10px;
  font-weight: 500;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-transform: lowercase;
  letter-spacing: 0;
  transition: color 0.12s;
}

.pep-annotations-clear:hover {
  color: var(--color-error);
}

.pep-annotation-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  background: rgba(239, 124, 47, 0.05);
  border: 1px solid rgba(239, 124, 47, 0.15);
  border-radius: 6px;
  padding: 6px 7px;
}

.pep-annotation-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.pep-annotation-quote {
  font-size: 10px;
  font-style: italic;
  color: var(--color-text-muted);
  border-left: 2px solid var(--color-accent);
  padding-left: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pep-annotation-comment {
  font-size: 10px;
  color: var(--color-text);
  line-height: 1.45;
}

.pep-annotation-remove {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  opacity: 0.5;
  transition: opacity 0.12s;
}

.pep-annotation-remove:hover {
  opacity: 1;
  color: var(--color-error);
}

/* ── Comments ── */
.pep-comments {
  padding: 0 10px 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex-shrink: 0;
}

.pep-comments-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding-top: 8px;
}

.pep-comment-input {
  width: 100%;
  padding: 7px 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  color: var(--color-text);
  font-size: 11px;
  font-family: inherit;
  resize: vertical;
  min-height: 72px;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.pep-comment-input:focus {
  border-color: rgba(239, 124, 47, 0.35);
}

.pep-comment-input::placeholder {
  color: var(--color-text-muted);
  opacity: 0.6;
}

/* ── Footer ── */
.pep-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  padding: 7px 10px;
  border-top: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.08);
}

.pep-hint {
  font-size: 10px;
  color: var(--color-text-muted);
  flex: 1;
}

.pep-actions {
  display: flex;
  gap: 5px;
  flex-shrink: 0;
}

.pep-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.pep-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pep-btn--deny {
  background: transparent;
  border-color: var(--color-border-subtle);
  color: var(--color-text-muted);
}

.pep-btn--deny:hover:not(:disabled) {
  background: rgba(var(--color-error-rgb), 0.08);
  border-color: rgba(var(--color-error-rgb), 0.3);
  color: var(--color-error);
}

.pep-btn--proceed {
  background: rgba(var(--color-success-rgb), 0.12);
  border-color: rgba(var(--color-success-rgb), 0.3);
  color: var(--color-success);
}

.pep-btn--proceed:hover:not(:disabled) {
  background: rgba(var(--color-success-rgb), 0.22);
  border-color: rgba(var(--color-success-rgb), 0.5);
}

.pep-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 6px;
  color: var(--color-text-muted);
  padding: 22px;
  font-size: 11px;
}
`

type Annotation = {
  id: string
  quote: string
  comment: string
}

type Props = {
  // planId is set when the agent submitted a structured plan document via
  // submit_plan; content is fetched/persisted through /plans/:id. When
  // absent, rawContent carries the plain-text plan from exit_plan_mode's
  // toolInput.plan instead: same review experience (markdown, annotations,
  // comments), just nothing to persist server-side, so editing is disabled.
  planId?: string
  sessionId: string
  pendingPermission?: { toolUseId: string } | null
  rawContent?: string
}

export function PlanEditorPanel({ planId, sessionId, pendingPermission, rawContent }: Props) {
  const isDocumentBacked = !!planId
  const plan = useSessionStore((s) => (planId ? s.getPlan(sessionId, planId) : undefined))
  const upsertPlan = useSessionStore((s) => s.upsertPlan)
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  const closeRightPanel = useUIStore((s) => s.closeRightPanel)

  const [editMode, setEditMode] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)

  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [pendingQuote, setPendingQuote] = useState<string | null>(null)
  const [annotationInput, setAnnotationInput] = useState('')
  const [floatStyle, setFloatStyle] = useState<{ top: number; left: number } | null>(null)
  const [showAnnotationForm, setShowAnnotationForm] = useState(false)
  const floatRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (plan?.content) setEditedContent(plan.content)
  }, [plan?.id, plan?.content])

  const loadFull = useCallback(async () => {
    if (!planId || !plan || plan.content) return
    try {
      const full = await api.get<PlanDocument>(`/plans/${planId}`)
      upsertPlan(sessionId, full)
      setEditedContent(full.content)
    } catch { /* silent */ }
  }, [plan, planId, sessionId, upsertPlan])

  useEffect(() => { void loadFull() }, [loadFull])

  useEffect(() => {
    if (!floatStyle) return
    function handleMouseDown(e: MouseEvent) {
      if (floatRef.current && !floatRef.current.contains(e.target as Node)) {
        closeFloat()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [floatStyle])

  function handleMarkdownMouseUp() {
    if (editMode || (plan?.status ?? 'pending') !== 'pending') return
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (!text || text.length < 3 || !sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setPendingQuote(text)
    setAnnotationInput('')
    setShowAnnotationForm(false)
    setFloatStyle({ top: rect.bottom + 8, left: rect.left + rect.width / 2 })
  }

  function closeFloat() {
    setFloatStyle(null)
    setPendingQuote(null)
    setAnnotationInput('')
    setShowAnnotationForm(false)
    window.getSelection()?.removeAllRanges()
  }

  function addAnnotation() {
    if (!pendingQuote || !annotationInput.trim()) return
    setAnnotations((prev) => [
      ...prev,
      { id: crypto.randomUUID(), quote: pendingQuote, comment: annotationInput.trim() },
    ])
    closeFloat()
  }

  function removeAnnotation(id: string) {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
  }

  function buildFeedback(): string {
    const parts: string[] = []
    if (annotations.length > 0) {
      parts.push(
        '**Plan annotations:**\n\n' +
        annotations.map((a) => `> "${a.quote}"\n${a.comment}`).join('\n\n')
      )
    }
    if (comment.trim()) parts.push(comment.trim())
    if (isDocumentBacked && editMode && editedContent !== plan?.content) {
      parts.push("I've also updated the plan content directly.")
    }
    return parts.join('\n\n')
  }

  const content = plan?.content ?? rawContent ?? ''

  if (isDocumentBacked && !plan) {
    return (
      <div className="pep-root">
        <style>{CSS}</style>
        <div className="pep-empty">Loading plan…</div>
      </div>
    )
  }

  if (!content) {
    return (
      <div className="pep-root">
        <style>{CSS}</style>
        <div className="pep-empty">No plan content yet.</div>
      </div>
    )
  }

  const status = plan?.status ?? 'pending'
  const isReadonly = status !== 'pending'
  const contentToShow = editMode ? editedContent : (content || editedContent)
  const humanSlug = plan
    ? plan.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'Implementation Plan'

  const badgeClass = status === 'validated'
    ? 'pep-badge pep-badge--validated'
    : status === 'rejected'
      ? 'pep-badge pep-badge--rejected'
      : 'pep-badge pep-badge--pending'

  const hasFeedback = annotations.length > 0 || !!comment.trim() || (isDocumentBacked && editMode && editedContent !== content)

  async function handleProceed() {
    if (sending || !pendingPermission) return
    setSending(true)
    try {
      if (isDocumentBacked && editMode && editedContent !== plan!.content) {
        const updated = await api.patch<PlanDocument>(`/plans/${planId}`, { content: editedContent })
        upsertPlan(sessionId, updated)
      }
      if (isDocumentBacked) {
        await api.patch<PlanDocument>(`/plans/${planId}`, { status: 'validated' })
        upsertPlan(sessionId, { ...plan!, status: 'validated' })
      }

      await api.post(`/permissions/${pendingPermission.toolUseId}`, {
        approved: true,
        session_id: sessionId,
      })

      useSessionStore.getState().updateAgentState(sessionId, { pendingPermission: null })
      // The stack no longer replaces a different kind on open (it dedups by
      // identity) — close this plan panel explicitly before Agent Monitor
      // reclaims a stack slot, or it'd sit alongside it unclosed.
      closeRightPanel(buildRightPanelId({ kind: 'plan', sessionId, planId }))
      openRightPanel({ kind: 'agent', title: 'Agent Monitor', sessionId })
    } catch { /* silent */ } finally {
      setSending(false)
    }
  }

  // Reject and "send feedback" are the same action: deny exit_plan_mode and
  // attach whatever feedback was collected as the deny reason, so the model
  // sees it as the tool's rejection text and revises within the same turn,
  // no new user message/turn required. An empty reason is just a plain no.
  async function handleDeny() {
    if (sending || !pendingPermission) return
    setSending(true)
    try {
      await api.post(`/permissions/${pendingPermission.toolUseId}`, {
        approved: false,
        session_id: sessionId,
        reason: hasFeedback ? buildFeedback() : '',
      })
      if (isDocumentBacked) {
        await api.patch<PlanDocument>(`/plans/${planId}`, { status: 'rejected' })
        upsertPlan(sessionId, { ...plan!, status: 'rejected' })
      }
      useSessionStore.getState().updateAgentState(sessionId, { pendingPermission: null })
      setComment('')
      setAnnotations([])
      setEditMode(false)
      closeRightPanel(buildRightPanelId({ kind: 'plan', sessionId, planId }))
      openRightPanel({ kind: 'agent', title: 'Agent Monitor', sessionId })
    } catch { /* silent */ } finally {
      setSending(false)
    }
  }

  return (
    <div className="pep-root">
      <style>{CSS}</style>

      <div className="pep-header">
        <div className="pep-header-top">
          <DocDetail size={13} className="pep-icon" />
          <span className="pep-name">{humanSlug}</span>
          <span className={badgeClass}>{status}</span>
        </div>
        {plan && <div className="pep-meta">{plan.filename} · v{plan.version}</div>}
        {isDocumentBacked && !isReadonly && (
          <div className="pep-toolbar">
            <button
              className={`pep-tool-btn${editMode ? ' pep-tool-btn--active' : ''}`}
              type="button"
              onClick={() => setEditMode((v) => !v)}
            >
              <Edit size={10} />
              {editMode ? 'Preview' : 'Edit'}
            </button>
          </div>
        )}
      </div>

      <div className="pep-body">
        {editMode ? (
          <textarea
            className="pep-editor"
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            spellCheck={false}
            autoFocus
          />
        ) : (
          <div className="pep-markdown" onMouseUp={handleMarkdownMouseUp}>
            {contentToShow
              ? <MarkdownView>{contentToShow}</MarkdownView>
              : <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading content…</span>
            }
          </div>
        )}
      </div>

      {!isReadonly && annotations.length > 0 && (
        <div className="pep-annotations">
          <div className="pep-annotations-label">
            Annotations ({annotations.length})
            <button
              type="button"
              className="pep-annotations-clear"
              onClick={() => setAnnotations([])}
            >
              clear all
            </button>
          </div>
          {annotations.map((a) => (
            <div key={a.id} className="pep-annotation-row">
              <div className="pep-annotation-body">
                <div className="pep-annotation-quote">"{a.quote}"</div>
                <div className="pep-annotation-comment">{a.comment}</div>
              </div>
              <button
                type="button"
                className="pep-annotation-remove"
                onClick={() => removeAnnotation(a.id)}
                title="Remove"
              >
                <CloseOne size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!isReadonly && (
        <div className="pep-comments">
          <div className="pep-comments-label">
            {annotations.length > 0 ? 'General comment' : 'Comments'}
          </div>
          <textarea
            className="pep-comment-input"
            placeholder={
              annotations.length > 0
                ? 'Add an overall comment (optional)…'
                : 'Select text to annotate a section, or type a general comment…'
            }
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      )}

      {!isReadonly && pendingPermission && (
        <div className="pep-footer">
          <span className="pep-hint">
            {hasFeedback
              ? 'Sends your feedback to the agent, which revises the plan right away'
              : 'Select text to annotate, or leave a comment below'}
          </span>
          <div className="pep-actions">
            <button
              className="pep-btn pep-btn--deny"
              type="button"
              onClick={() => void handleDeny()}
              disabled={sending}
            >
              <CloseOne size={10} />
              {hasFeedback ? 'Send Feedback' : 'Reject'}
            </button>
            <button
              className="pep-btn pep-btn--proceed"
              type="button"
              onClick={() => void handleProceed()}
              disabled={sending}
            >
              <CheckOne size={10} />
              Proceed
            </button>
          </div>
        </div>
      )}

      {floatStyle && pendingQuote && (
        <div
          ref={floatRef}
          className="pep-float"
          style={{ top: floatStyle.top, left: floatStyle.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {showAnnotationForm ? (
            <div className="pep-float-form">
              <div className="pep-float-quote">"{pendingQuote}"</div>
              <textarea
                className="pep-float-textarea"
                autoFocus
                rows={3}
                placeholder="Your comment on this selection…"
                value={annotationInput}
                onChange={(e) => setAnnotationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addAnnotation() }
                  if (e.key === 'Escape') closeFloat()
                }}
              />
              <div className="pep-float-actions">
                <button type="button" className="pep-float-cancel" onClick={closeFloat}>Cancel</button>
                <button
                  type="button"
                  className="pep-float-add"
                  onClick={addAnnotation}
                  disabled={!annotationInput.trim()}
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="pep-float-btn"
              onClick={() => setShowAnnotationForm(true)}
            >
              ✎ Comment
            </button>
          )}
        </div>
      )}
    </div>
  )
}
