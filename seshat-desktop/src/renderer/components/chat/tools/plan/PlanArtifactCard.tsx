import { useEffect, useState } from 'react'
import { decideToolPermission, fetchPlan } from '../../lib/chatApi'
import type { PlanDocument, ToolUseBlock } from '../../lib/chatTypes'
import { CodePanel } from '../ToolDetails'
import { planIdFromTool, planTitleFromSlug, submitPlanName } from './planUtils'

type Props = {
  sessionId?: string
  tool: ToolUseBlock
  readOnly?: boolean
}

export function PlanArtifactCard({ sessionId, tool, readOnly = false }: Props) {
  const planId = planIdFromTool(tool)
  const [plan, setPlan] = useState<PlanDocument | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!planId) return
    void fetchPlan(planId)
      .then((nextPlan) => {
        if (!cancelled) setPlan(nextPlan)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Cannot load plan.')
      })
    return () => {
      cancelled = true
    }
  }, [planId])

  const embeddedPlan = tool._plan
  const title = plan ? planTitleFromSlug(plan.slug) : embeddedPlan?.slug ? planTitleFromSlug(embeddedPlan.slug) : submitPlanName(tool)
  const status = plan?.status ?? embeddedPlan?.status ?? (tool._result ? 'submitted' : 'pending')
  const content = plan?.content || embeddedPlan?.content || ''
  const filename = plan?.filename || embeddedPlan?.filename
  const version = plan?.version ?? embeddedPlan?.version
  const canReview = !readOnly && Boolean(sessionId && planId && tool._approval)

  async function decide(approved: boolean) {
    if (!sessionId || !planId || !tool._approval) return
    setBusy(approved ? 'approve' : 'reject')
    setError('')
    try {
      await decideToolPermission({
        toolUseId: tool._approval.toolUseId,
        sessionId,
        approved,
        reason: approved ? '' : reason.trim(),
        planId
      })
    } catch (err) {
      setBusy(null)
      setError(err instanceof Error ? err.message : 'Decision failed.')
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-stretch text-left hover:bg-[var(--surface-muted)]">
        <span className="flex w-11 shrink-0 items-center justify-center border-r border-[var(--border-soft)] bg-[var(--accent-primary)]/8 text-[var(--accent-primary)]">
          <PlanIcon />
        </span>
        <span className="min-w-0 flex-1 px-3 py-2">
          <span className="flex items-center gap-2">
            <span className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{title}</span>
            <span className={statusClass(status)}>{status}</span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]">
            {filename ? `${filename}${version ? ` v${version}` : ''}` : planId ? 'Loading plan' : 'Plan document'}
          </span>
        </span>
        <span className="flex items-center px-3 text-[11px] font-semibold text-[var(--text-muted)]">{open ? 'Hide' : 'Review'}</span>
      </button>

      {open && (
        <div className="grid gap-3 border-t border-[var(--border-soft)] p-3">
          {error && <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/8 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">{error}</div>}
          {content ? (
            <div className="no-scrollbar max-h-[360px] overflow-auto rounded-md bg-[var(--surface-muted)] px-3 py-2 text-[12px] leading-6 text-[var(--text-secondary)] whitespace-pre-wrap">{content}</div>
          ) : (
            <CodePanel title="Plan input" value={tool.input} />
          )}
          {canReview && (
            <div className="grid gap-2">
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Optional feedback when rejecting"
                className="min-h-16 resize-none rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)]"
              />
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => void decide(false)} className="rounded-md border border-[var(--accent-danger)]/40 px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-danger)] disabled:opacity-50">{busy === 'reject' ? 'Rejecting' : 'Reject'}</button>
                <button type="button" disabled={Boolean(busy)} onClick={() => void decide(true)} className="rounded-md border border-[var(--accent-success)]/40 bg-[var(--accent-success)]/10 px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-success)] disabled:opacity-50">{busy === 'approve' ? 'Approving' : 'Approve plan'}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function statusClass(status: string) {
  const base = 'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold'
  if (status === 'validated') return `${base} bg-[var(--accent-success)]/12 text-[var(--accent-success)]`
  if (status === 'rejected') return `${base} bg-[var(--accent-danger)]/12 text-[var(--accent-danger)]`
  return `${base} bg-[var(--accent-primary)]/12 text-[var(--accent-primary)]`
}

function PlanIcon() {
  return <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 3.5h5l3 3V14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" /><path d="M10 3.5V7h3" /><path d="M6.5 10h5M6.5 12.5h3" /></svg>
}
