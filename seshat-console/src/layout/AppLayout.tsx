import { Layout, Menu, Dropdown, Avatar, Space, Typography } from 'antd'
import { UserOutlined, LogoutOutlined } from '@ant-design/icons'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { useLogout } from '@/api/auth'
import { navGroups } from '@/layout/nav'

const { Sider, Header, Content } = Layout

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useLogout()

  const selectedKey = navGroups
    .flatMap((g) => g.items)
    .find((item) => location.pathname.startsWith(item.path))?.key

  const menuItems = navGroups.map((group) => ({
    key: group.key,
    label: group.label,
    type: 'group' as const,
    children: group.items.map((item) => ({ key: item.key, label: item.label })),
  }))

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark" width={220}>
        <div
          style={{
            color: '#fff',
            fontWeight: 600,
            fontSize: 16,
            padding: '16px 20px',
            letterSpacing: 0.2,
          }}
        >
          Seshat Console
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={selectedKey ? [selectedKey] : []}
          items={menuItems}
          onClick={({ key }) => {
            const target = navGroups.flatMap((g) => g.items).find((item) => item.key === key)
            if (target) navigate(target.path)
          }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingInline: 24,
            borderBottom: '1px solid #eee',
          }}
        >
          <Dropdown
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
              <Avatar size="small" icon={<UserOutlined />} />
              <Typography.Text>{user?.display_name ?? user?.email}</Typography.Text>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
