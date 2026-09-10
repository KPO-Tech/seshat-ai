import { Copy } from '@icon-park/react'
import { fmtDuration, parseBashResult } from '../helpers'
import type { ToolViewProps } from '../types'

function BashPanel({
  label,
  content,
  tone = 'default',
  copyable = false,
}: {
  label: string
  content: string
  tone?: 'default' | 'error'
  copyable?: boolean
}) {
  if (!content) return null
  return (
    <div className={`tb-bash-panel tb-bash-panel--${tone}`}>
      <div className="tb-bash-panel-label">{label}</div>
      <pre className="tb-bash-pre">{content}</pre>
      {copyable && (
        <button
          className="tb-bash-copy"
          type="button"
          aria-label="Copy"
          onClick={() => void navigator.clipboard.writeText(content)}
        >
          <Copy size={10} />
        </button>
      )}
    </div>
  )
}

export function BashToolView({ tool, result }: ToolViewProps) {
  const command = (tool.input.command as string) ?? ''
  const parsed = parseBashResult(result)
  const showResultError = Boolean(result?.isError && result.content && result.content !== parsed?.stderr)

  return (
    <div className="tb-bash">
      <BashPanel label="Command" content={command} copyable />

      {parsed?.stdout != null && (
        <BashPanel label="Output" content={parsed.stdout || '(no output)'} copyable />
      )}

      {parsed?.stderr && (
        <BashPanel label="Error" content={parsed.stderr} tone="error" copyable />
      )}

      {parsed != null && parsed.exitCode != null && (
        <div className="tb-bash-meta">
          <span>Exit code: {parsed.exitCode}</span>
          {result?.durationMs != null && <span>Duration: {fmtDuration(result.durationMs)}</span>}
        </div>
      )}

      {showResultError && <BashPanel label="Error" content={result?.content ?? ''} tone="error" copyable />}
    </div>
  )
}
