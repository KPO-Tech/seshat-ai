import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreOne } from '@icon-park/react'

export type OverflowMenuItem = {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
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
    <div className="relative inline-flex shrink-0" ref={wrapRef}>
      <button
        type="button"
        className={cx(
          'flex size-7 cursor-pointer items-center justify-center rounded-app-sm border border-app-border-subtle bg-transparent text-app-text-muted',
          'hover:bg-[var(--color-hover)] hover:text-app-text',
          open && 'bg-[var(--color-hover)] text-app-text',
        )}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value) }}
      >
        <MoreOne size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+var(--space-3))] z-20 flex min-w-40 flex-col rounded-app-md border border-[var(--color-border)] bg-app-surface p-[var(--space-3)] shadow-[var(--shadow-medium)]" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cx(
                'flex cursor-pointer items-center gap-[var(--space-4)] rounded-app-sm border-0 bg-transparent px-[var(--space-5)] py-[var(--space-4)] text-left text-xs text-app-text hover:bg-[var(--color-hover)] disabled:cursor-not-allowed disabled:opacity-50',
                item.danger && 'text-app-error hover:bg-[rgba(var(--color-error-rgb),0.1)]',
              )}
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
