export interface NavItem {
  key: string
  path: string
  label: string
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
      { key: 'organizations', path: '/organizations', label: 'Organizations' },
      { key: 'users', path: '/users', label: 'Users' },
      { key: 'memberships', path: '/memberships', label: 'Memberships' },
      { key: 'invitations', path: '/invitations', label: 'Invitations' },
      { key: 'groups', path: '/groups', label: 'Groups' },
      { key: 'roles', path: '/roles', label: 'Roles' },
      { key: 'policy-bindings', path: '/policy-bindings', label: 'Policy Bindings' },
    ],
  },
  {
    key: 'access',
    label: 'Access',
    items: [
      { key: 'applications', path: '/applications', label: 'Applications' },
      { key: 'providers', path: '/providers', label: 'Providers' },
      { key: 'sessions', path: '/sessions', label: 'Sessions' },
    ],
  },
  {
    key: 'automation',
    label: 'Automation',
    items: [
      { key: 'devices', path: '/devices', label: 'Devices' },
      { key: 'jobs', path: '/jobs', label: 'Jobs' },
      { key: 'runs', path: '/runs', label: 'Runs' },
      { key: 'provider-settings', path: '/provider-settings', label: 'Provider Settings' },
    ],
  },
  {
    key: 'audit',
    label: 'Audit',
    items: [{ key: 'audit-events', path: '/audit-events', label: 'Audit Events' }],
  },
]

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items)
