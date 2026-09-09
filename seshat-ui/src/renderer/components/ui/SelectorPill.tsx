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
  icon?: ReactNode
  prefix?: string
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
          {option.icon ? (
            <span className="selector-menu-provider-icon" aria-hidden="true">
              {option.icon}
            </span>
          ) : option.prefix && (
            <span className="selector-menu-prefix" aria-hidden="true">
              {option.prefix}
            </span>
          )}
          <span className="selector-menu-copy">
            <span>{option.label}</span>
          </span>
          {option.description && (
            <span className="selector-menu-description">{option.description}</span>
          )}
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
  max-width: 220px;
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
  overflow: hidden;
  text-overflow: ellipsis;
}

.selector-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 260px;
  max-width: min(320px, calc(100vw - 32px));
  max-height: min(252px, calc(100vh - 190px));
  overflow-y: auto;
  padding: 4px;
  border-radius: 0;
  border: 1px solid var(--color-border-subtle);
  background: color-mix(in srgb, var(--color-surface) 96%, var(--color-bg));
  box-shadow: 0 18px 48px rgba(31, 27, 23, 0.17);
  display: flex;
  flex-direction: column;
  gap: 0;
  z-index: 30;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--color-text-muted) 28%, transparent) transparent;
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
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  padding: 6px 7px;
  border-radius: 0;
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
  min-width: 0;
  min-height: 30px;
}

.selector-menu-copy {
  min-width: 0;
  flex: 1;
}

.selector-menu-copy > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.selector-menu-description {
  font-size: var(--font-size-2xs);
  line-height: 1;
  color: var(--color-text-muted);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
  max-width: 92px;
  text-align: right;
}

.selector-menu-provider-icon,
.selector-menu-prefix {
  width: 17px;
  height: 17px;
  border-radius: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.selector-menu-provider-icon svg {
  display: block;
  width: 17px;
  height: 17px;
}

.selector-menu-prefix {
  background: color-mix(in srgb, var(--color-primary) 13%, var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-primary) 20%, var(--color-border-subtle));
  color: var(--color-accent);
  font-size: 8px;
  font-weight: 800;
  text-transform: uppercase;
}

.selector-menu-item:hover {
  background: color-mix(in srgb, var(--color-surface-elevated) 48%, var(--color-surface));
  border-color: var(--color-border-subtle);
}

.selector-menu-item.active {
  background: color-mix(in srgb, var(--color-primary) 11%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-primary) 22%, var(--color-border-subtle));
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
