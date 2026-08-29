import type { ReactNode } from 'react'

export function PageHeader({
  actions,
  badge,
}: {
  title: string
  description?: string
  actions?: ReactNode
  badge?: ReactNode
}) {
  if (!actions && !badge) return null

  return (
    <div className="console-page-header console-page-header--compact">
      {badge ? <div className="console-page-header__badge">{badge}</div> : null}
      {actions ? <div className="console-page-header__actions">{actions}</div> : null}
    </div>
  )
}
