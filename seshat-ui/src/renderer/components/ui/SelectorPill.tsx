import type { ReactNode } from 'react'
import { Down, CheckCorrect } from '@icon-park/react'

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
      <Down size={10} />
    </button>
  )
}

export type SelectorOption = {
  id: string
  label: string
  disabled?: boolean
  description?: string
}

type SelectorMenuProps = {
  options: SelectorOption[]
  selectedId?: string | null
  onSelect: (id: string) => void
  align?: 'left' | 'right'
  // 'up' for triggers near the bottom of the screen (e.g. ChatInput) so the
  // menu doesn't render off-screen — 'down' (default) suits ChatTopBar.
  placement?: 'down' | 'up'
}

// Small dropdown shared by every "pick one of N options, checkmark on the
// current one" control (Provider, Model, Permission) — used by both
// ChatTopBar and ChatInput.
export function SelectorMenu({ options, selectedId, onSelect, align = 'left', placement = 'down' }: SelectorMenuProps) {
  return (
    <div className={`selector-menu selector-menu--${align} selector-menu--${placement}`}>
      {options.map((option) => (
        <button
          key={option.id}
          className={`selector-menu-item${option.id === selectedId ? ' active' : ''}`}
          disabled={option.disabled}
          onClick={() => !option.disabled && onSelect(option.id)}
          type="button"
        >
          <span className="selector-menu-copy">
            <span>{option.label}</span>
            {option.description && (
              <span className="selector-menu-description">{option.description}</span>
            )}
          </span>
          {option.id === selectedId && <CheckCorrect size={12} />}
        </button>
      ))}
    </div>
  )
}

export const SELECTOR_PILL_CSS = `
.selector-pill {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
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
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--color-text);
}

.selector-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 180px;
  padding: var(--space-3);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-subtle);
  background: var(--color-menu-bg);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  z-index: 30;
}

.selector-menu--right {
  left: auto;
  right: 0;
}

.selector-menu--up {
  top: auto;
  bottom: calc(100% + 6px);
}

.selector-menu-item {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: 7px var(--space-5);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.selector-menu-copy {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.selector-menu-description {
  font-size: var(--font-size-2xs);
  line-height: 1.35;
  color: var(--color-text-muted);
  font-weight: 400;
}

.selector-menu-item:hover {
  background: var(--color-hover);
}

.selector-menu-item.active {
  background: var(--color-primary-subtle);
  color: var(--color-accent);
}

.selector-menu-item:disabled {
  opacity: 0.6;
  cursor: default;
}

.selector-menu-item:disabled:hover {
  background: transparent;
}
`
