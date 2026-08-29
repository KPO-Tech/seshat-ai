import type { ReactNode } from 'react'
import {
  ApartmentOutlined,
  AppstoreOutlined,
  CompassOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  RobotOutlined,
  SafetyOutlined,
  ScheduleOutlined,
  SettingOutlined,
  SlidersOutlined,
  TeamOutlined,
  UserOutlined,
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

export const workspaceNavItems: NavItem[] = [
  {
    key: 'workspace-home',
    label: 'Workspace',
    path: '/workspace/overview',
    matchPrefix: '/workspace/',
    icon: <ExperimentOutlined />,
  },
]

export const accountNavItems: NavItem[] = [
  {
    key: 'account-home',
    label: 'My Account',
    path: '/me/profile',
    matchPrefix: '/me/',
    icon: <UserOutlined />,
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
      key: 'org-preferences',
      label: 'Preferences',
      path: `/orgs/${organizationId}/preferences`,
      matchPrefix: `/orgs/${organizationId}/preferences`,
      icon: <SlidersOutlined />,
    },
    {
      key: 'org-agents',
      label: 'Agents & Skills',
      path: `/orgs/${organizationId}/catalog/agent-presets`,
      matchPrefix: `/orgs/${organizationId}/catalog/`,
      icon: <RobotOutlined />,
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
      key: 'org-prospecting',
      label: 'Prospecting',
      path: `/orgs/${organizationId}/prospecting/sweeps`,
      matchPrefix: `/orgs/${organizationId}/prospecting/`,
      icon: <CompassOutlined />,
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

export interface OrganizationNavGroup {
  label: string
  keys: string[]
}

// Overview and Preferences deliberately sit outside any labeled group (kept
// as the first/last plain items instead) - a dashboard and a catch-all
// settings page don't belong to a theme the way the other 8 do, and forcing
// them into one would leave that group's label describing only half its
// children.
export const organizationNavGroups: OrganizationNavGroup[] = [
  { label: 'Access & Governance', keys: ['org-team', 'org-activity'] },
  { label: 'AI & Automation', keys: ['org-ai', 'org-agents', 'org-automation', 'org-knowledge'] },
  { label: 'Integrations', keys: ['org-integrations', 'org-prospecting'] },
]

export function getSecondaryNavItems(pathname: string, organizationId: string | null): SecondaryNavItem[] {
  if (pathname.startsWith('/workspace/')) {
    return [
      {
        key: 'workspace-overview',
        label: 'Overview',
        path: '/workspace/overview',
        matchPrefix: '/workspace/overview',
      },
      {
        key: 'workspace-chat',
        label: 'Chat',
        path: '/workspace/chat',
        matchPrefix: '/workspace/chat',
      },
      {
        key: 'workspace-connections',
        label: 'Connections',
        path: '/workspace/connections',
        matchPrefix: '/workspace/connections',
      },
    ]
  }

  if (pathname.startsWith('/me/')) {
    return [
      {
        key: 'personal-profile',
        label: 'Profile',
        path: '/me/profile',
        matchPrefix: '/me/profile',
      },
      {
        key: 'personal-security',
        label: 'Security',
        path: '/me/security',
        matchPrefix: '/me/security',
      },
      {
        key: 'personal-preferences',
        label: 'Preferences',
        path: '/me/preferences',
        matchPrefix: '/me/preferences',
      },
      {
        key: 'personal-memories',
        label: 'Memories',
        path: '/me/memories',
        matchPrefix: '/me/memories',
      },
      {
        key: 'personal-memory-graph',
        label: 'Memory Graph',
        path: '/me/memory-graph',
        matchPrefix: '/me/memory-graph',
      },
      {
        key: 'personal-usage',
        label: 'Usage',
        path: '/me/quota-usage',
        matchPrefix: '/me/quota-usage',
      },
    ]
  }

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
      {
        key: 'org-ai-mcp',
        label: 'MCP Servers',
        path: `/orgs/${organizationId}/ai/mcp-servers`,
        matchPrefix: `/orgs/${organizationId}/ai/mcp-servers`,
      },
    ]
  }

  if (pathname.startsWith(`/orgs/${organizationId}/catalog/`)) {
    return [
      {
        key: 'org-catalog-agent-presets',
        label: 'Agent Presets',
        path: `/orgs/${organizationId}/catalog/agent-presets`,
        matchPrefix: `/orgs/${organizationId}/catalog/agent-presets`,
      },
      {
        key: 'org-catalog-skill-repos',
        label: 'Skill Repos',
        path: `/orgs/${organizationId}/catalog/skill-repos`,
        matchPrefix: `/orgs/${organizationId}/catalog/skill-repos`,
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

  if (pathname.startsWith(`/orgs/${organizationId}/knowledge/`)) {
    return [
      {
        key: 'org-knowledge-corpora',
        label: 'Corpora',
        path: `/orgs/${organizationId}/knowledge/corpora`,
        matchPrefix: `/orgs/${organizationId}/knowledge/corpora`,
      },
      {
        key: 'org-knowledge-connectors',
        label: 'Connectors',
        path: `/orgs/${organizationId}/knowledge/connectors`,
        matchPrefix: `/orgs/${organizationId}/knowledge/connectors`,
      },
    ]
  }

  if (pathname.startsWith(`/orgs/${organizationId}/prospecting/`)) {
    return [
      {
        key: 'org-prospecting-sweeps',
        label: 'Sweeps',
        path: `/orgs/${organizationId}/prospecting/sweeps`,
        matchPrefix: `/orgs/${organizationId}/prospecting/sweeps`,
      },
      {
        key: 'org-prospecting-settings',
        label: 'Settings',
        path: `/orgs/${organizationId}/prospecting/settings`,
        matchPrefix: `/orgs/${organizationId}/prospecting/settings`,
      },
    ]
  }

  if (pathname.startsWith(`/orgs/${organizationId}/activity/`)) {
    return [
      {
        key: 'org-activity-audit',
        label: 'Audit',
        path: `/orgs/${organizationId}/activity/audit`,
        matchPrefix: `/orgs/${organizationId}/activity/audit`,
      },
      {
        key: 'org-activity-chat-sessions',
        label: 'Chat Sessions',
        path: `/orgs/${organizationId}/activity/chat-sessions`,
        matchPrefix: `/orgs/${organizationId}/activity/chat-sessions`,
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
      {
        key: 'org-integrations-scim',
        label: 'SCIM Provisioning',
        path: `/orgs/${organizationId}/integrations/scim`,
        matchPrefix: `/orgs/${organizationId}/integrations/scim`,
      },
    ]
  }

  return []
}

export function getActivePrimaryNavItem(pathname: string, organizationId: string | null) {
  const orgItems = organizationId ? getOrganizationNavItems(organizationId) : []
  return [...platformNavItems, ...workspaceNavItems, ...accountNavItems, ...orgItems].find((item) => matchesPath(pathname, item))
}

export function getActiveSecondaryNavItem(pathname: string, items: SecondaryNavItem[]) {
  return items.find((item) => matchesPath(pathname, item))
}

export function getScopeLabel(pathname: string, organizationName: string | null) {
  if (pathname.startsWith('/orgs/')) return organizationName ?? 'Organization'
  if (pathname.startsWith('/workspace/')) return 'Personal'
  if (pathname.startsWith('/me/')) return 'Personal'
  return 'Platform'
}

export function getScopeTagLabel(pathname: string) {
  if (pathname.startsWith('/orgs/')) return 'Organization'
  if (pathname.startsWith('/workspace/')) return 'Personal'
  if (pathname.startsWith('/me/')) return 'Personal'
  return 'Platform'
}
