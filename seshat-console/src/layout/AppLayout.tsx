import { useEffect } from 'react'
import { Avatar, Button, Dropdown, Layout, Menu, Space, Tag, Typography } from 'antd'
import { ArrowLeftOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons'
import { Outlet, matchPath, useLocation, useNavigate } from 'react-router'
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
  // The generic "Organization" scope tag alone doesn't say WHICH one when
  // there's more than one on the platform (a platform admin browsing
  // several orgs in a row has no other always-visible indicator beyond the
  // sidebar dropdown's current value) - so every org-scoped page's header
  // names it explicitly, not just the Overview page.
  const routeOrganizationName = routeOrganizationId
    ? (organizations.find((organization) => organization.id === routeOrganizationId)?.name ?? null)
    : null
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
  // The org group/sidebar should only take over once you're actually inside
  // an organization's routes (routeOrganizationId) — not whenever there
  // happens to be a fallback-selected org, which used to make "Organization"
  // (and hiding "Platform" below) leak into pages like /platform/overview
  // that have nothing to do with any single org.
  const inOrganizationRoute = Boolean(routeOrganizationId)
  // Mirrors inOrganizationRoute's own reasoning: the picker is only
  // meaningful where something on screen actually reads
  // workspaceOrganizationId (org-scoped pages, and /workspace/* — Chat/
  // Connections resolve their org via this same store). Platform pages
  // (e.g. /platform/organizations, which lists every org) and /me/* are
  // org-agnostic, so showing "Organization: microsoft" there is a leak of
  // the same kind the comment above already fixed for the nav group.
  const showOrganizationPicker = inOrganizationRoute || location.pathname.startsWith('/workspace/')
  const organizationNavItems = inOrganizationRoute && workspaceOrganizationId ? getOrganizationNavItems(workspaceOrganizationId) : []
  const activePrimary = getActivePrimaryNavItem(location.pathname, workspaceOrganizationId)
  const secondaryNavItems = getSecondaryNavItems(location.pathname, workspaceOrganizationId)
  const activeSecondary = getActiveSecondaryNavItem(location.pathname, secondaryNavItems)
  const isAdmin = Boolean(user?.is_admin)
  // A platform admin drilling into one organization gets that organization's
  // full nav as its own focused dashboard (everything Team & Access/AI
  // Config/... already has) instead of it being squeezed in alongside
  // Platform - same shape a single-org admin already sees, plus the "Back
  // to Organizations" escape hatch below.
  const showPlatformGroup = isAdmin && !inOrganizationRoute

  const menuItems = [
    ...(showPlatformGroup
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
    ...(showPlatformGroup ? platformNavItems : []),
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
    <Layout className="console-shell" style={{ height: '100vh', overflow: 'hidden', background: palette.canvas }}>
      <Sider
        theme="dark"
        width={272}
        style={{
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

        {showOrganizationPicker && (
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
        )}

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

      <Layout style={{ minWidth: 0, height: '100vh' }}>
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
            flexShrink: 0,
            lineHeight: 'normal',
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>
            <Space size={8} align="center" wrap={false} style={{ maxWidth: '100%' }}>
              {isAdmin && routeOrganizationId && (
                <Button size="small" type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/platform/organizations')}>
                  Back to Organizations
                </Button>
              )}
              <Tag color="orange" style={{ margin: 0, flexShrink: 0 }}>
                {routeOrganizationName ? `Organization: ${routeOrganizationName}` : getScopeTagLabel(location.pathname)}
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
              flexShrink: 0,
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

        <Content
          className="console-content"
          style={{ padding: 28, width: '100%', minWidth: 0, flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
