import { useEffect } from 'react'
import { Avatar, Button, Dropdown, Layout, Menu, Space, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons'
import { Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useOrganizationsList } from '@/api/organizations'
import { useLogout } from '@/api/auth'
import { OrganizationSelect } from '@/components/OrganizationSelect'
import {
  accountNavItems,
  getActivePrimaryNavItem,
  getActiveSecondaryNavItem,
  getOrganizationNavItems,
  getScopeTagLabel,
  getSecondaryNavItems,
  platformNavItems,
  workspaceNavItems,
} from '@/layout/nav'
import { useAuthStore } from '@/store/auth'
import { useWorkspaceOrganizationStore } from '@/store/workspaceOrganization'
import { palette } from '@/theme/tokens'

const { Sider, Header, Content } = Layout
const EMPTY_ORGANIZATIONS: Array<{ id: string; name: string }> = []

export function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useLogout()
  const selectedOrganizationId = useWorkspaceOrganizationStore((state) => state.organizationId)
  const setSelectedOrganizationId = useWorkspaceOrganizationStore((state) => state.setOrganizationId)
  const { data: organizationsData } = useOrganizationsList({ sort: 'name', order: 'asc', limit: 200 })

  const organizations = organizationsData?.organizations ?? EMPTY_ORGANIZATIONS
  const routeOrganizationId = matchPath('/orgs/:organizationId/*', location.pathname)?.params.organizationId ?? null
  const fallbackOrganizationId = organizations[0]?.id ?? null
  const selectedOrganizationExists = selectedOrganizationId
    ? organizations.some((organization) => organization.id === selectedOrganizationId)
    : false

  useEffect(() => {
    if (routeOrganizationId) {
      if (selectedOrganizationId !== routeOrganizationId) {
        setSelectedOrganizationId(routeOrganizationId)
      }
      return
    }

    if (!fallbackOrganizationId) return

    if (!selectedOrganizationId || !selectedOrganizationExists) {
      setSelectedOrganizationId(fallbackOrganizationId)
    }
  }, [
    fallbackOrganizationId,
    routeOrganizationId,
    selectedOrganizationExists,
    selectedOrganizationId,
    setSelectedOrganizationId,
  ])

  const workspaceOrganizationId = routeOrganizationId ?? selectedOrganizationId ?? fallbackOrganizationId
  const organizationNavItems = workspaceOrganizationId ? getOrganizationNavItems(workspaceOrganizationId) : []
  const activePrimary = getActivePrimaryNavItem(location.pathname, workspaceOrganizationId)
  const secondaryNavItems = getSecondaryNavItems(location.pathname, workspaceOrganizationId)
  const activeSecondary = getActiveSecondaryNavItem(location.pathname, secondaryNavItems)
  const isAdmin = Boolean(user?.is_admin)

  const menuItems = [
    ...(isAdmin
      ? [
          {
            key: 'platform-group',
            type: 'group' as const,
            label: 'Platform',
            children: platformNavItems.map((item) => ({ key: item.key, label: item.label, icon: item.icon })),
          },
        ]
      : []),
    {
      key: 'personal-group',
      type: 'group' as const,
      label: 'Personal',
      children: [...workspaceNavItems, ...accountNavItems].map((item) => ({
        key: item.key,
        label: item.label,
        icon: item.icon,
      })),
    },
    ...(organizationNavItems.length > 0
      ? [
          {
            key: 'organization-group',
            type: 'group' as const,
            label: 'Organization',
            children: organizationNavItems.map((item) => ({ key: item.key, label: item.label, icon: item.icon })),
          },
        ]
      : []),
  ]

  const primaryItems = [
    ...(isAdmin ? platformNavItems : []),
    ...workspaceNavItems,
    ...accountNavItems,
    ...organizationNavItems,
  ]

  const navigateToOrganization = (nextOrganizationId: string | undefined) => {
    if (!nextOrganizationId) return
    setSelectedOrganizationId(nextOrganizationId)

    if (routeOrganizationId) {
      const suffix = location.pathname.replace(`/orgs/${routeOrganizationId}`, '') || '/overview'
      navigate(`/orgs/${nextOrganizationId}${suffix}`)
      return
    }

    navigate(`/orgs/${nextOrganizationId}/overview`)
  }

  return (
    <Layout className="console-shell" style={{ minHeight: '100vh', background: palette.canvas }}>
      <Sider
        theme="dark"
        width={272}
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowX: 'hidden',
          overflowY: 'auto',
          borderRight: `1px solid ${palette.border}`,
        }}
      >
        <div
          style={{
            color: palette.ink,
            fontWeight: 600,
            fontSize: 15,
            padding: '22px 20px 18px',
            letterSpacing: 0.1,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              background: palette.accent,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: '#1F1D22',
              flexShrink: 0,
            }}
          >
            S
          </span>
          Seshat Console
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          <div
            style={{
              padding: 14,
              border: `1px solid ${palette.border}`,
              borderRadius: 12,
              background: palette.surface,
            }}
          >
            <Typography.Text style={{ display: 'block', fontSize: 12, color: palette.inkTertiary, marginBottom: 8 }}>
              Organization
            </Typography.Text>
            <OrganizationSelect
              value={workspaceOrganizationId ?? undefined}
              onChange={navigateToOrganization}
              placeholder="Choose organization"
              style={{ width: '100%', minWidth: 0 }}
            />
          </div>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={activePrimary ? [activePrimary.key] : []}
          items={menuItems}
          style={{ borderInlineEnd: 'none' }}
          onClick={({ key }) => {
            const target = primaryItems.find((item) => item.key === key)
            if (target) navigate(target.path)
          }}
        />
      </Sider>

      <Layout style={{ minWidth: 0 }}>
        <Header
          style={{
            background: palette.surface,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            borderBottom: `1px solid ${palette.border}`,
            minHeight: 56,
            height: 56,
            lineHeight: 'normal',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>
            <Space size={8} align="center" wrap={false} style={{ maxWidth: '100%' }}>
              {isAdmin && routeOrganizationId && (
                <Button size="small" type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/platform/overview')}>
                  Back to platform
                </Button>
              )}
              <Tag color="orange" style={{ margin: 0, flexShrink: 0 }}>
                {getScopeTagLabel(location.pathname)}
              </Tag>
              <Typography.Text strong style={{ fontSize: 16, color: palette.ink }} ellipsis>
                {activePrimary?.label ?? 'Console'}
              </Typography.Text>
            </Space>
          </div>

          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'profile',
                  icon: <UserOutlined />,
                  label: 'My Account',
                  onClick: () => navigate('/me/profile'),
                },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: 'Log out',
                  onClick: () => logout.mutate(),
                },
              ],
            }}
          >
            <Space size={10} style={{ cursor: 'pointer', flexShrink: 0, maxWidth: '100%' }}>
              <Avatar size="small" style={{ background: palette.accentSoft, color: palette.accent }} icon={<UserOutlined />} />
              <Typography.Text className="console-user-label" style={{ fontSize: 13 }}>
                {user?.display_name ?? user?.email}
              </Typography.Text>
            </Space>
          </Dropdown>
        </Header>

        {secondaryNavItems.length > 1 && (
          <div
            className="console-subnav"
            style={{
              padding: '0 24px',
              background: palette.surface,
              borderBottom: `1px solid ${palette.borderSubtle}`,
            }}
          >
            <Menu
              mode="horizontal"
              selectedKeys={activeSecondary ? [activeSecondary.key] : []}
              items={secondaryNavItems.map((item) => ({ key: item.key, label: item.label }))}
              style={{ background: 'transparent', borderBottom: 'none', minWidth: 'max-content' }}
              onClick={({ key }) => {
                const target = secondaryNavItems.find((item) => item.key === key)
                if (target) navigate(target.path)
              }}
            />
          </div>
        )}

        <Content className="console-content" style={{ padding: 28, width: '100%', minWidth: 0 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
