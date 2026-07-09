import type { ReactNode } from 'react'
import {
  ApartmentOutlined,
  ApiOutlined,
  AppstoreOutlined,
  ClusterOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  GlobalOutlined,
  KeyOutlined,
  LockOutlined,
  MailOutlined,
  PictureOutlined,
  PlayCircleOutlined,
  SafetyOutlined,
  ScheduleOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'

export interface NavItem {
  key: string
  path: string
  label: string
  icon: ReactNode
}

export interface NavGroup {
  key: string
  label: string
  items: NavItem[]
}

// Grouping and order mirror docs/casdoor-frontend-mapping.md's suggested
// build order — IAM core, access/auth surface, automation, audit.
export const navGroups: NavGroup[] = [
  {
    key: 'iam',
    label: 'Identity',
    items: [
      { key: 'organizations', path: '/organizations', label: 'Organizations', icon: <ApartmentOutlined /> },
      { key: 'users', path: '/users', label: 'Users', icon: <UserOutlined /> },
      { key: 'memberships', path: '/memberships', label: 'Memberships', icon: <TeamOutlined /> },
      { key: 'invitations', path: '/invitations', label: 'Invitations', icon: <MailOutlined /> },
      { key: 'groups', path: '/groups', label: 'Groups', icon: <ClusterOutlined /> },
      { key: 'roles', path: '/roles', label: 'Roles', icon: <SafetyOutlined /> },
      { key: 'policy-bindings', path: '/policy-bindings', label: 'Policy Bindings', icon: <LockOutlined /> },
    ],
  },
  {
    key: 'access',
    label: 'Access',
    items: [
      { key: 'applications', path: '/applications', label: 'Applications', icon: <AppstoreOutlined /> },
      { key: 'providers', path: '/providers', label: 'Providers', icon: <CloudServerOutlined /> },
      { key: 'sessions', path: '/sessions', label: 'Sessions', icon: <KeyOutlined /> },
    ],
  },
  {
    key: 'automation',
    label: 'Automation',
    items: [
      { key: 'devices', path: '/devices', label: 'Devices', icon: <DesktopOutlined /> },
      { key: 'jobs', path: '/jobs', label: 'Jobs', icon: <ScheduleOutlined /> },
      { key: 'runs', path: '/runs', label: 'Runs', icon: <PlayCircleOutlined /> },
      { key: 'provider-settings', path: '/provider-settings', label: 'Provider Settings', icon: <SettingOutlined /> },
      { key: 'corpora', path: '/corpora', label: 'Corpora', icon: <DatabaseOutlined /> },
      { key: 'embedder-settings', path: '/embedder-settings', label: 'Embedder Settings', icon: <ExperimentOutlined /> },
    ],
  },
  {
    key: 'audit',
    label: 'Audit',
    items: [{ key: 'audit-events', path: '/audit-events', label: 'Audit Events', icon: <FileSearchOutlined /> }],
  },
]

export const dashboardNavItem: NavItem = {
  key: 'dashboard',
  path: '/dashboard',
  label: 'Dashboard',
  icon: <DashboardOutlined />,
}

// Superadmin-only (User.is_admin) — the platform-wide defaults every
// organization can fall back to instead of bringing its own AI provider
// credentials. Hidden from the sidebar entirely for non-admins (see
// AppLayout), and guarded again at the route level (RequireSuperAdmin) for
// anyone who navigates to the URL directly.
export const platformNavGroup: NavGroup = {
  key: 'platform',
  label: 'Platform',
  items: [
    { key: 'platform-provider-settings', path: '/platform/provider-settings', label: 'Default Providers', icon: <ApiOutlined /> },
    { key: 'platform-embedder-settings', path: '/platform/embedder-settings', label: 'Default Embedder', icon: <ExperimentOutlined /> },
    { key: 'platform-image-generation', path: '/platform/image-generation', label: 'Image Generation', icon: <PictureOutlined /> },
    { key: 'platform-web-search', path: '/platform/web-search', label: 'Web Search', icon: <GlobalOutlined /> },
  ],
}

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items)
export const allPlatformNavItems: NavItem[] = platformNavGroup.items
