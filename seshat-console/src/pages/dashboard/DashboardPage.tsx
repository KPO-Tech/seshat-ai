import { Card, Empty, Skeleton, Tag, Typography } from 'antd'
import {
  ApartmentOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import {
  useOrganizationsCount,
  useUsersCount,
  useSessionsCount,
  useRecentAuditEvents,
} from '@/api/dashboard'
import { useAuthStore } from '@/store/auth'
import { palette, monoStack } from '@/theme/tokens'

function timeAgo(iso?: string): string {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const orgs = useOrganizationsCount()
  const users = useUsersCount()
  const sessions = useSessionsCount()
  const recentEvents = useRecentAuditEvents(8)

  return (
    <div>
      <PageHeader
        title={`Welcome back${user?.display_name ? `, ${user.display_name.split(' ')[0]}` : ''}`}
        description="An overview of your Seshat control plane."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatTile label="Organizations" value={orgs.data} loading={orgs.isLoading} icon={<ApartmentOutlined />} />
        <StatTile label="Users" value={users.data} loading={users.isLoading} icon={<TeamOutlined />} />
        <StatTile
          label="Active sessions"
          value={sessions.data}
          loading={sessions.isLoading}
          icon={<SafetyCertificateOutlined />}
        />
      </div>

      <Card
        title={
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            <ClockCircleOutlined style={{ marginRight: 8, color: palette.inkTertiary }} />
            Recent activity
          </span>
        }
        styles={{ body: { padding: 0 } }}
      >
        {recentEvents.isLoading ? (
          <div style={{ padding: 20 }}>
            <Skeleton active paragraph={{ rows: 4 }} />
          </div>
        ) : recentEvents.data && recentEvents.data.length > 0 ? (
          <div>
            {recentEvents.data.map((event, index) => (
              <div
                key={event.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '12px 20px',
                  borderTop: index === 0 ? 'none' : `1px solid ${palette.border}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Tag color="default" style={{ fontFamily: monoStack, fontSize: 12, margin: 0 }}>
                    {event.action}
                  </Tag>
                  <Typography.Text
                    style={{ fontSize: 13, color: palette.inkSecondary }}
                    ellipsis={{ tooltip: `${event.resource_type} ${event.resource_id}` }}
                  >
                    {event.resource_type}
                    {event.resource_id ? ` · ${event.resource_id}` : ''}
                  </Typography.Text>
                </div>
                <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary, flexShrink: 0 }}>
                  {timeAgo(event.created_at)}
                </Typography.Text>
              </div>
            ))}
          </div>
        ) : (
          <Empty description="No activity yet" style={{ padding: 32 }} />
        )}
      </Card>
    </div>
  )
}
