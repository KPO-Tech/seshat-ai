type Props = {
  icon: React.ReactNode
  onClick?: () => void
  title?: string
  variant?: 'ghost' | 'bordered'
  size?: number
  className?: string
  active?: boolean
  activeColor?: 'orange' | 'green' | 'red'
}

export function IconButton({ icon, onClick, title, variant = 'ghost', size = 32, className, active, activeColor = 'orange' }: Props) {
  const activeClass = active
    ? activeColor === 'green'
      ? ' icon-btn--active-green'
      : activeColor === 'red'
        ? ' icon-btn--active-red'
        : ' icon-btn--active'
    : ''
  return (
    <button
      className={`icon-btn icon-btn--${variant}${activeClass} ${className ?? ''}`}
      style={{ width: size, height: size }}
      onClick={onClick}
      aria-label={title}
    >
      {icon}
    </button>
  )
}

export const ICON_BUTTON_CSS = `
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}

.icon-btn--ghost {
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
}

.icon-btn--ghost:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.icon-btn--bordered {
  background: transparent;
  border: 1px solid var(--color-border-subtle);
  color: var(--color-text-secondary);
}

.icon-btn--bordered:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.icon-btn--active {
  background: rgba(239, 124, 47, 0.12) !important;
  color: var(--color-accent) !important;
  border-color: rgba(239, 124, 47, 0.3) !important;
}

.icon-btn--active-green {
  background: rgba(var(--color-success-rgb), 0.1) !important;
  color: var(--color-success) !important;
  border-color: rgba(var(--color-success-rgb), 0.25) !important;
}

.icon-btn--active-red {
  background: rgba(var(--color-error-rgb), 0.12) !important;
  color: var(--color-error) !important;
  border-color: rgba(var(--color-error-rgb), 0.3) !important;
}
`
