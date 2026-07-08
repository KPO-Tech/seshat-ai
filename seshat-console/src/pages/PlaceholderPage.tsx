import { Card, Typography } from 'antd'

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Card>
      <Typography.Title level={4}>{title}</Typography.Title>
      <Typography.Paragraph type="secondary">
        Not built yet — see docs/casdoor-frontend-mapping.md for the planned build order.
      </Typography.Paragraph>
    </Card>
  )
}
