import type { ReactNode } from 'react'
import {
  ApartmentOutlined,
  ApiOutlined,
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
  ToolOutlined,
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

// Workspace (Chat, Connections) is a self-service area of a specific
// organization, not a platform-wide personal space - a member's Workspace
// for org A is a completely different set of connected accounts than their
// Workspace for org B, and the backend requires an organization_id on every
// connector account/chat session. Kept as its own function (rather than
// folded into getOrganizationNavItems) so AppLayout can place it visually
// apart from the org's admin pages - same org, but "your own corner of it".
export function getOrganizationWorkspaceNavItem(organizationId: string): NavItem {
  return {
    key: 'org-workspace',
    label: 'Workspace',
    path: `/orgs/${organizationId}/workspace/overview`,
    matchPrefix: `/orgs/${organizationId}/workspace/`,
    icon: <ExperimentOutlined />,
  }
}

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
      key: 'org-activity',
      label: 'Activity',
      path: `/orgs/${organizationId}/activity/audit`,
      matchPrefix: `/orgs/${organizationId}/activity/`,
      icon: <FileSearchOutlined />,
    },
    {
      key: 'org-preferences',
      label: 'Preferences',
      path: `/orgs/${organizationId}/preferences`,
      matchPrefix: `/orgs/${organizationId}/preferences`,
      icon: <SlidersOutlined />,
    },
    // Everything AI-shaped: which models/embedders/search this org uses,
    // what it knows (Knowledge), what tools its agents can reach (MCP
    // Servers), and the agent/skill presets built from all of that.
    // Renamed from "AI Config" now that MCP Servers moved out to its own
    // item (previously a hidden sub-tab here) - what remains (provider
    // settings/embedder/web search) really is just "which providers".
    {
      key: 'org-providers',
      label: 'Providers',
      path: `/orgs/${organizationId}/ai/provider-settings`,
      matchPrefix: `/orgs/${organizationId}/ai/`,
      icon: <SettingOutlined />,
    },
    {
      key: 'org-knowledge',
      label: 'Knowledge',
      path: `/orgs/${organizationId}/knowledge/corpora`,
      matchPrefix: `/orgs/${organizationId}/knowledge/`,
      icon: <DatabaseOutlined />,
    },
    {
      key: 'org-mcp-servers',
      label: 'MCP Servers',
      path: `/orgs/${organizationId}/mcp-servers`,
      matchPrefix: `/orgs/${organizationId}/mcp-servers`,
      icon: <ToolOutlined />,
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
    // Every external system this org connects with, in either direction:
    // Connectors and Identity Providers/SCIM pull this org's own data in
    // from (or authenticate members against) outside systems, Applications
    // is the reverse - other systems authenticating against this org.
    // Connectors moved here from Knowledge (2026-09-03) - syncing into a
    // Knowledge corpus is one thing a connected account can be used for,
    // not what a connector *is*; it's an external-system connection first.
    {
      key: 'org-connectors',
      label: 'Connectors',
      path: `/orgs/${organizationId}/connectors`,
      matchPrefix: `/orgs/${organizationId}/connectors`,
      icon: <ApiOutlined />,
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
  ]
}

export interface OrganizationNavGroup {
  label: string
  keys: string[]
}

// Rebuilt from scratch 2026-09-03, not just relabeled - the old shape
// (Connectors under Knowledge, MCP Servers hidden inside AI Config,
// Prospecting under Integrations) mixed several unrelated themes together.
// Preferences deliberately sits outside any labeled group (kept as a plain
// item after the groups instead) - a catch-all settings page doesn't
// belong to a theme the way the others do, and forcing it into one would
// leave that group's label describing only part of its children.
// Automation gets its own single-item group rather than going unlabeled -
// a real feature area shouldn't lose its label just because it happens to
// only have one primary nav entry.
// "AI & Knowledge" renamed to "AI Core" 2026-09-03, matching seshat-ui's
// Admin Console group of the same name (Providers/Knowledge/MCP Servers/...)
// on purpose - the two apps' sidebars are meant to read as one design
// system, not two. The self-service Workspace item below (own top-level
// nav.tsx entry, not part of this group) stays separate on purpose too: it
// needs no organization.manage permission, unlike everything here, and
// folding it under an admin-config group like this one would misrepresent
// that.
export const organizationNavGroups: OrganizationNavGroup[] = [
  { label: 'Organization', keys: ['org-overview', 'org-team', 'org-activity'] },
  { label: 'AI Core', keys: ['org-providers', 'org-knowledge', 'org-mcp-servers', 'org-agents'] },
  { label: 'Automation', keys: ['org-automation'] },
  { label: 'Integrations', keys: ['org-connectors', 'org-integrations', 'org-prospecting'] },
]

export function getSecondaryNavItems(pathname: string, organizationId: string | null): SecondaryNavItem[] {
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

  if (pathname.startsWith(`/orgs/${organizationId}/workspace/`)) {
    return [
      {
        key: 'workspace-overview',
        label: 'Overview',
        path: `/orgs/${organizationId}/workspace/overview`,
        matchPrefix: `/orgs/${organizationId}/workspace/overview`,
      },
      {
        key: 'workspace-chat',
        label: 'Chat',
        path: `/orgs/${organizationId}/workspace/chat`,
        matchPrefix: `/orgs/${organizationId}/workspace/chat`,
      },
      {
        key: 'workspace-connections',
        label: 'Connections',
        path: `/orgs/${organizationId}/workspace/connections`,
        matchPrefix: `/orgs/${organizationId}/workspace/connections`,
      },
    ]
  }

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
        key: 'org-automation-desktop-policies',
        label: 'Desktop Policies',
        path: `/orgs/${organizationId}/automation/desktop-policies`,
        matchPrefix: `/orgs/${organizationId}/automation/desktop-policies`,
      },
      {
        key: 'org-automation-hooks',
        label: 'Hooks',
        path: `/orgs/${organizationId}/automation/hooks`,
        matchPrefix: `/orgs/${organizationId}/automation/hooks`,
      },
      {
        key: 'org-automation-bundles',
        label: 'Bundles',
        path: `/orgs/${organizationId}/automation/bundles`,
        matchPrefix: `/orgs/${organizationId}/automation/bundles`,
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
      {
        key: 'org-integrations-network-diagnostics',
        label: 'Network Diagnostics',
        path: `/orgs/${organizationId}/integrations/network-diagnostics`,
        matchPrefix: `/orgs/${organizationId}/integrations/network-diagnostics`,
      },
    ]
  }

  return []
}

export function getActivePrimaryNavItem(pathname: string, organizationId: string | null) {
  const orgItems = organizationId ? getOrganizationNavItems(organizationId) : []
  const workspaceItem = organizationId ? [getOrganizationWorkspaceNavItem(organizationId)] : []
  return [...platformNavItems, ...accountNavItems, ...orgItems, ...workspaceItem].find((item) => matchesPath(pathname, item))
}

export function getActiveSecondaryNavItem(pathname: string, items: SecondaryNavItem[]) {
  return items.find((item) => matchesPath(pathname, item))
}

export function getScopeLabel(pathname: string, organizationName: string | null) {
  if (pathname.startsWith('/orgs/')) return organizationName ?? 'Organization'
  if (pathname.startsWith('/me/')) return 'Personal'
  return 'Platform'
}

export function getScopeTagLabel(pathname: string) {
  if (pathname.startsWith('/orgs/')) return 'Organization'
  if (pathname.startsWith('/me/')) return 'Personal'
  return 'Platform'
}
