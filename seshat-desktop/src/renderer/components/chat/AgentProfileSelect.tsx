import { useEffect, useRef, useState } from 'react'
import type { AgentProfileChoice } from './lib/useAgentProfiles'

type AgentProfileSelectProps = {
  choices: AgentProfileChoice[]
  value: string
  loading?: boolean
  disabled?: boolean
  onChange: (slug: string) => void
}

export function AgentProfileSelect({ choices, value, loading, disabled, onChange }: AgentProfileSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = choices.find((choice) => choice.slug === value) ?? null

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[15px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected ? selected.whenToUse || selected.name : 'Default Seshat agent'}
      >
        {selected?.name || 'Seshat'}
        <ChevronDownIcon />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-40 w-[280px] overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[0_18px_48px_rgba(0,0,0,0.36)]">
          <div className="border-b border-[var(--border-soft)] px-3 py-2">
            <div className="text-[12px] font-semibold text-[var(--text-primary)]">Workflow</div>
            <div className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">Which agent profile runs the next message.</div>
          </div>
          <div className="no-scrollbar max-h-[240px] overflow-y-auto p-1.5" role="listbox">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className={[
                'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors',
                value === '' ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
              ].join(' ')}
              role="option"
              aria-selected={value === ''}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold">Seshat</span>
                <span className="block truncate text-[10.5px] text-[var(--text-muted)]">Default agent</span>
              </span>
              {value === '' && <CheckIcon />}
            </button>
            {loading && <div className="px-2 py-2 text-[11px] text-[var(--text-muted)]">Loading agents…</div>}
            {!loading && choices.length === 0 && (
              <div className="px-2 py-2 text-[11px] text-[var(--text-muted)]">No custom agents configured yet.</div>
            )}
            {choices.map((choice) => (
              <button
                key={choice.slug}
                type="button"
                onClick={() => { onChange(choice.slug); setOpen(false) }}
                className={[
                  'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors',
                  choice.slug === value ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
                ].join(' ')}
                role="option"
                aria-selected={choice.slug === value}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold">{choice.name}</span>
                  {choice.whenToUse && <span className="block truncate text-[10.5px] text-[var(--text-muted)]">{choice.whenToUse}</span>}
                </span>
                {choice.slug === value && <CheckIcon />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 8 3 3 7-7" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 5.5 3 3 3-3" />
    </svg>
  )
}
