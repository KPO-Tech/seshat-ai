import { useState, useEffect } from 'react'
import { CheckOne, CloseOne, Edit } from '@icon-park/react'
import { MarkdownView } from '@/components/MarkdownView'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { useUIStore } from '@/stores/ui'

type Props = {
  sessionId: string
}

export function PlanModal({ sessionId }: Props) {
  const pendingPermission = useSessionStore((s) => s.getAgentState(sessionId).pendingPermission)

  const isPlanPending = pendingPermission?.toolName === 'exit_plan_mode'
  const rawPlan = isPlanPending
    ? (pendingPermission.toolInput.plan as string | undefined) ?? ''
    : ''

  const [editMode, setEditMode] = useState(false)
  const [editedPlan, setEditedPlan] = useState(rawPlan)

  useEffect(() => {
    setEditedPlan(rawPlan)
    setEditMode(false)
  }, [rawPlan])

  if (!isPlanPending || !rawPlan) return null

  const planToApprove = editMode ? editedPlan : rawPlan

  async function decide(approved: boolean) {
    if (!pendingPermission) return
    const { toolUseId } = pendingPermission
    const store = useSessionStore.getState()
    const ui = useUIStore.getState()

    store.updateAgentState(sessionId, { pendingPermission: null })

    try {
      await api.post(`/permissions/${toolUseId}`, { approved, session_id: sessionId })
    } catch {
      // engine times out via ctx.Done()
    }

    if (approved) {
      // Persist plan as a session artifact
      store.updateSession(sessionId, { planArtifact: planToApprove })
      // Open right panel as a readable markdown artifact
      ui.openRightPanel({
        kind: 'markdown',
        title: 'Implementation Plan',
        sessionId,
        width: 480,
        markdown: planToApprove,
      })
    } else {
      // Restore agent monitor
      ui.openRightPanel({ kind: 'agent', title: 'Agent Monitor', sessionId, width: 380 })
    }
  }

  return (
    <>
      <style>{PLAN_MODAL_CSS}</style>
      <div className="pm-backdrop" onClick={(e) => { if (e.target === e.currentTarget) void decide(false) }}>
        <div className="pm-dialog" role="dialog" aria-modal="true" aria-label="Implementation Plan">

          <div className="pm-header">
            <div className="pm-header-left">
              <span className="pm-chip">Plan</span>
              <span className="pm-title">Implementation Plan</span>
            </div>
            <div className="pm-header-right">
              <button
                className={`pm-tool-btn${editMode ? ' pm-tool-btn--active' : ''}`}
                type="button"
                onClick={() => setEditMode((v) => !v)}
                title={editMode ? 'View rendered' : 'Edit plan'}
              >
                <Edit size={13} />
                {editMode ? 'Preview' : 'Edit'}
              </button>
              <button
                className="pm-tool-btn pm-close-btn"
                type="button"
                onClick={() => void decide(false)}
                title="Reject"
              >
                <CloseOne size={14} />
              </button>
            </div>
          </div>

          <div className="pm-body">
            {editMode ? (
              <textarea
                className="pm-editor"
                value={editedPlan}
                onChange={(e) => setEditedPlan(e.target.value)}
                spellCheck={false}
                autoFocus
              />
            ) : (
              <div className="pm-markdown">
                <MarkdownView>{planToApprove}</MarkdownView>
              </div>
            )}
          </div>

          <div className="pm-footer">
            <p className="pm-hint">Review the implementation plan before the agent begins execution.</p>
            <div className="pm-actions">
              <button
                className="pm-btn pm-btn--reject"
                type="button"
                onClick={() => void decide(false)}
              >
                <CloseOne size={13} />
                Reject
              </button>
              <button
                className="pm-btn pm-btn--approve"
                type="button"
                onClick={() => void decide(true)}
              >
                <CheckOne size={13} />
                Approve & Start
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}

const PLAN_MODAL_CSS = `
.pm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.pm-dialog {
  background: var(--color-surface, #1e1c24);
  border: 1px solid var(--color-border-subtle, rgba(255,255,255,0.1));
  border-radius: 16px;
  width: 100%;
  max-width: 660px;
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}

.pm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}

.pm-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.pm-chip {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(239, 124, 47, 0.15);
  color: var(--color-accent);
  flex-shrink: 0;
}

.pm-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pm-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.pm-tool-btn {
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

.pm-tool-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.pm-tool-btn--active {
  background: rgba(239, 124, 47, 0.1);
  border-color: rgba(239, 124, 47, 0.3);
  color: var(--color-accent);
}

.pm-close-btn {
  padding: 5px 7px;
}

.pm-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.pm-body::-webkit-scrollbar { width: 4px; }
.pm-body::-webkit-scrollbar-thumb {
  background: var(--color-border-subtle);
  border-radius: 4px;
}

.pm-markdown {
  padding: 20px 22px;
}

.pm-editor {
  width: 100%;
  height: 100%;
  min-height: 320px;
  padding: 20px 22px;
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

.pm-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.12);
}

.pm-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
  flex: 1;
}

.pm-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.pm-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 16px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.pm-btn--approve {
  background: rgba(52, 211, 153, 0.15);
  border-color: rgba(52, 211, 153, 0.35);
  color: #34d399;
}

.pm-btn--approve:hover {
  background: rgba(52, 211, 153, 0.25);
  border-color: rgba(52, 211, 153, 0.55);
}

.pm-btn--reject {
  background: transparent;
  border-color: var(--color-border-subtle);
  color: var(--color-text-muted);
}

.pm-btn--reject:hover {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.28);
  color: #f87171;
}
`
