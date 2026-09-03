import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  actions,
  badge,
}: {
  // Optional - the layout's own breadcrumb (AppLayout.tsx's
  // console-topbar__scope) already names the current page, so a title here
  // is only worth passing when this page's actions/badge need a caption
  // that isn't just repeating that breadcrumb.
  title?: string
  description?: string
  actions?: ReactNode
  badge?: ReactNode
}) {
  return (
    <div className="console-page-header console-page-header--compact">
      {title ? (
        <div className="console-page-header__meta">
          <h1 className="console-page-header__title">{title}</h1>
          {description ? <p className="console-page-header__description">{description}</p> : null}
        </div>
      ) : null}
      {badge ? <div className="console-page-header__badge">{badge}</div> : null}
      {actions ? <div className="console-page-header__actions">{actions}</div> : null}
    </div>
  )
}
