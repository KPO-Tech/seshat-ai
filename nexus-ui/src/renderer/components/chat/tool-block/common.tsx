import { Copy, CheckOne, CloseOne, LoadingOne } from '@icon-park/react'
import type { ReactNode } from 'react'
import type { ToolStatus, ToolUseBlock } from '@/api/types'
import { fallbackApprovalDescription, fmtDuration, statusLabel } from './helpers'

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="tb-section">
      <span className="tb-section-label">{label}</span>
      {children}
    </div>
  )
}

export function CodeBox({
  content,
  variant,
  copyable,
}: {
  content: string
  variant?: 'error'
  copyable?: boolean
}) {
  return (
    <div className={`tb-code${variant ? ` tb-code--${variant}` : ''}`}>
      <pre className="tb-pre">{content}</pre>
      {copyable && (
        <button
          className="tb-copy"
          type="button"
          title="Copy"
          onClick={() => void navigator.clipboard.writeText(content)}
        >
          <Copy size={12} />
        </button>
      )}
    </div>
  )
}

export function StatusBadge({ status, durationMs }: { status: ToolStatus; durationMs?: number }) {
  return (
    <div className={`tb-status tb-status--${status}`}>
      <span className="tb-status-icon">
        {status === 'completed' && <CheckOne size={12} />}
        {status === 'failed' && <CloseOne size={12} />}
        {status === 'running' && <LoadingOne size={12} className="tb-spin" />}
        {(status === 'pending' || status === 'awaiting_approval') && <span className="tb-dot" />}
      </span>
      <span className="tb-status-label">{statusLabel(status)}</span>
      {durationMs != null && status !== 'running' && status !== 'awaiting_approval' && (
        <span className="tb-duration">{fmtDuration(durationMs)}</span>
      )}
    </div>
  )
}

export function ApprovalSection({
  tool,
  onApprove,
  onDeny,
}: {
  tool: ToolUseBlock
  onApprove?: (toolUseId: string) => void
  onDeny?: (toolUseId: string) => void
}) {
  const description = tool._approval?.description || fallbackApprovalDescription(tool)
  return (
    <div className="tb-approval">
      <div className="tb-approval-copy">
        <strong>Requires Validation</strong>
        <p>{description}</p>
      </div>
      {(onApprove || onDeny) && (
        <div className="tb-approval-actions">
          {onDeny && (
            <button className="tb-approval-btn tb-approval-btn--deny" type="button" onClick={() => onDeny(tool.id)}>
              Deny
            </button>
          )}
          {onApprove && (
            <button className="tb-approval-btn tb-approval-btn--allow" type="button" onClick={() => onApprove(tool.id)}>
              Validate
            </button>
          )}
        </div>
      )}
    </div>
  )
}
