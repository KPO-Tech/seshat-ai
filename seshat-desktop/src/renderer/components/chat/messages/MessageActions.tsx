import { useState } from 'react'

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can fail silently (permissions, headless test
      // environments) - nothing useful to surface to the user here.
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label="Copy message"
      title="Copy"
      className="flex size-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6.5" y="6.5" width="8" height="8" rx="1.4" />
      <path d="M3.5 11.5v-7a1 1 0 0 1 1-1h7" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 9.5 3.2 3.2L14 5.5" />
    </svg>
  )
}
