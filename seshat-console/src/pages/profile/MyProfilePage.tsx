import { Avatar, Card, Empty, Space, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { ApartmentOutlined, CrownOutlined, MailOutlined, RightOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router'
import type { Organization } from '@/api/organizations'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useAuthStore } from '@/store/auth'
import { ROLE_COLORS, formatRoleLabel } from '@/lib/roles'
import { presentDateTime } from '@/lib/present'
import { palette } from '@/theme/tokens'

/**
 * Personal account page - shows the currently logged-in user's own info and
 * organization access, whoever they are (platform admin, org owner/admin,
 * or a plain member). Reachable from the avatar menu, never admin-gated:
 * this is "mine," the same trust level as /auth/me.
 */
export function MyProfilePage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const organizations = useAuthStore((s) => s.organizations)
  const memberships = useAuthStore((s) => s.memberships)

  const roleByOrgId = new Map(memberships.map((m) => [m.organization_id, m.role]))
  // For a platform admin, the auth store's `organizations` is the full
  // platform-wide list (see handleMe/ListOrganizations server-side), not just
  // their own memberships - filter down to orgs they actually belong to, same
  // as MyOrganizationsPage.tsx does implicitly for non-admins.
  const myOrganizations = organizations.filter((org) => roleByOrgId.has(org.id!))

  const columns: TableProps<Organization>['columns'] = [
    {
      title: 'Organization',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space align="start" size={12}>
          <Avatar
            size={28}
            style={{ background: palette.accentSoft, color: palette.accent, fontWeight: 700, fontSize: 11 }}
          >
            {name?.slice(0, 2).toUpperCase()}
          </Avatar>
          <div style={{ minWidth: 0 }}>
            <Typography.Text strong style={{ display: 'block' }}>
              {name}
            </Typography.Text>
            <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>/{record.slug}</Typography.Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Your role',
      key: 'role',
      render: (_, record) => {
        const role = roleByOrgId.get(record.id!)
        return <Tag color={ROLE_COLORS[role ?? ''] ?? 'default'}>{formatRoleLabel(role)}</Tag>
      },
    },
    {
      title: '',
      key: 'actions',
      width: 140,
      render: (_, record) => (
        <RightOutlined style={{ color: palette.inkTertiary }} aria-label={`Enter ${record.name}`} />
      ),
    },
  ]

  return (
    <div>
      <PageHeader description="Your account and organization access." />

      <Card style={{ marginBottom: 24 }}>
        <Space align="start" size={20}>
          <Avatar size={64} style={{ background: palette.accentSoft, color: palette.accent, fontSize: 22, fontWeight: 700 }}>
            {(user?.display_name ?? user?.email ?? '?').slice(0, 2).toUpperCase()}
          </Avatar>
          <div>
            <Space size={10} align="center">
              <Typography.Title level={4} style={{ margin: 0 }}>
                {user?.display_name ?? 'Unknown'}
              </Typography.Title>
              {user?.is_admin && (
                <Tag color="gold" icon={<CrownOutlined />} style={{ margin: 0 }}>
                  Platform Admin
                </Tag>
              )}
            </Space>
            <Space size={6} style={{ marginTop: 6, color: palette.inkSecondary }}>
              <MailOutlined />
              <Typography.Text style={{ color: palette.inkSecondary }}>{user?.email}</Typography.Text>
            </Space>
            <Typography.Text style={{ display: 'block', marginTop: 6, fontSize: 12, color: palette.inkTertiary }}>
              Member since {presentDateTime(user?.created_at, 'Unknown')}
            </Typography.Text>
          </div>
        </Space>
      </Card>

      <Card title="Organization access" styles={{ body: { padding: 0 } }}>
        <ConsoleTable<Organization>
          rowKey="id"
          columns={columns}
          dataSource={myOrganizations}
          pagination={false}
          onRow={(record) => ({
            onClick: () => navigate(`/orgs/${record.id}/overview`),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <Empty
                image={<ApartmentOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description="Not a member of any organization yet"
                style={{ padding: '40px 0' }}
              />
            ),
          }}
        />
      </Card>
    </div>
  )
}
