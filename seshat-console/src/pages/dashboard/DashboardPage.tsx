import { Card, Empty, Skeleton, Tag, Typography } from 'antd'
import {
  ApartmentOutlined,
  TeamOutlined,
  SafetyCertificateOutlined,
  ClockCircleOutlined,
  CheckCircleFilled,
} from '@ant-design/icons'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import {
  useOrganizationsCount,
  useUsersCount,
  useSessionsCount,
  useRecentAuditEvents,
} from '@/api/dashboard'
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
  const orgs = useOrganizationsCount()
  const users = useUsersCount()
  const sessions = useSessionsCount()
  const recentEvents = useRecentAuditEvents(8)

  return (
    <div>
      <PageHeader
        title="Platform Overview"
        description="Real-time deployment metrics, active sessions, and cross-organization telemetry."
        badge={
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              borderRadius: 999,
              background: palette.successSoft,
              border: `1px solid rgba(34, 197, 94, 0.25)`,
              color: palette.success,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <CheckCircleFilled style={{ fontSize: 11 }} /> Systems Operational
          </span>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatTile
          label="Organizations"
          value={orgs.data}
          loading={orgs.isLoading}
          icon={<ApartmentOutlined />}
          sublabel="Active tenants"
        />
        <StatTile
          label="Platform Users"
          value={users.data}
          loading={users.isLoading}
          icon={<TeamOutlined />}
          sublabel="Total registered"
        />
        <StatTile
          label="Active Sessions"
          value={sessions.data}
          loading={sessions.isLoading}
          icon={<SafetyCertificateOutlined />}
          sublabel="Authenticated"
        />
      </div>

      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: palette.ink }}>
            <ClockCircleOutlined style={{ color: palette.accentHover }} />
            <span>Recent Platform Activity</span>
          </div>
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
                  borderTop: index === 0 ? 'none' : `1px solid ${palette.borderSubtle}`,
                  transition: 'background 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <Tag
                    style={{
                      fontFamily: monoStack,
                      fontSize: 11.5,
                      margin: 0,
                      background: 'rgba(30, 28, 26, 0.04)',
                      border: `1px solid ${palette.borderSubtle}`,
                      color: palette.inkSecondary,
                      borderRadius: 6,
                    }}
                  >
                    {event.action}
                  </Tag>
                  <Typography.Text
                    style={{ fontSize: 13, color: palette.ink }}
                    ellipsis={{ tooltip: `${event.resource_type} ${event.resource_id}` }}
                  >
                    <span style={{ color: palette.inkSecondary }}>{event.resource_type}</span>
                    {event.resource_id ? (
                      <span style={{ color: palette.accentSecondary, marginLeft: 6, fontFamily: monoStack, fontSize: 12 }}>
                        {event.resource_id}
                      </span>
                    ) : ''}
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

