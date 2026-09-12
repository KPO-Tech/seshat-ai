import { Magic, History, CloseOne } from '@icon-park/react'
import type { JobDraft } from '../api/types'
import { describeDraftTrigger } from '../lib/schedulingJobs'

// Lightweight confirmation for a job drafted by the "Ask agent" bar -
// deliberately not a chat thread and not the full JobFormModal: just enough
// to look before a job that will execute real prompts against real systems
// goes live. Edit routes into the existing JobFormModal (pre-filled, same
// as before this was a real agent call); Confirm creates directly.
export function JobDraftCard({ draft, confirming, onEdit, onConfirm, onDismiss }: {
  draft: JobDraft
  confirming: boolean
  onEdit: () => void
  onConfirm: () => void
  onDismiss: () => void
}) {
  return (
    <div className="sch-draft-card">
      <div className="sch-draft-card-header">
        <Magic size={14} />
        <span className="sch-draft-card-title">{draft.name || 'Untitled job'}</span>
        <button type="button" className="sch-draft-card-dismiss" onClick={onDismiss} aria-label="Dismiss draft">
          <CloseOne size={13} />
        </button>
      </div>
      {draft.description && <div className="sch-job-desc">{draft.description}</div>}
      <div className="sch-meta-pills">
        <span className="sch-meta-pill"><History size={11} /><span>{describeDraftTrigger(draft)}</span></span>
      </div>
      {draft.prompt && <div className="sch-draft-card-prompt">{draft.prompt}</div>}
      <div className="sch-draft-card-actions">
        <button type="button" className="sch-modal-btn-cancel" onClick={onEdit}>Edit</button>
        <button type="button" className="sch-job-run-btn" onClick={onConfirm} disabled={confirming}>
          {confirming ? 'Creating…' : 'Confirm & create'}
        </button>
      </div>
    </div>
  )
}
