import { useEffect, useRef, useState } from 'react'
import { useRightPanelStore } from '@renderer/stores/rightPanel'
import type { ChatExecutionMode, ChatPermissionMode } from './lib/chatTypes'

const EXECUTION_CYCLE: ChatExecutionMode[] = ['execute', 'plan']
const EXECUTION_LABEL: Record<ChatExecutionMode, string> = { execute: 'Execute', plan: 'Plan' }

const PERMISSION_OPTIONS: { id: ChatPermissionMode; label: string }[] = [
  { id: 'auto', label: 'Smart' },
  { id: 'bypass', label: 'Auto' }
]
const PERMISSION_LABEL: Record<ChatPermissionMode, string> = { auto: 'Smart', bypass: 'Auto' }

type Props = {
  executionMode: ChatExecutionMode
  onExecutionModeChange: (mode: ChatExecutionMode) => void
  permissionMode: ChatPermissionMode
  onPermissionModeChange: (mode: ChatPermissionMode) => void
  disabled?: boolean
  sessionId?: string
}

// Session-level controls, top-right - ported from seshat-ui's ChatTopBar.tsx.
// Model/Agent pickers stay in ChatInput next to where the user actually
// types, matching that split.
export function ChatTopBar({ executionMode, onExecutionModeChange, permissionMode, onPermissionModeChange, disabled, sessionId }: Props) {
  const panel = useRightPanelStore((state) => state.panel)
  const openPanel = useRightPanelStore((state) => state.openPanel)
  const closePanel = useRightPanelStore((state) => state.closePanel)
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const browserOpen = Boolean(sessionId) && panel?.kind === 'browser' && panel.sessionId === sessionId
  const isPlanMode = executionMode === 'plan'

  useEffect(() => {
    if (!permissionMenuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setPermissionMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [permissionMenuOpen])

  function toggleBrowser() {
    if (!sessionId) return
    if (browserOpen) closePanel()
    else openPanel('browser', sessionId)
  }

  return (
    <div className="relative flex shrink-0 items-center gap-1.5" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onExecutionModeChange(EXECUTION_CYCLE[(EXECUTION_CYCLE.indexOf(executionMode) + 1) % EXECUTION_CYCLE.length])}
        className={[
          'flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          isPlanMode ? 'border-[#60a5fa]/35 text-[#60a5fa]' : 'border-[var(--accent-primary)]/35 text-[var(--accent-primary)]'
        ].join(' ')}
      >
        <span className={`size-[5px] shrink-0 rounded-full ${isPlanMode ? 'bg-[#60a5fa]' : 'bg-[var(--accent-primary)]'}`} />
        {EXECUTION_LABEL[executionMode]}
      </button>

      <TopBarIconButton label="Browser" active={browserOpen} disabled={!sessionId} onClick={toggleBrowser}>
        <BrowserIcon />
      </TopBarIconButton>

      <div className="relative">
        <TopBarIconButton
          label={`Permissions: ${PERMISSION_LABEL[permissionMode]}`}
          active
          activeColor={permissionMode === 'bypass' ? 'danger' : 'warning'}
          disabled={disabled}
          onClick={() => setPermissionMenuOpen((value) => !value)}
        >
          <ShieldIcon />
        </TopBarIconButton>
        {permissionMenuOpen && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-30 flex min-w-[120px] flex-col gap-0.5 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-1 shadow-[0_14px_32px_rgba(0,0,0,0.22)]">
            {PERMISSION_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => { setPermissionMenuOpen(false); onPermissionModeChange(option.id) }}
                className={[
                  'rounded-md px-2.5 py-1.5 text-left text-[12px] font-semibold hover:bg-[var(--surface-muted)]',
                  option.id === permissionMode ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)]'
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TopBarIconButton({
  label,
  children,
  onClick,
  active,
  activeColor,
  disabled
}: {
  label: string
  children: React.ReactNode
  onClick?: () => void
  active?: boolean
  activeColor?: 'danger' | 'warning'
  disabled?: boolean
}) {
  const activeClass = activeColor === 'danger'
    ? 'border-[var(--accent-danger)]/45 bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]'
    : activeColor === 'warning'
      ? 'border-[var(--accent-warning)]/45 bg-[var(--accent-warning)]/10 text-[var(--accent-warning)]'
      : 'border-[var(--accent-primary)]/45 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={[
        'flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        active ? activeClass : 'border-[var(--border-soft)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function BrowserIcon() {
  return <svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="12" height="10" rx="2" /><path d="M3 7h12" /><path d="M6 5.5h.01" /></svg>
}

function ShieldIcon() {
  return <svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 2.5 3.5 4.5v4c0 4 2.5 6.3 5.5 7 3-.7 5.5-3 5.5-7v-4L9 2.5Z" /></svg>
}
