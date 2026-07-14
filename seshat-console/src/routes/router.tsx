import { createBrowserRouter, Navigate } from 'react-router-dom'
import { BootstrapGate } from '@/routes/BootstrapGate'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { RequireSuperAdmin } from '@/routes/RequireSuperAdmin'
import { AppLayout } from '@/layout/AppLayout'
import { BootstrapPage } from '@/pages/auth/BootstrapPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { OrganizationsPage } from '@/pages/organizations/OrganizationsPage'
import { UsersPage } from '@/pages/users/UsersPage'
import { MembershipsPage } from '@/pages/memberships/MembershipsPage'
import { InvitationsPage } from '@/pages/invitations/InvitationsPage'
import { GroupsPage } from '@/pages/groups/GroupsPage'
import { RolesPage } from '@/pages/roles/RolesPage'
import { PolicyBindingsPage } from '@/pages/policyBindings/PolicyBindingsPage'
import { ApplicationsPage } from '@/pages/applications/ApplicationsPage'
import { ProvidersPage } from '@/pages/providers/ProvidersPage'
import { SessionsPage } from '@/pages/sessions/SessionsPage'
import { DevicesPage } from '@/pages/devices/DevicesPage'
import { JobsPage } from '@/pages/jobs/JobsPage'
import { RunsPage } from '@/pages/runs/RunsPage'
import { ProviderSettingsPage } from '@/pages/providerSettings/ProviderSettingsPage'
import { AuditEventsPage } from '@/pages/auditEvents/AuditEventsPage'
import { CorporaPage } from '@/pages/knowledge/CorporaPage'
import { CorpusDetailPage } from '@/pages/knowledge/CorpusDetailPage'
import { EmbedderSettingsPage } from '@/pages/knowledge/EmbedderSettingsPage'
import { PlatformProviderSettingsPage } from '@/pages/platform/PlatformProviderSettingsPage'
import { PlatformEmbedderSettingsPage } from '@/pages/platform/PlatformEmbedderSettingsPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { allNavItems, allPlatformNavItems, dashboardNavItem } from '@/layout/nav'

// Every nav item not explicitly listed here falls back to a placeholder —
// see docs/casdoor-frontend-mapping.md for the intended build order.
const builtPages: Record<string, React.ReactNode> = {
  organizations: <OrganizationsPage />,
  memberships: <MembershipsPage />,
  invitations: <InvitationsPage />,
  groups: <GroupsPage />,
  roles: <RolesPage />,
  'policy-bindings': <PolicyBindingsPage />,
  applications: <ApplicationsPage />,
  providers: <ProvidersPage />,
  sessions: <SessionsPage />,
  devices: <DevicesPage />,
  jobs: <JobsPage />,
  runs: <RunsPage />,
  'provider-settings': <ProviderSettingsPage />,
  corpora: <CorporaPage />,
  'embedder-settings': <EmbedderSettingsPage />,
  'audit-events': <AuditEventsPage />,
}

const builtPlatformPages: Record<string, React.ReactNode> = {
  'platform-provider-settings': <PlatformProviderSettingsPage />,
  'platform-embedder-settings': <PlatformEmbedderSettingsPage />,
}

export const router = createBrowserRouter([
  {
    element: <BootstrapGate />,
    children: [
      { path: '/bootstrap', element: <BootstrapPage /> },
      { path: '/login', element: <LoginPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <Navigate to={dashboardNavItem.path} replace /> },
              { path: dashboardNavItem.path, element: <DashboardPage /> },
              // Corpus detail isn't a nav item (reached by clicking a row in
              // Corpora) — declared explicitly rather than via allNavItems.
              { path: '/corpora/:corpusId', element: <CorpusDetailPage /> },
              ...allNavItems
                .filter((item) => item.key !== 'users')
                .map((item) => ({
                  path: item.path,
                  element: builtPages[item.key] ?? <PlaceholderPage title={item.label} />,
                })),
              {
                // GET/POST/PUT/DELETE /users are platform-admin only
                // server-side (requireAdmin) — guarded here too, not just
                // hidden from the nav, in case of a direct URL visit.
                element: <RequireSuperAdmin />,
                children: [{ path: '/users', element: <UsersPage /> }],
              },
              {
                element: <RequireSuperAdmin />,
                children: allPlatformNavItems.map((item) => ({
                  path: item.path,
                  element: builtPlatformPages[item.key] ?? <PlaceholderPage title={item.label} />,
                })),
              },
            ],
          },
        ],
      },
    ],
  },
])
