import type { ReactNode } from 'react'
import { Typography } from 'antd'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="console-page-header">
      <div className="console-page-header__meta">
        <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>
          {title}
        </Typography.Title>
        {description && (
          <Typography.Text className="console-page-header__description" type="secondary">
            {description}
          </Typography.Text>
        )}
      </div>
      {actions ? <div className="console-page-header__actions">{actions}</div> : null}
    </div>
  )
}
