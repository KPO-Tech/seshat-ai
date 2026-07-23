import { Copy, CheckOne, CloseOne, LoadingOne } from '@icon-park/react'
import type { ReactNode } from 'react'
import type { ToolStatus } from '@/api/types'
import { fmtDuration, statusLabel } from './helpers'

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
          <Copy size={10} />
        </button>
      )}
    </div>
  )
}

export function StatusBadge({ status, durationMs }: { status: ToolStatus; durationMs?: number }) {
  return (
    <div className={`tb-status tb-status--${status}`}>
      <span className="tb-status-icon">
        {status === 'completed' && <CheckOne size={10} />}
        {status === 'failed' && <CloseOne size={10} />}
        {status === 'running' && <LoadingOne size={10} className="tb-spin" />}
        {(status === 'pending' || status === 'awaiting_approval') && <span className="tb-dot" />}
      </span>
      <span className="tb-status-label">{statusLabel(status)}</span>
      {durationMs != null && status !== 'running' && status !== 'awaiting_approval' && (
        <span className="tb-duration">{fmtDuration(durationMs)}</span>
      )}
    </div>
  )
}
