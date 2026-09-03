import type { ReactNode } from 'react'

// No title prop - the layout's own breadcrumb (AppLayout.tsx's
// console-topbar__scope) already names the current page, right above this
// header; a second, bigger heading repeating it was pure duplication
// (removed 2026-09-03, after title/description briefly started actually
// rendering and made that obvious on every page).
export function PageHeader({
  description,
  actions,
  badge,
}: {
  description?: string
  actions?: ReactNode
  badge?: ReactNode
}) {
  return (
    <div className="console-page-header console-page-header--compact">
      {description ? (
        <div className="console-page-header__meta">
          <p className="console-page-header__description">{description}</p>
        </div>
      ) : null}
      {badge ? <div className="console-page-header__badge">{badge}</div> : null}
      {actions ? <div className="console-page-header__actions">{actions}</div> : null}
    </div>
  )
}
