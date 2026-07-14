import { Typography } from 'antd'
import { ToolOutlined } from '@ant-design/icons'
import { PageHeader } from '@/components/PageHeader'
import { palette } from '@/theme/tokens'

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '64px 24px',
          border: `1px dashed ${palette.border}`,
          borderRadius: 12,
          background: palette.surface,
        }}
      >
        <ToolOutlined style={{ fontSize: 28, color: palette.inkTertiary, marginBottom: 12 }} />
        <Typography.Text style={{ color: palette.inkSecondary }}>Not built yet</Typography.Text>
        <Typography.Text style={{ color: palette.inkTertiary, fontSize: 12, marginTop: 4 }}>
          See docs/casdoor-frontend-mapping.md for the planned build order
        </Typography.Text>
      </div>
    </div>
  )
}
