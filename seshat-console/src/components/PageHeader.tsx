import type { ReactNode } from 'react'

// No title, no description - the layout's own breadcrumb (AppLayout.tsx's
// console-topbar__scope) already names the current page, and the
// explanatory copy this used to carry was decided not worth the space
// (removed 2026-09-03). What's left is just a row for a page's own actions/
// badge, right-aligned under that breadcrumb.
export function PageHeader({
  actions,
  badge,
}: {
  actions?: ReactNode
  badge?: ReactNode
}) {
  return (
    <div className="console-page-header console-page-header--compact">
      {badge ? <div className="console-page-header__badge">{badge}</div> : null}
      {actions ? <div className="console-page-header__actions">{actions}</div> : null}
    </div>
  )
}
