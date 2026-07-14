import type { ReactNode } from 'react'
import { Typography } from 'antd'

/** Consistent title/description/actions row, reused across every domain page. */
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
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 20,
      }}
    >
      <div>
        <Typography.Title level={4} style={{ margin: 0, fontWeight: 600 }}>
          {title}
        </Typography.Title>
        {description && (
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {description}
          </Typography.Text>
        )}
      </div>
      {actions}
    </div>
  )
}
