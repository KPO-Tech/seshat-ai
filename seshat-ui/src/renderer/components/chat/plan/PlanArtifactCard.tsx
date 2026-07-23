import { memo } from 'react'
import { CheckOne, DocDetail } from "@icon-park/react"
import { useUIStore } from '@/stores/ui'
import type { PlanDocument } from '@/api/types'

const CSS = `
.pac-root {
  display: flex;
  align-items: stretch;
  gap: 0;
  border: 1px solid var(--color-border-subtle);
  border-radius: 9px;
  overflow: hidden;
  background: var(--color-surface);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  max-width: 420px;
  user-select: none;
}

.pac-root:hover {
  border-color: rgba(239, 124, 47, 0.4);
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
}

.pac-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 10px;
  background: rgba(239, 124, 47, 0.07);
  border-right: 1px solid var(--color-border-subtle);
  color: var(--color-accent);
  flex-shrink: 0;
}

.pac-body {
  padding: 8px 10px;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.pac-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pac-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pac-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 5px;
  border-radius: 779px;
  flex-shrink: 0;
}

.pac-badge--pending {
  background: rgba(239, 124, 47, 0.15);
  color: var(--color-accent);
}

.pac-badge--validated {
  background: rgba(var(--color-success-rgb), 0.12);
  color: var(--color-success);
}

.pac-badge--rejected {
  background: rgba(var(--color-error-rgb), 0.1);
  color: var(--color-error);
}

.pac-meta {
  font-size: 10px;
  color: var(--color-text-muted);
}

.pac-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--color-border-subtle);
  padding: 6px 10px;
  flex-shrink: 0;
}

.pac-hint {
  font-size: 10px;
  color: var(--color-text-muted);
}

.pac-proceed {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  background: rgba(var(--color-success-rgb), 0.12);
  border: 1px solid rgba(var(--color-success-rgb), 0.3);
  color: var(--color-success);
  transition: all 0.15s;
}

.pac-proceed:hover {
  background: rgba(var(--color-success-rgb), 0.22);
  border-color: rgba(var(--color-success-rgb), 0.5);
}

.pac-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-width: 420px;
}
`

type Props = {
  plan: PlanDocument
  sessionId: string
  onProceed?: (planId: string) => void
}

export const PlanArtifactCard = memo(function PlanArtifactCard({ plan, sessionId, onProceed }: Props) {
  const openRightPanel = useUIStore((s) => s.openRightPanel)

  function openPanel(e: React.MouseEvent) {
    e.stopPropagation()
    openRightPanel({
      kind: 'plan',
      title: plan.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      sessionId,
      planId: plan.id,
    })
  }

  function handleProceed(e: React.MouseEvent) {
    e.stopPropagation()
    onProceed?.(plan.id)
  }

  const badgeClass = plan.status === 'validated'
    ? 'pac-badge pac-badge--validated'
    : plan.status === 'rejected'
      ? 'pac-badge pac-badge--rejected'
      : 'pac-badge pac-badge--pending'

  return (
    <div className="pac-wrapper">
      <style>{CSS}</style>
      <div className="pac-root" onClick={openPanel} role="button" tabIndex={0}>
        <div className="pac-left">
          <DocDetail size={16} />
        </div>
        <div className="pac-body">
          <div className="pac-header">
            <span className="pac-title">
              {plan.slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
            <span className={badgeClass}>{plan.status}</span>
          </div>
          <div className="pac-meta">{plan.filename} · v{plan.version} · Click to review</div>
        </div>
      </div>
      {plan.status === 'pending' && (
        <div className="pac-footer" style={{ borderTop: 'none', paddingTop: 6 }}>
          <span className="pac-hint">Review and approve to continue execution</span>
          <button className="pac-proceed" type="button" onClick={handleProceed}>
            <CheckOne size={10} />
            Proceed
          </button>
        </div>
      )}
    </div>
  )
})
