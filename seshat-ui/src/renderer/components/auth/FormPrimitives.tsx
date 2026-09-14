import type { ReactNode } from 'react'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[7px]">
      <label className="text-[13px] font-medium text-[var(--text-primary)]">{label}</label>
      {children}
    </div>
  )
}

type InputProps = {
  icon: ReactNode
  type: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  autoFocus?: boolean
  required?: boolean
}

export function InputWithIcon({ icon, type, value, onChange, placeholder, autoFocus, required }: InputProps) {
  return (
    <div className="flex h-11 items-center gap-2.5 rounded-[10px] border-[1.5px] border-[var(--border-base)] bg-[var(--bg-1)] px-3.5 transition-colors duration-150 focus-within:border-[var(--brand)]">
      <span className="flex shrink-0 text-[var(--text-disabled)]">{icon}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required={required}
        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[var(--text-primary)] outline-none [font-family:inherit] placeholder:text-[var(--text-disabled)]"
      />
    </div>
  )
}

export function EyeToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-3.5 top-1/2 flex -translate-y-1/2 cursor-pointer border-0 bg-transparent p-0 text-[var(--text-secondary)]"
      aria-label={visible ? 'Hide password' : 'Show password'}
    >
      {visible ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  )
}

export function CustomCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded border-2 transition-all duration-150',
        checked ? 'border-[var(--brand)] bg-[var(--brand)]' : 'border-[var(--bg-4)] bg-transparent',
      ].join(' ')}
      aria-pressed={checked}
    >
      {checked && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none" aria-hidden="true">
          <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}

export function PrimaryButton({
  children,
  loading,
  disabled,
  type = 'submit',
}: {
  children: ReactNode
  loading?: boolean
  disabled?: boolean
  type?: 'submit' | 'button'
}) {
  const inactive = disabled || loading
  return (
    <button
      type={type}
      disabled={inactive}
      className={[
        'flex h-[46px] w-full items-center justify-center gap-2 rounded-[10px] border-0 text-sm font-semibold tracking-[-0.1px] transition-opacity duration-150 [font-family:inherit]',
        inactive
          ? 'cursor-default bg-[var(--bg-4)] text-[var(--text-disabled)]'
          : 'cursor-pointer bg-[var(--text-primary)] text-[var(--bg-base)] hover:opacity-85',
      ].join(' ')}
    >
      {loading ? (
        <span className="inline-block size-4 animate-[spin_0.7s_linear_infinite] rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <>
          {children}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 7h12M8 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </>
      )}
    </button>
  )
}

export function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-[var(--text-disabled)]">
      <div className="h-px flex-1 bg-[var(--border-base)]" />
      or continue with
      <div className="h-px flex-1 bg-[var(--border-base)]" />
    </div>
  )
}

const OAUTH = [
  {
    name: 'Google',
    icon: (
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
  },
  {
    name: 'GitHub',
    icon: (
      <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
      </svg>
    ),
  },
  {
    name: 'Apple',
    icon: (
      <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
    ),
  },
]

export function OAuthButtons() {
  return (
    <div className="flex gap-2.5">
      {OAUTH.map(({ name, icon }) => (
        <button
          key={name}
          type="button"
          className="flex h-[42px] flex-1 cursor-pointer items-center justify-center gap-[7px] rounded-[9px] border-[1.5px] border-[var(--border-base)] bg-[var(--bg-1)] text-[13px] font-medium text-[var(--text-primary)] transition-all duration-150 [font-family:inherit] hover:border-[var(--bg-5)] hover:bg-[var(--bg-hover)]"
        >
          {icon}
          <span>{name}</span>
        </button>
      ))}
    </div>
  )
}

export function EmailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

export function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

export function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  )
}
