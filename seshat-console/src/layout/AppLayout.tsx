import { useEffect } from 'react'
import { Avatar, Button, Dropdown, Layout, Menu, Space, Typography } from 'antd'
import { ArrowLeftOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons'
import { Outlet, matchPath, useLocation, useNavigate } from 'react-router'
import { useOrganizationsList } from '@/api/organizations'
import { useLogout, useOrgMode } from '@/api/auth'
import {
  getActivePrimaryNavItem,
  getActiveSecondaryNavItem,
  getOrganizationNavItems,
  getOrganizationWorkspaceNavItem,
  getScopeTagLabel,
  getSecondaryNavItems,
  organizationNavGroups,
  platformNavItems,
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
  const memberships = useAuthStore((state) => state.memberships)
  const logout = useLogout()
  const selectedOrganizationId = useWorkspaceOrganizationStore((state) => state.organizationId)
  const setSelectedOrganizationId = useWorkspaceOrganizationStore((state) => state.setOrganizationId)
  const { data: organizationsData } = useOrganizationsList({ sort: 'name', order: 'asc', limit: 200 })
  const orgMode = useOrgMode()

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
  // The generic "Organization" scope tag alone doesn't say WHICH one when
  // there's more than one on the platform (a platform admin browsing several
  // orgs in a row has no sidebar picker to glance at any more - switching
  // orgs happens via /platform/organizations' own "Open" action) - so every
  // org-scoped page's header names it explicitly, not just the Overview page.
  const routeOrganizationName = routeOrganizationId
    ? (organizations.find((organization) => organization.id === routeOrganizationId)?.name ?? null)
    : null
  // The org group/sidebar should only take over once you're actually inside
  // an organization's routes (routeOrganizationId) — not whenever there
  // happens to be a fallback-selected org, which used to make "Organization"
  // (and hiding "Platform" below) leak into pages like /platform/overview
  // that have nothing to do with any single org. Workspace (/orgs/:id/
  // workspace/*) is a real org route like any other, so it's covered here
  // for free - no special-casing needed the way it once was when it lived
  // at a top-level, org-agnostic /workspace/* URL.
  const inOrganizationRoute = Boolean(routeOrganizationId)
  const isAdmin = Boolean(user?.is_admin)
  // /orgs/:id/* beyond Workspace is gated behind organization.manage
  // (RequireOrganizationManager, routes.tsx) - a plain member who isn't a
  // manager can still reach their own org's Workspace (the router carves it
  // out of that guard on purpose, matching the 403 page's own "Go to my
  // workspace" escape hatch), but showing them Team & Access/AI Config/...
  // links they'd immediately 403 on would be actively misleading. Mirrors
  // RequireOrganizationManager's own check exactly, not a new policy.
  const canManageRouteOrganization = Boolean(
    routeOrganizationId && (isAdmin || memberships.some((m) => m.organization_id === routeOrganizationId && m.permissions?.includes('organization.manage'))),
  )
  const organizationNavItems = canManageRouteOrganization && routeOrganizationId ? getOrganizationNavItems(routeOrganizationId) : []
  const organizationWorkspaceItem = inOrganizationRoute && workspaceOrganizationId ? getOrganizationWorkspaceNavItem(workspaceOrganizationId) : null
  const activePrimary = getActivePrimaryNavItem(location.pathname, workspaceOrganizationId)
  const secondaryNavItems = getSecondaryNavItems(location.pathname, workspaceOrganizationId)
  const activeSecondary = getActiveSecondaryNavItem(location.pathname, secondaryNavItems)
  // The "Organizations" list only means anything when more than one can
  // exist - see docs/helps/audit-2026-08-29-openwork-den-comparison.md,
  // "org_mode" architecture item. /platform/organizations itself redirects
  // away in single mode too (RedirectIfOrgModeSingle) - this just keeps it
  // out of the sidebar in the first place. Assumes multi while org_mode is
  // still unresolved (see useOrgMode's own doc comment).
  const visiblePlatformNavItems =
    orgMode === 'single' ? platformNavItems.filter((item) => item.key !== 'platform-organizations') : platformNavItems
  // A platform admin drilling into one organization gets that organization's
  // full nav as its own focused dashboard (everything Team & Access/AI
  // Config/... already has) instead of it being squeezed in alongside
  // Platform - same shape a single-org admin already sees, plus the "Back
  // to Organizations" escape hatch below.
  const showPlatformGroup = isAdmin && !inOrganizationRoute

  // Overview/Preferences render as plain items (no group label) bracketing
  // the three themed groups below - see organizationNavGroups' own comment
  // for why those two don't belong to any theme. Any key not claimed by a
  // group (there should only ever be these two) surfaces itself here too,
  // so a new org nav item is never silently dropped from the sidebar just
  // because nobody remembered to add it to a group.
  const organizationNavItemsByKey = new Map(organizationNavItems.map((item) => [item.key, item]))
  const groupedOrganizationKeys = new Set(organizationNavGroups.flatMap((group) => group.keys))
  const ungroupedOrganizationItems = organizationNavItems.filter((item) => !groupedOrganizationKeys.has(item.key))
  const organizationGroupMenuItems = organizationNavGroups
    .map((group) => ({
      key: `org-group-${group.label}`,
      type: 'group' as const,
      label: group.label,
      children: group.keys
        .map((key) => organizationNavItemsByKey.get(key))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .map((item) => ({ key: item.key, label: item.label, icon: item.icon })),
    }))
    .filter((group) => group.children.length > 0)

  const menuItems = [
    ...(showPlatformGroup
      ? [
          {
            key: 'platform-group',
            type: 'group' as const,
            label: 'Platform',
            children: visiblePlatformNavItems.map((item) => ({ key: item.key, label: item.label, icon: item.icon })),
          },
        ]
      : []),
    ...(ungroupedOrganizationItems[0]
      ? [{ key: ungroupedOrganizationItems[0].key, label: ungroupedOrganizationItems[0].label, icon: ungroupedOrganizationItems[0].icon }]
      : []),
    ...organizationGroupMenuItems,
    ...ungroupedOrganizationItems.slice(1).map((item) => ({ key: item.key, label: item.label, icon: item.icon })),
    ...(organizationWorkspaceItem && (showPlatformGroup || organizationNavItems.length > 0)
      ? [{ key: 'workspace-divider', type: 'divider' as const }]
      : []),
    ...(organizationWorkspaceItem ? [{ key: organizationWorkspaceItem.key, label: organizationWorkspaceItem.label, icon: organizationWorkspaceItem.icon }] : []),
  ]

  const primaryItems = [
    ...(showPlatformGroup ? visiblePlatformNavItems : []),
    ...organizationNavItems,
    ...(organizationWorkspaceItem ? [organizationWorkspaceItem] : []),
  ]

  return (
    <Layout className="console-shell" style={{ height: '100vh', overflow: 'hidden', background: palette.canvas }}>
      <Sider
        theme="dark"
        width={264}
        style={{
          height: '100vh',
          overflowX: 'hidden',
          overflowY: 'auto',
          background: palette.sidebarBg,
          borderRight: `1px solid ${palette.border}`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Brand Header */}
        <div
          className="console-brand"
          style={{
            padding: '0 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${palette.borderSubtle}`,
            height: 56,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              className="console-brand__mark"
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #FF8F3D 0%, #EF7C2F 100%)',
                boxShadow: '0 2px 8px rgba(239, 124, 47, 0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 800,
                color: '#131217',
                flexShrink: 0,
              }}
            >
              S
            </div>
            <div>
              <div style={{ color: palette.ink, fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                Seshat Console
              </div>
            </div>
          </div>
        </div>

        {isAdmin && inOrganizationRoute && (
          <div style={{ padding: '4px 14px 8px' }}>
            <Button
              type="text"
              size="small"
              icon={<ArrowLeftOutlined style={{ fontSize: 11 }} />}
              // Single mode has no organizations list to go back to (only
              // one org ever exists) - go to the platform overview instead,
              // the only other platform-level page still relevant.
              onClick={() => navigate(orgMode === 'single' ? '/platform/overview' : '/platform/organizations')}
              style={{
                color: palette.inkSecondary,
                fontSize: 12,
                paddingInline: 8,
                width: '100%',
                justifyContent: 'flex-start',
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.03)',
              }}
            >
              {orgMode === 'single' ? 'Back to Platform' : 'Back to Organizations'}
            </Button>
          </div>
        )}

        <div style={{ flex: 1, paddingBottom: 16 }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={activePrimary ? [activePrimary.key] : []}
            items={menuItems}
            style={{ borderInlineEnd: 'none', background: 'transparent' }}
            onClick={({ key }) => {
              const target = primaryItems.find((item) => item.key === key)
              if (target) navigate(target.path)
            }}
          />
        </div>
      </Sider>

      <Layout style={{ minWidth: 0, height: '100vh', background: palette.canvas }}>
        <Header
          className="console-topbar"
          style={{
            background: palette.surface,
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 1fr) auto minmax(220px, 1fr)',
            gridTemplateAreas: '"scope nav session"',
            alignItems: 'center',
            padding: '0 24px',
            borderBottom: `1px solid ${palette.border}`,
            minHeight: 54,
            height: 54,
            flexShrink: 0,
            lineHeight: 'normal',
            gap: 16,
          }}
        >
          <div className="console-topbar__scope" style={{ minWidth: 0, overflow: 'hidden', gridArea: 'scope' }}>
            <Space size={10} align="center" wrap={false} style={{ maxWidth: '100%' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 10px',
                  borderRadius: 6,
                  background: palette.accentSoft,
                  border: `1px solid ${palette.accentSoftBorder}`,
                  color: palette.accentHover,
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  flexShrink: 0,
                }}
              >
                {routeOrganizationName ? routeOrganizationName : getScopeTagLabel(location.pathname)}
              </span>
              <Typography.Text style={{ color: palette.inkTertiary, fontSize: 13 }}>/</Typography.Text>
              <Typography.Text strong style={{ fontSize: 14.5, color: palette.ink }} ellipsis>
                {activePrimary?.label ?? 'Console'}
              </Typography.Text>
            </Space>
          </div>

          {secondaryNavItems.length > 1 && (
            <nav className="console-subnav-bar" aria-label="Section navigation" style={{ gridArea: 'nav' }}>
              {secondaryNavItems.map((item) => {
                const isActive = activeSecondary?.key === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className={`console-subnav-item ${isActive ? 'console-subnav-item--active' : ''}`}
                  >
                    {item.label}
                  </button>
                )
              })}
            </nav>
          )}

          <div className="console-topbar__session" style={{ gridArea: 'session' }}>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  {
                    key: 'user-info',
                    disabled: true,
                    label: (
                      <div style={{ padding: '4px 0' }}>
                        <div style={{ fontWeight: 600, color: palette.ink }}>{user?.display_name || 'User'}</div>
                        <div style={{ fontSize: 12, color: palette.inkTertiary }}>{user?.email}</div>
                      </div>
                    ),
                  },
                  { type: 'divider' },
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
              <Space
                size={8}
                style={{
                  cursor: 'pointer',
                  flexShrink: 0,
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${palette.borderSubtle}`,
                  transition: 'background 0.15s ease',
                }}
              >
                <Avatar
                  size={24}
                  style={{
                    background: palette.accentSoft,
                    color: palette.accentHover,
                    border: `1px solid ${palette.accentSoftBorder}`,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                  icon={<UserOutlined />}
                />
                <Typography.Text className="console-user-label" style={{ fontSize: 13, color: palette.inkSecondary, fontWeight: 500 }}>
                  {user?.display_name ?? user?.email}
                </Typography.Text>
              </Space>
            </Dropdown>
          </div>
        </Header>

        <Content
          className="console-content"
          style={{ padding: '24px 28px', width: '100%', minWidth: 0, flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
