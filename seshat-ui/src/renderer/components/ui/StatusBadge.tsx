import type { ReactNode } from 'react'

type Variant = 'success' | 'error' | 'pending' | 'connected' | 'planned'

type Props = {
  label: string
  variant: Variant
  icon?: ReactNode
  className?: string
}

export function StatusBadge({ label, variant, icon, className }: Props) {
  return (
    <span className={`status-badge status-badge--${variant}${className ? ` ${className}` : ''}`}>
      {icon}
      {label}
    </span>
  )
}

export const STATUS_BADGE_CSS = `
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 7px;
}

.status-badge--success  { color: var(--color-success); }
.status-badge--error    { color: var(--color-error); }
.status-badge--pending  { color: var(--color-text-muted); }
.status-badge--connected { color: #00B42A; background: rgba(0, 180, 42, 0.08); }
.status-badge--planned {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 25%, transparent);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 10px;
}
`
