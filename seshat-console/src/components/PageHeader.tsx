import type { ReactNode } from 'react'
import { Typography } from 'antd'

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
    <div className="console-page-header">
      <div className="console-page-header__meta">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Typography.Title level={4} className="console-page-header__title">
            {title}
          </Typography.Title>
          {badge}
        </div>
        {description && (
          <Typography.Text className="console-page-header__description">
            {description}
          </Typography.Text>
        )}
      </div>
      {actions ? <div className="console-page-header__actions">{actions}</div> : null}
    </div>
  )
}

