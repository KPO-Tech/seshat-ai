import type { ReactNode } from 'react'
import {
  ApartmentOutlined,
  AppstoreOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FileSearchOutlined,
  SafetyOutlined,
  ScheduleOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons'

export interface NavItem {
  key: string
  label: string
  path: string
  matchPrefix: string
  icon: ReactNode
}

export interface SecondaryNavItem {
  key: string
  label: string
  path: string
  matchPrefix: string
}

function matchesPath(pathname: string, item: { path: string; matchPrefix: string }) {
  return pathname === item.path || pathname.startsWith(item.matchPrefix)
}

export const platformNavItems: NavItem[] = [
  {
    key: 'platform-overview',
    label: 'Overview',
    path: '/platform/overview',
    matchPrefix: '/platform/overview',
    icon: <DashboardOutlined />,
  },
  {
    key: 'platform-organizations',
    label: 'Organizations',
    path: '/platform/organizations',
    matchPrefix: '/platform/organizations',
    icon: <ApartmentOutlined />,
  },
  {
    key: 'platform-security',
    label: 'Security',
    path: '/platform/security/sessions',
    matchPrefix: '/platform/security/',
    icon: <SafetyOutlined />,
  },
]

export function getOrganizationNavItems(organizationId: string): NavItem[] {
  return [
    {
      key: 'org-overview',
      label: 'Overview',
      path: `/orgs/${organizationId}/overview`,
      matchPrefix: `/orgs/${organizationId}/overview`,
      icon: <DashboardOutlined />,
    },
    {
      key: 'org-team',
      label: 'Team & Access',
      path: `/orgs/${organizationId}/team/memberships`,
      matchPrefix: `/orgs/${organizationId}/team/`,
      icon: <TeamOutlined />,
    },
    {
      key: 'org-ai',
      label: 'AI Config',
      path: `/orgs/${organizationId}/ai/provider-settings`,
      matchPrefix: `/orgs/${organizationId}/ai/`,
      icon: <SettingOutlined />,
    },
    {
      key: 'org-automation',
      label: 'Automation',
      path: `/orgs/${organizationId}/automation/jobs`,
      matchPrefix: `/orgs/${organizationId}/automation/`,
      icon: <ScheduleOutlined />,
    },
    {
      key: 'org-knowledge',
      label: 'Knowledge',
      path: `/orgs/${organizationId}/knowledge/corpora`,
      matchPrefix: `/orgs/${organizationId}/knowledge/`,
      icon: <DatabaseOutlined />,
    },
    {
      key: 'org-integrations',
      label: 'Integrations',
      path: `/orgs/${organizationId}/integrations/applications`,
      matchPrefix: `/orgs/${organizationId}/integrations/`,
      icon: <AppstoreOutlined />,
    },
    {
      key: 'org-activity',
      label: 'Activity',
      path: `/orgs/${organizationId}/activity/audit`,
      matchPrefix: `/orgs/${organizationId}/activity/`,
      icon: <FileSearchOutlined />,
    },
  ]
}

export function getSecondaryNavItems(pathname: string, organizationId: string | null): SecondaryNavItem[] {
  if (pathname.startsWith('/platform/security/')) {
    return [
      {
        key: 'platform-security-sessions',
        label: 'Sessions',
        path: '/platform/security/sessions',
        matchPrefix: '/platform/security/sessions',
      },
      {
        key: 'platform-security-audit',
        label: 'Audit',
        path: '/platform/security/audit',
        matchPrefix: '/platform/security/audit',
      },
      {
        key: 'platform-security-system',
        label: 'System',
        path: '/platform/security/system',
        matchPrefix: '/platform/security/system',
      },
    ]
  }

  if (!organizationId) return []

  if (pathname.startsWith(`/orgs/${organizationId}/team/`)) {
    return [
      {
        key: 'org-team-memberships',
        label: 'Memberships',
        path: `/orgs/${organizationId}/team/memberships`,
        matchPrefix: `/orgs/${organizationId}/team/memberships`,
      },
      {
        key: 'org-team-teams',
        label: 'Teams',
        path: `/orgs/${organizationId}/team/teams`,
        matchPrefix: `/orgs/${organizationId}/team/teams`,
      },
      {
        key: 'org-team-invitations',
        label: 'Invitations',
        path: `/orgs/${organizationId}/team/invitations`,
        matchPrefix: `/orgs/${organizationId}/team/invitations`,
      },
      {
        key: 'org-team-roles',
        label: 'Roles',
        path: `/orgs/${organizationId}/team/roles`,
        matchPrefix: `/orgs/${organizationId}/team/roles`,
      },
      {
        key: 'org-team-policies',
        label: 'Policies',
        path: `/orgs/${organizationId}/team/policies`,
        matchPrefix: `/orgs/${organizationId}/team/policies`,
      },
    ]
  }

  if (pathname.startsWith(`/orgs/${organizationId}/ai/`)) {
    return [
      {
        key: 'org-ai-providers',
        label: 'Provider Settings',
        path: `/orgs/${organizationId}/ai/provider-settings`,
        matchPrefix: `/orgs/${organizationId}/ai/provider-settings`,
      },
      {
        key: 'org-ai-embedder',
        label: 'Embedder',
        path: `/orgs/${organizationId}/ai/embedder`,
        matchPrefix: `/orgs/${organizationId}/ai/embedder`,
      },
      {
        key: 'org-ai-web-search',
        label: 'Web Search',
        path: `/orgs/${organizationId}/ai/web-search`,
        matchPrefix: `/orgs/${organizationId}/ai/web-search`,
      },
    ]
  }

  if (pathname.startsWith(`/orgs/${organizationId}/automation/`)) {
    return [
      {
        key: 'org-automation-devices',
        label: 'Devices',
        path: `/orgs/${organizationId}/automation/devices`,
        matchPrefix: `/orgs/${organizationId}/automation/devices`,
      },
      {
        key: 'org-automation-jobs',
        label: 'Jobs',
        path: `/orgs/${organizationId}/automation/jobs`,
        matchPrefix: `/orgs/${organizationId}/automation/jobs`,
      },
      {
        key: 'org-automation-runs',
        label: 'Runs',
        path: `/orgs/${organizationId}/automation/runs`,
        matchPrefix: `/orgs/${organizationId}/automation/runs`,
      },
    ]
  }

  if (pathname.startsWith(`/orgs/${organizationId}/integrations/`)) {
    return [
      {
        key: 'org-integrations-applications',
        label: 'Applications',
        path: `/orgs/${organizationId}/integrations/applications`,
        matchPrefix: `/orgs/${organizationId}/integrations/applications`,
      },
      {
        key: 'org-integrations-providers',
        label: 'Identity Providers',
        path: `/orgs/${organizationId}/integrations/providers`,
        matchPrefix: `/orgs/${organizationId}/integrations/providers`,
      },
    ]
  }

  return []
}

export function getActivePrimaryNavItem(pathname: string, organizationId: string | null) {
  const orgItems = organizationId ? getOrganizationNavItems(organizationId) : []
  return [...platformNavItems, ...orgItems].find((item) => matchesPath(pathname, item))
}

export function getActiveSecondaryNavItem(pathname: string, items: SecondaryNavItem[]) {
  return items.find((item) => matchesPath(pathname, item))
}

export function getScopeLabel(pathname: string, organizationName: string | null) {
  if (pathname.startsWith('/orgs/')) return organizationName ?? 'Organization'
  return 'Platform'
}

export function getScopeTagLabel(pathname: string) {
  return pathname.startsWith('/orgs/') ? 'Organization' : 'Platform'
}
