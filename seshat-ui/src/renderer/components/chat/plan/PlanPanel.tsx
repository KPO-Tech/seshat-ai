import { useState, useEffect } from 'react'
import { CheckOne, CloseOne, Edit, FileTextOne } from '@icon-park/react'
import { MarkdownView } from '@/components/MarkdownView'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { useUIStore } from '@/stores/ui'

type Props = {
  sessionId: string
}

export function PlanPanel({ sessionId }: Props) {
  const pendingPermission = useSessionStore((s) => s.getAgentState(sessionId).pendingPermission)
  const closeRightPanel = useUIStore((s) => s.closeRightPanel)

  const isPendingApproval = pendingPermission?.toolName === 'exit_plan_mode'
  const rawPlan = isPendingApproval
    ? (pendingPermission.toolInput.plan as string | undefined) ?? ''
    : ''

  const [editMode, setEditMode] = useState(false)
  const [editedPlan, setEditedPlan] = useState(rawPlan)

  // Sync edited plan when a new plan arrives
  useEffect(() => {
    setEditedPlan(rawPlan)
    setEditMode(false)
  }, [rawPlan])

  const displayContent = editMode ? editedPlan : rawPlan

  async function decide(approved: boolean) {
    if (!pendingPermission) return
    const { toolUseId } = pendingPermission
    const store = useSessionStore.getState()

    // Optimistically clear pending state
    store.updateAgentState(sessionId, { pendingPermission: null })

    // If user edited the plan, submit a modified approval — not yet wired
    // server-side, so we just approve/deny as-is.
    try {
      await api.post(`/permissions/${toolUseId}`, { approved, session_id: sessionId })
    } catch {
      // If the request fails the engine will time out via ctx.Done()
    }

    closeRightPanel()
  }

  if (!rawPlan) {
    return (
      <div className="pp-empty">
        <FileTextOne size={32} />
        <p>No plan content yet.</p>
      </div>
    )
  }

  return (
    <div className="pp-root">
      <style>{PLAN_PANEL_CSS}</style>

      {/* Toolbar */}
      <div className="pp-toolbar">
        <button
          className={`pp-tool-btn${editMode ? ' pp-tool-btn--active' : ''}`}
          type="button"
          title={editMode ? 'View rendered' : 'Edit plan'}
          onClick={() => setEditMode((v) => !v)}
        >
          <Edit size={14} />
          {editMode ? 'Preview' : 'Edit'}
        </button>
      </div>

      {/* Content */}
      <div className="pp-body">
        {editMode ? (
          <textarea
            className="pp-editor"
            value={editedPlan}
            onChange={(e) => setEditedPlan(e.target.value)}
            spellCheck={false}
          />
        ) : (
          <div className="pp-markdown">
            <MarkdownView>{displayContent}</MarkdownView>
          </div>
        )}
      </div>

      {/* Action buttons — only shown when approval is pending */}
      {isPendingApproval && (
        <div className="pp-actions">
          <button
            className="pp-btn pp-btn--reject"
            type="button"
            onClick={() => void decide(false)}
          >
            <CloseOne size={14} />
            Reject
          </button>
          <button
            className="pp-btn pp-btn--approve"
            type="button"
            onClick={() => void decide(true)}
          >
            <CheckOne size={14} />
            Approve & Start
          </button>
        </div>
      )}
    </div>
  )
}

const PLAN_PANEL_CSS = `
.pp-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.pp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
}

.pp-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid var(--color-border-subtle);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.pp-tool-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.pp-tool-btn--active {
  background: rgba(239, 124, 47, 0.12);
  border-color: rgba(239, 124, 47, 0.3);
  color: var(--color-accent);
}

.pp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.pp-markdown {
  padding: 20px 20px 16px;
}

.pp-editor {
  width: 100%;
  height: 100%;
  padding: 20px;
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

.pp-editor::placeholder {
  color: var(--color-text-muted);
}

.pp-actions {
  display: flex;
  gap: 10px;
  padding: 14px 16px;
  border-top: 1px solid var(--color-border-subtle);
  flex-shrink: 0;
  background: rgba(43, 41, 48, 0.8);
}

.pp-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.pp-btn--approve {
  background: rgba(52, 211, 153, 0.15);
  border-color: rgba(52, 211, 153, 0.35);
  color: #34d399;
}

.pp-btn--approve:hover {
  background: rgba(52, 211, 153, 0.25);
  border-color: rgba(52, 211, 153, 0.55);
}

.pp-btn--reject {
  background: transparent;
  border-color: var(--color-border-subtle);
  color: var(--color-text-muted);
}

.pp-btn--reject:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.pp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  color: var(--color-text-muted);
  font-size: 14px;
}
`
