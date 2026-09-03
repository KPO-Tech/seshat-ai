import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  actions,
  badge,
}: {
  title: string
  description?: string
  actions?: ReactNode
  badge?: ReactNode
}) {
  return (
    <div className="console-page-header console-page-header--compact">
      <div className="console-page-header__meta">
        <h1 className="console-page-header__title">{title}</h1>
        {description ? <p className="console-page-header__description">{description}</p> : null}
      </div>
      {badge ? <div className="console-page-header__badge">{badge}</div> : null}
      {actions ? <div className="console-page-header__actions">{actions}</div> : null}
    </div>
  )
}
