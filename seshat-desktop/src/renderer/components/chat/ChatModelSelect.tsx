import { useEffect, useRef, useState } from 'react'
import { ProviderIcon } from '@renderer/components/ui/ProviderIcon'
import type { ChatModelChoice } from './chatModels'

type ChatModelSelectProps = {
  choices: ChatModelChoice[]
  value: string
  loading?: boolean
  disabled?: boolean
  onChange: (id: string) => void
}

export function ChatModelSelect({ choices, value, loading, disabled, onChange }: ChatModelSelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = choices.find((choice) => choice.id === value) ?? choices.find((choice) => choice.selected) ?? choices[0] ?? null
  const unavailable = disabled || loading || choices.length === 0

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
        disabled={unavailable}
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 max-w-[210px] items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--surface-muted)] px-2.5 text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-55"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selected ? `${selected.providerName} - ${selected.modelId}` : 'Default model'}
      >
        {selected ? <ProviderIcon provider={selected.provider} size={18} className="shrink-0" /> : <ModelIcon />}
        <span className="truncate">{loading ? 'Models...' : selected?.label || 'Default model'}</span>
        <ChevronDownIcon />
      </button>

      {open && !unavailable && (
        <div className="absolute bottom-[calc(100%+8px)] left-0 z-40 w-[320px] overflow-hidden rounded-xl border border-[var(--border-soft)] bg-[var(--surface-panel)] shadow-[0_20px_60px_rgba(0,0,0,0.42)]">
          <div className="border-b border-[var(--border-soft)] px-3 py-2">
            <div className="text-[12px] font-semibold text-[var(--text-primary)]">Model</div>
            <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">Choose the model for the next message.</div>
          </div>
          <div className="no-scrollbar max-h-[280px] overflow-y-auto p-1.5" role="listbox">
            {choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => {
                  onChange(choice.id)
                  setOpen(false)
                }}
                className={[
                  'flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors',
                  choice.id === selected?.id
                    ? 'bg-[var(--surface-muted)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
                ].join(' ')}
                role="option"
                aria-selected={choice.id === selected?.id}
              >
                <ProviderIcon provider={choice.provider} size={28} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{choice.label}</span>
                  <span className="block truncate text-[11px] text-[var(--text-muted)]">{choice.providerName}</span>
                </span>
                {choice.id === selected?.id && <CheckIcon />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ModelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 2.5 14 5.5v5L9 13.5l-5-3v-5Z" />
      <path d="m4 5.5 5 3 5-3M9 8.5v5" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 8 3 3 7-7" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 5.5 3 3 3-3" />
    </svg>
  )
}
