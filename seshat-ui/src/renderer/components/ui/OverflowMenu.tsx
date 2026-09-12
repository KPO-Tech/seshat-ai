import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreOne } from '@icon-park/react'

export type OverflowMenuItem = {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

// Generic kebab/overflow menu for a card's secondary actions - no shared
// version of this existed anywhere in the app before (only a private,
// outside-click-only one inside apps/skills-creator/components/SkillSidebar.tsx).
// Adds Escape-to-close on top of that same outside-click pattern. Positioned
// absolute within a relative wrapper anchored to the trigger, same approach
// SkillSidebar already uses successfully inside a scroll container.
export function OverflowMenu({ items, ariaLabel = 'More actions' }: { items: OverflowMenuItem[]; ariaLabel?: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointer(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div className="ov-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`ov-menu-trigger${open ? ' open' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value) }}
      >
        <MoreOne size={14} />
      </button>
      {open && (
        <div className="ov-menu" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`ov-menu-item${item.danger ? ' danger' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                setOpen(false)
                item.onClick()
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
