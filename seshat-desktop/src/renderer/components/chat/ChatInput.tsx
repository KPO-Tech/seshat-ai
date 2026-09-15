import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChatModelSelect } from './ChatModelSelect'
import type { ChatModelChoice } from './chatModels'

const actionChips = [
  { label: 'Create slides', icon: 'slides', prompt: 'Create slides about ' },
  { label: 'Build website', icon: 'code', prompt: 'Build a website for ' },
  { label: 'Develop desktop apps', icon: 'desktop', prompt: 'Develop a desktop app that ' },
  { label: 'Design', icon: 'magic', prompt: 'Design ' },
  { label: 'More', icon: 'more', prompt: '' }
]

type ChatInputProps = {
  disabled?: boolean
  compact?: boolean
  modelChoices?: ChatModelChoice[]
  selectedModelId?: string
  modelsLoading?: boolean
  onModelChange?: (id: string) => void
  onSend: (text: string) => void
}

export function ChatInput({
  disabled,
  compact = false,
  modelChoices = [],
  selectedModelId = '',
  modelsLoading = false,
  onModelChange,
  onSend
}: ChatInputProps) {
  const [draft, setDraft] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, compact ? 140 : 180)}px`
  }, [draft, compact])

  function submit() {
    const text = draft.trim()
    if (!text || disabled) return
    setDraft('')
    onSend(text)
  }

  return (
    <div className="w-full">
      <div className="rounded-[22px] border border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 pb-3 pt-3 shadow-[0_20px_70px_rgba(0,0,0,0.08)]">
        <textarea
          ref={ref}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder="Assign a task or type / for more"
          disabled={disabled}
          className="min-h-[48px] w-full resize-none border-0 bg-transparent text-[15px] leading-6 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
        />

        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <RoundToolButton label="Attach file"><PlusIcon /></RoundToolButton>
            <RoundToolButton label="Tools"><ToolsIcon /></RoundToolButton>
            <RoundToolButton label="Computer"><DesktopIcon /></RoundToolButton>
            <ChatModelSelect
              choices={modelChoices}
              value={selectedModelId}
              loading={modelsLoading}
              disabled={disabled || !onModelChange}
              onChange={(id) => onModelChange?.(id)}
            />
          </div>

          <div className="flex items-center gap-2">
            <RoundToolButton label="Voice note"><VoiceIcon /></RoundToolButton>
            <RoundToolButton label="Dictate"><MicIcon /></RoundToolButton>
            <button
              type="button"
              disabled={disabled || !draft.trim()}
              onClick={submit}
              className="flex size-8 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-muted)] transition-colors enabled:bg-[var(--text-primary)] enabled:text-[var(--surface-root)]"
              aria-label="Send"
            >
              <ArrowUpIcon />
            </button>
          </div>
        </div>
      </div>

      {!compact && (
        <div className="mx-auto mt-3.5 grid w-[76%] max-w-[680px] min-w-0 grid-cols-[1fr_1fr_1.36fr_0.78fr_0.68fr] gap-2">
          {actionChips.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                setDraft(action.prompt)
                requestAnimationFrame(() => ref.current?.focus())
              }}
              className="flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-[var(--surface-panel)] px-2 text-[11.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
            >
              <ActionIcon name={action.icon} />
              <span className="truncate">{action.label}</span>
            </button>
          ))}
        </div>
      )}
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
  if (name === 'desktop') return <DesktopChipIcon />
  if (name === 'magic') return <MagicIcon />
  return <MoreIcon />
}

function PlusIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M9 4v10M4 9h10" /></svg>
}

function ToolsIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3v5M4.5 4.5h3M12 10v5M10.5 13.5h3M6 12h6" /></svg>
}

function DesktopIcon() {
  return <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="12" height="8" rx="1.5" /><path d="M7 15h4M9 12v3" /></svg>
}

function VoiceIcon() {
  return <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 7v4M9 5v8M13 7v4" /></svg>
}

function MicIcon() {
  return <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="6.5" y="3" width="5" height="8" rx="2.5" /><path d="M4 9a5 5 0 0 0 10 0M9 14v2" /></svg>
}

function ArrowUpIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14V4M5 8l4-4 4 4" /></svg>
}

function SlidesIcon() {
  return <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="10" height="10" rx="1.8" /><path d="M7 8h4M7 11h3" /></svg>
}

function CodeIcon() {
  return <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 5-4 4 4 4M11 5l4 4-4 4" /></svg>
}

function DesktopChipIcon() {
  return <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="12" height="8" rx="1.5" /><path d="M7 15h4M9 12.5V15" /></svg>
}

function MagicIcon() {
  return <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 14 8-8M10 4l4 4M3 5h2M5 3v2M13 12h2M15 10v2" /></svg>
}

function MoreIcon() {
  return <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M5 9h.01M9 9h.01M13 9h.01" /></svg>
}
