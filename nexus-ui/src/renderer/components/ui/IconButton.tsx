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
      title={title}
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
  background: rgba(52, 211, 153, 0.1) !important;
  color: #34d399 !important;
  border-color: rgba(52, 211, 153, 0.25) !important;
}

.icon-btn--active-red {
  background: rgba(239, 68, 68, 0.12) !important;
  color: #ef4444 !important;
  border-color: rgba(239, 68, 68, 0.3) !important;
}
`
