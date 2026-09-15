import { useState, type ReactNode } from 'react'
import type { User } from '@renderer/api/types'

type Props = {
  user: User
}

const actionChips = [
  { label: 'Create slides', icon: 'slides' },
  { label: 'Build website', icon: 'code' },
  { label: 'Develop desktop apps', icon: 'desktop' },
  { label: 'Design', icon: 'magic' },
  { label: 'More', icon: 'more' }
]

export function Dashboard({ user }: Props) {
  const [draft, setDraft] = useState('')
  const displayName = user.display_name || user.email

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center px-7">
        <button type="button" className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[15px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]">
          Seshat
          <ChevronDownIcon />
        </button>
      </header>

      <section className="flex flex-1 items-center justify-center overflow-hidden px-8 pb-16 pt-2">
        <div className="w-full max-w-[980px]">
          <div className="text-center">
            <p className="mb-4 text-[13px] font-medium text-[var(--text-muted)]">Signed in as {displayName}</p>
            <h1 className="font-display text-[var(--type-hero)] font-semibold leading-[var(--leading-tight)] tracking-normal text-[var(--text-primary)]">
              Where should we begin?
            </h1>
          </div>

          <div className="mx-auto mt-9 w-full max-w-[900px] rounded-[22px] border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 pb-3 pt-3.5 shadow-[0_20px_70px_rgba(0,0,0,0.08)]">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Assign a task or type / for more"
              className="min-h-[56px] w-full resize-none border-0 bg-transparent text-[15px] leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />

            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RoundToolButton label="Attach file">
                  <PlusIcon />
                </RoundToolButton>
                <RoundToolButton label="Tools">
                  <ToolsIcon />
                </RoundToolButton>
                <RoundToolButton label="Computer">
                  <DesktopIcon />
                </RoundToolButton>
              </div>

              <div className="flex items-center gap-2">
                <RoundToolButton label="Voice note">
                  <VoiceIcon />
                </RoundToolButton>
                <RoundToolButton label="Dictate">
                  <MicIcon />
                </RoundToolButton>
                <button
                  type="button"
                  disabled={!draft.trim()}
                  className="flex size-9 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-muted)] transition-colors enabled:bg-[var(--text-primary)] enabled:text-[var(--surface-root)]"
                  aria-label="Send"
                >
                  <ArrowUpIcon />
                </button>
              </div>
            </div>
          </div>

          <div className="mx-auto mt-4 grid w-full max-w-[720px] grid-cols-[1fr_1fr_1.35fr_0.82fr_0.72fr] gap-2">
            {actionChips.map((action) => (
              <button
                key={action.label}
                type="button"
                className="flex h-[30px] min-w-0 items-center justify-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-[var(--surface-panel)] px-2 text-[12px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
              >
                <ActionIcon name={action.icon} />
                <span className="truncate">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function RoundToolButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className="flex size-8 items-center justify-center rounded-full border border-[var(--border-soft)] text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

function ActionIcon({ name }: { name: string }) {
  if (name === 'slides') return <SlidesIcon />
  if (name === 'code') return <CodeIcon />
  if (name === 'desktop') return <DesktopIcon />
  if (name === 'magic') return <MagicIcon />
  return <MoreIcon />
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 5.5 3 3 3-3" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M9 4v10M4 9h10" />
    </svg>
  )
}

function ToolsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3v5M4.5 4.5h3M12 10v5M10.5 13.5h3M6 12h6" />
    </svg>
  )
}

function DesktopIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="12" height="8" rx="1.5" />
      <path d="M7 15h4M9 12v3" />
    </svg>
  )
}

function VoiceIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 7v4M9 5v8M13 7v4" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6.5" y="3" width="5" height="8" rx="2.5" />
      <path d="M4 9a5 5 0 0 0 10 0M9 14v2" />
    </svg>
  )
}

function ArrowUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14V4M5 8l4-4 4 4" />
    </svg>
  )
}

function SlidesIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="10" height="9" rx="1.5" />
      <path d="M7 7h4M7 10h2" />
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m7 5-4 4 4 4M11 5l4 4-4 4" />
    </svg>
  )
}

function MagicIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 14 8-8M10 4l4 4M3 5h2M5 3v2M13 12h2M15 10v2" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M5 9h.01M9 9h.01M13 9h.01" />
    </svg>
  )
}
