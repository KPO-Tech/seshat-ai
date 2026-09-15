import type { ReactNode } from 'react'

export function ConfigCard({ title, description, status, children, action }: { title: string; description: string; status?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex items-start justify-between gap-5 border-b border-[var(--border-soft)] px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
            {status}
          </div>
          <p className="mt-1 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">{description}</p>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function StatusPill({ tone, children }: { tone: 'ok' | 'muted' | 'warn'; children: ReactNode }) {
  return (
    <span
      className={[
        'inline-flex h-6 items-center rounded-md px-2 text-[11px] font-semibold',
        tone === 'ok' ? 'bg-[var(--accent-success)]/10 text-[var(--accent-success)]' : '',
        tone === 'warn' ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]' : '',
        tone === 'muted' ? 'bg-[var(--surface-muted)] text-[var(--text-muted)]' : ''
      ].join(' ')}
    >
      {children}
    </span>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1.5">
      <span className="text-[12px] font-semibold text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        'h-10 min-w-0 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)]',
        props.className ?? ''
      ].join(' ')}
    />
  )
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        'h-10 min-w-0 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 text-[13px] font-semibold text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-primary)]',
        props.className ?? ''
      ].join(' ')}
    />
  )
}

export function SoftButton({ children, tone = 'default', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'primary' | 'danger' | 'success' }) {
  return (
    <button
      {...props}
      className={[
        'inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-[12px] font-semibold transition-colors disabled:cursor-default disabled:opacity-45',
        tone === 'default' ? 'border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--text-primary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-panel)]' : '',
        tone === 'primary' ? 'border-[var(--accent-primary)]/35 bg-[var(--accent-primary)]/12 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/18' : '',
        tone === 'danger' ? 'border-[var(--accent-danger)]/40 bg-[var(--accent-danger)]/10 text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/15' : '',
        tone === 'success' ? 'border-[var(--accent-success)]/35 bg-[var(--accent-success)]/10 text-[var(--accent-success)]' : '',
        props.className ?? ''
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className={[
        'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
        enabled ? 'justify-end bg-[var(--accent-primary)]' : 'justify-start bg-[var(--surface-muted)]'
      ].join(' ')}
      aria-pressed={enabled}
    >
      <span className="size-4 rounded-full bg-white" />
    </button>
  )
}

export function ResultMessage({ state, error, latency }: { state: 'idle' | 'running' | 'ok' | 'error'; error: string | null; latency: number | null }) {
  if (state === 'idle' || state === 'running') return null
  if (state === 'ok') {
    return <div className="rounded-md border border-[var(--accent-success)]/30 bg-[var(--accent-success)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-success)]">Connected in {latency ?? 0}ms.</div>
  }
  return <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">{error ?? 'Connection failed.'}</div>
}
