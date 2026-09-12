import { useState } from 'react'
import { Copy, CheckOne } from '@icon-park/react'

// Small copied-state-with-timeout helper used by fields that expose
// generated values or examples (webhook URLs, API keys, etc.). Extracted out
// of apps/automation/graph/ParameterForm.tsx so apps/scheduling can reuse it
// without duplicating the clipboard/timeout logic.
export function CopyButton({ text, className = 'gf-action-btn' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? <CheckOne size={13} /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
