import { useState, useEffect, useCallback } from 'react'
import { CheckOne, CloseOne, Send, Edit, DocDetail } from '@icon-park/react'
import { MarkdownView } from '@/components/MarkdownView'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { useUIStore } from '@/stores/ui'
import type { PlanDocument } from '@/api/types'

const CSS = `
.pep-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.pep-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border-subtle);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.pep-header-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pep-icon {
  color: var(--color-accent);
  flex-shrink: 0;
}

.pep-name {
  font-size: 13px;
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
  padding: 2px 8px;
  border-radius: 999px;
}

.pep-badge--pending {
  background: rgba(239, 124, 47, 0.15);
  color: var(--color-accent);
}

.pep-badge--validated {
  background: rgba(52, 211, 153, 0.12);
  color: #34d399;
}

.pep-badge--rejected {
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
}

.pep-meta {
  font-size: 11px;
  color: var(--color-text-muted);
}

.pep-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pep-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 7px;
  border: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
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
  border-radius: 4px;
}

.pep-markdown {
  padding: 16px 18px;
  flex: 1;
}

.pep-editor {
  width: 100%;
  flex: 1;
  min-height: 300px;
  padding: 16px 18px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  box-sizing: border-box;
}

/* ── Comments ── */
.pep-comments {
  padding: 0 14px 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.pep-comments-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding-top: 12px;
}

.pep-comment-input {
  width: 100%;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 13px;
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
  gap: 12px;
  padding: 10px 14px;
  border-top: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.08);
}

.pep-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  flex: 1;
}

.pep-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.pep-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.pep-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pep-btn--send {
  background: transparent;
  border-color: var(--color-border-subtle);
  color: var(--color-text-muted);
}

.pep-btn--send:hover:not(:disabled) {
  background: rgba(239, 124, 47, 0.08);
  border-color: rgba(239, 124, 47, 0.3);
  color: var(--color-accent);
}

.pep-btn--proceed {
  background: rgba(52, 211, 153, 0.12);
  border-color: rgba(52, 211, 153, 0.3);
  color: #34d399;
}

.pep-btn--proceed:hover:not(:disabled) {
  background: rgba(52, 211, 153, 0.22);
  border-color: rgba(52, 211, 153, 0.5);
}

.pep-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 8px;
  color: var(--color-text-muted);
  padding: 32px;
  font-size: 13px;
}
`

type Props = {
  planId: string
  sessionId: string
  pendingPermission?: { toolUseId: string } | null
}

export function PlanEditorPanel({ planId, sessionId, pendingPermission }: Props) {
  const plan = useSessionStore((s) => s.getPlan(sessionId, planId))
  const upsertPlan = useSessionStore((s) => s.upsertPlan)
  const openRightPanel = useUIStore((s) => s.openRightPanel)

  const [editMode, setEditMode] = useState(false)
  const [editedContent, setEditedContent] = useState('')
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (plan?.content) setEditedContent(plan.content)
  }, [plan?.id, plan?.content])

  const loadFull = useCallback(async () => {
    if (!plan || plan.content) return
    try {
      const full = await api.get<PlanDocument>(`/plans/${planId}`)
      upsertPlan(sessionId, full)
      setEditedContent(full.content)
    } catch { /* silent */ }
  }, [plan, planId, sessionId, upsertPlan])

  useEffect(() => { void loadFull() }, [loadFull])

  if (!plan) {
    return (
      <div className="pep-root">
        <style>{CSS}</style>
        <div className="pep-empty">Loading plan…</div>
      </div>
    )
  }

  const isReadonly = plan.status !== 'pending'
  const contentToShow = editMode ? editedContent : (plan.content || editedContent)

  const badgeClass = plan.status === 'validated'
    ? 'pep-badge pep-badge--validated'
    : plan.status === 'rejected'
      ? 'pep-badge pep-badge--rejected'
      : 'pep-badge pep-badge--pending'

  async function handleSend() {
    if (sending) return
    setSending(true)
    try {
      // If content was edited, persist it first
      if (editMode && editedContent !== plan!.content) {
        const updated = await api.patch<PlanDocument>(`/plans/${planId}`, { content: editedContent })
        upsertPlan(sessionId, updated)
      }
      // Build feedback message and queue it as a draft prompt for Conversation.tsx to send
      const parts: string[] = []
      if (comment.trim()) parts.push(comment.trim())
      if (editMode && editedContent !== plan!.content) {
        parts.push(`I've also updated the plan content directly.`)
      }
      if (parts.length === 0) parts.push('Please review the updated plan.')

      useSessionStore.getState().updateSession(sessionId, { draftPrompt: parts.join('\n\n') })
      setComment('')
      setEditMode(false)
    } finally {
      setSending(false)
    }
  }

  async function handleProceed() {
    if (sending || !pendingPermission) return
    setSending(true)
    try {
      // Persist edits if any
      if (editMode && editedContent !== plan!.content) {
        const updated = await api.patch<PlanDocument>(`/plans/${planId}`, { content: editedContent })
        upsertPlan(sessionId, updated)
      }

      // Mark plan as validated
      await api.patch<PlanDocument>(`/plans/${planId}`, { status: 'validated' })
      upsertPlan(sessionId, { ...plan!, status: 'validated' })

      // Approve the exit_plan_mode permission
      await api.post(`/permissions/${pendingPermission.toolUseId}`, {
        approved: true,
        session_id: sessionId,
      })

      // Clear pending permission from agent state
      useSessionStore.getState().updateAgentState(sessionId, { pendingPermission: null })

      // If there were notes, queue them as a draft after proceeding
      const notes: string[] = []
      if (comment.trim()) notes.push(comment.trim())
      if (editMode && editedContent !== plan!.content) {
        notes.push('I made some edits to the plan. Please take them into account during execution.')
      }
      if (notes.length > 0) {
        useSessionStore.getState().updateSession(sessionId, { draftPrompt: notes.join('\n\n') })
      }

      // Switch right panel back to agent monitor
      openRightPanel({ kind: 'agent', title: 'Agent Monitor', sessionId, width: 380 })
    } catch { /* silent */ } finally {
      setSending(false)
    }
  }

  async function handleReject() {
    if (sending || !pendingPermission) return
    setSending(true)
    try {
      await api.post(`/permissions/${pendingPermission.toolUseId}`, {
        approved: false,
        session_id: sessionId,
      })
      await api.patch<PlanDocument>(`/plans/${planId}`, { status: 'rejected' })
      upsertPlan(sessionId, { ...plan!, status: 'rejected' })
      useSessionStore.getState().updateAgentState(sessionId, { pendingPermission: null })
      openRightPanel({ kind: 'agent', title: 'Agent Monitor', sessionId, width: 380 })
    } catch { /* silent */ } finally {
      setSending(false)
    }
  }

  return (
    <div className="pep-root">
      <style>{CSS}</style>

      <div className="pep-header">
        <div className="pep-header-top">
          <DocDetail size={16} className="pep-icon" />
          <span className="pep-name">{plan.filename}</span>
          <span className={badgeClass}>{plan.status}</span>
        </div>
        <div className="pep-meta">v{plan.version} · {plan.slug}</div>
        {!isReadonly && (
          <div className="pep-toolbar">
            <button
              className={`pep-tool-btn${editMode ? ' pep-tool-btn--active' : ''}`}
              type="button"
              onClick={() => setEditMode((v) => !v)}
            >
              <Edit size={12} />
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
          <div className="pep-markdown">
            {contentToShow
              ? <MarkdownView>{contentToShow}</MarkdownView>
              : <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading content…</span>
            }
          </div>
        )}
      </div>

      {!isReadonly && (
        <div className="pep-comments">
          <div className="pep-comments-label">Comments</div>
          <textarea
            className="pep-comment-input"
            placeholder="Add feedback or requests for the agent (optional)…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>
      )}

      {!isReadonly && pendingPermission && (
        <div className="pep-footer">
          <span className="pep-hint">
            {comment || (editMode && editedContent !== plan.content)
              ? 'Send feedback or proceed directly'
              : 'Approve this plan to start execution'}
          </span>
          <div className="pep-actions">
            <button
              className="pep-btn pep-btn--send"
              type="button"
              onClick={() => void handleSend()}
              disabled={sending || (!comment.trim() && !(editMode && editedContent !== plan.content))}
            >
              <Send size={12} />
              Send
            </button>
            <button
              className="pep-btn pep-btn--proceed"
              type="button"
              onClick={() => void handleProceed()}
              disabled={sending}
            >
              <CheckOne size={12} />
              Proceed
            </button>
            <button
              className="pep-btn"
              type="button"
              onClick={() => void handleReject()}
              disabled={sending}
              style={{ borderColor: 'transparent', color: 'var(--color-text-muted)' }}
            >
              <CloseOne size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
