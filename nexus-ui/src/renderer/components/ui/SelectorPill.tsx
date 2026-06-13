import type { ReactNode } from 'react'
import { Down } from '@icon-park/react'

type Props = {
  label: string
  icon?: ReactNode
  onClick?: () => void
  disabled?: boolean
}

export function SelectorPill({ label, icon, onClick, disabled = false }: Props) {
  return (
    <button className="selector-pill" onClick={onClick} disabled={disabled} type="button">
      {icon && <span className="selector-pill-icon">{icon}</span>}
      <span className="selector-pill-label">{label}</span>
      <Down size={12} />
    </button>
  )
}

export const SELECTOR_PILL_CSS = `
.selector-pill {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 10px;
  padding: 5px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.selector-pill:hover {
  background: var(--color-hover);
  border-color: var(--color-border);
}

.selector-pill:disabled {
  cursor: default;
  opacity: 0.7;
}

.selector-pill:disabled:hover {
  background: var(--color-surface);
  border-color: var(--color-border-subtle);
}

.selector-pill-icon {
  display: flex;
  align-items: center;
  color: var(--color-text-secondary);
}

.selector-pill-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
}
`
