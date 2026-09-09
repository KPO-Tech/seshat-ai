import { Close, Delete, LoadingOne } from '@icon-park/react'
import type { Agent } from '@/api/types'

type DeleteConfirmProps = {
  agent: Agent
  onConfirm: () => void
  onClose: () => void
  deleting: boolean
}

export function DeleteConfirm({ agent, onConfirm, onClose, deleting }: DeleteConfirmProps) {
  return (
    <div className="cmp-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="cmp-modal cmp-modal--sm">
        <div className="cmp-modal-header">
          <h2>Delete companion</h2>
          <button className="cmp-modal-close" onClick={onClose}><Close size={18} /></button>
        </div>
        <div className="cmp-modal-body">
          <p>Delete <strong>{agent.name || agent.slug}</strong>? This cannot be undone.</p>
        </div>
        <div className="cmp-modal-footer">
          <button className="cmp-btn cmp-btn--ghost" onClick={onClose} disabled={deleting}>Cancel</button>
          <button className="cmp-btn cmp-btn--danger" onClick={onConfirm} disabled={deleting}>
            {deleting ? <LoadingOne size={14} className="spin" /> : <Delete size={14} />}
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
