import { ApartmentOutlined, CrownOutlined, MessageOutlined, LinkOutlined, ArrowRightOutlined } from '@ant-design/icons'
import { Card, Typography, Button } from 'antd'
import { useNavigate, useParams } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { useAuthStore } from '@/store/auth'
import { palette } from '@/theme/tokens'

export function WorkspaceOverviewPage() {
  const navigate = useNavigate()
  const { organizationId } = useParams<{ organizationId: string }>()
  const user = useAuthStore((state) => state.user)
  const organizations = useAuthStore((state) => state.organizations)
  const memberships = useAuthStore((state) => state.memberships)

  return (
    <div>
      <PageHeader
        title="Personal Workspace"
        description="Your personal interaction environment for real-time assistant execution, model testing, and third-party account connections."
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 28,
        }}
      >
        <StatTile
          label="Organizations"
          value={organizations.length}
          icon={<ApartmentOutlined />}
          sublabel="Available scopes"
        />
        <StatTile
          label="Memberships"
          value={memberships.length}
          icon={<CrownOutlined />}
          sublabel="Active roles"
        />
        <StatTile
          label="Platform Admin"
          value={user?.is_admin ? 'Admin' : 'Member'}
          icon={<CrownOutlined />}
          sublabel="Access level"
        />
      </div>

      <Typography.Title level={5} style={{ marginBottom: 16, color: palette.ink }}>
        Quick Launch
      </Typography.Title>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 16,
        }}
      >
        <Card
          hoverable
          className="stat-card"
          styles={{ body: { padding: '24px 22px' } }}
          onClick={() => navigate(`/orgs/${organizationId}/workspace/chat`)}
          style={{ cursor: 'pointer', borderRadius: 14 }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: palette.accentSoft,
                border: `1px solid ${palette.accentSoftBorder}`,
                color: palette.accentHover,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              <MessageOutlined />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: palette.ink, marginBottom: 4 }}>
                Chat Assistant
              </div>
              <div style={{ fontSize: 13, color: palette.inkSecondary, lineHeight: 1.5, marginBottom: 14 }}>
                Interact directly with configured LLMs, trigger search tools, and query knowledge corpora.
              </div>
              <Button type="link" style={{ padding: 0, color: palette.accentHover, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Open Chat <ArrowRightOutlined style={{ fontSize: 11 }} />
              </Button>
            </div>
          </div>
        </Card>

        <Card
          hoverable
          className="stat-card"
          styles={{ body: { padding: '24px 22px' } }}
          onClick={() => navigate(`/orgs/${organizationId}/workspace/connections`)}
          style={{ cursor: 'pointer', borderRadius: 14 }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: palette.infoSoft,
                border: `1px solid ${palette.info}44`,
                color: palette.info,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              <LinkOutlined />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: palette.ink, marginBottom: 4 }}>
                App Connections
              </div>
              <div style={{ fontSize: 13, color: palette.inkSecondary, lineHeight: 1.5, marginBottom: 14 }}>
                Manage personal OAuth tokens and third-party tool authorisations.
              </div>
              <Button type="link" style={{ padding: 0, color: palette.info, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                View Connections <ArrowRightOutlined style={{ fontSize: 11 }} />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

