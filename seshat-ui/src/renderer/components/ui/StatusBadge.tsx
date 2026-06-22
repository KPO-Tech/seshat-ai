type Variant = 'success' | 'error' | 'pending' | 'connected'

type Props = {
  label: string
  variant: Variant
}

export function StatusBadge({ label, variant }: Props) {
  return <span className={`status-badge status-badge--${variant}`}>{label}</span>
}

export const STATUS_BADGE_CSS = `
.status-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 7px;
}

.status-badge--success  { color: var(--color-success); }
.status-badge--error    { color: var(--color-error); }
.status-badge--pending  { color: var(--color-text-muted); }
.status-badge--connected { color: #00B42A; background: rgba(0, 180, 42, 0.08); }
`
