import { Layout, Menu, Dropdown, Avatar, Space, Typography } from 'antd'
import { UserOutlined, LogoutOutlined, CrownOutlined } from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useLogout } from '@/api/auth'
import { navGroups, dashboardNavItem, allNavItems, platformNavGroup, allPlatformNavItems } from '@/layout/nav'
import { palette } from '@/theme/tokens'

const { Sider, Header, Content } = Layout

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useLogout()
  const isAdmin = Boolean(user?.is_admin)

  const allItems = [dashboardNavItem, ...allNavItems, ...(isAdmin ? allPlatformNavItems : [])]
  const selectedKey = allItems.find((item) => location.pathname.startsWith(item.path))?.key

  const menuItems = [
    { key: dashboardNavItem.key, label: dashboardNavItem.label, icon: dashboardNavItem.icon },
    ...navGroups.map((group) => ({
      key: group.key,
      label: group.label,
      type: 'group' as const,
      // "Users" is platform-admin only server-side (requireAdmin) — hidden
      // here rather than left as a nav link that always 403s for everyone else.
      children: group.items
        .filter((item) => item.key !== 'users' || isAdmin)
        .map((item) => ({ key: item.key, label: item.label, icon: item.icon })),
    })),
    ...(isAdmin
      ? [
          {
            key: platformNavGroup.key,
            label: (
              <span>
                <CrownOutlined style={{ marginRight: 6 }} />
                {platformNavGroup.label}
              </span>
            ),
            type: 'group' as const,
            children: platformNavGroup.items.map((item) => ({ key: item.key, label: item.label, icon: item.icon })),
          },
        ]
      : []),
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={232} style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}>
        <div
          style={{
            color: '#fff',
            fontWeight: 600,
            fontSize: 15,
            padding: '20px 20px 16px',
            letterSpacing: 0.1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              background: palette.accent,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            S
          </span>
          Seshat Console
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKey ? [selectedKey] : []}
          items={menuItems}
          style={{ borderInlineEnd: 'none' }}
          onClick={({ key }) => {
            const target = allItems.find((item) => item.key === key)
            if (target) navigate(target.path)
          }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: palette.surface,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingInline: 24,
            borderBottom: `1px solid ${palette.border}`,
            height: 56,
          }}
        >
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: 'Log out',
                  onClick: () => logout.mutate(),
                },
              ],
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar size="small" style={{ background: palette.accentSoft, color: palette.accent }} icon={<UserOutlined />} />
              <Typography.Text style={{ fontSize: 13 }}>{user?.display_name ?? user?.email}</Typography.Text>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ padding: 28, width: '100%' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
