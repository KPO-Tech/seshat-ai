import { Avatar, Empty, Space, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { ApartmentOutlined, RightOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router'
import type { Organization } from '@/api/organizations'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useAuthStore } from '@/store/auth'
import { ROLE_COLORS, formatRoleLabel } from '@/lib/roles'
import { palette } from '@/theme/tokens'

/**
 * Landing page for a non-admin user who belongs to more than one
 * organization - scoped to their own memberships only (from the auth store,
 * already populated at login), never the platform-wide organizations list.
 */
export function MyOrganizationsPage() {
  const navigate = useNavigate()
  const organizations = useAuthStore((s) => s.organizations)
  const memberships = useAuthStore((s) => s.memberships)

  const roleByOrgId = new Map(memberships.map((m) => [m.organization_id, m.role]))

  const columns: TableProps<Organization>['columns'] = [
    {
      title: 'Organization',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space align="start" size={12}>
          <Avatar
            size={32}
            style={{ background: palette.accentSoft, color: palette.accent, fontWeight: 700, fontSize: 12 }}
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
      <PageHeader />

      <ConsoleTable<Organization>
        rowKey="id"
        columns={columns}
        dataSource={organizations}
        pagination={false}
        onRow={(record) => ({
          onClick: () => navigate(`/orgs/${record.id}/overview`),
          style: { cursor: 'pointer' },
        })}
        locale={{
          emptyText: (
            <Empty
              image={<ApartmentOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
              description="No organizations yet"
              style={{ padding: '40px 0' }}
            />
          ),
        }}
      />
    </div>
  )
}
