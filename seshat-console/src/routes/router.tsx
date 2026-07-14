import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from '@/layout/AppLayout'
import { BootstrapGate } from '@/routes/BootstrapGate'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { RequireSuperAdmin } from '@/routes/RequireSuperAdmin'
import { LandingRedirect } from '@/routes/LandingRedirect'
import { lazyPage, renderLazyPage } from '@/routes/lazyPage'

const BootstrapPage = lazyPage(() => import('@/pages/auth/BootstrapPage').then((module) => ({ default: module.BootstrapPage })))
const LoginPage = lazyPage(() => import('@/pages/auth/LoginPage').then((module) => ({ default: module.LoginPage })))
const PlatformOverviewPage = lazyPage(() => import('@/pages/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const OrganizationOverviewPage = lazyPage(() => import('@/pages/organization/OrganizationOverviewPage').then((module) => ({ default: module.OrganizationOverviewPage })))
const OrganizationsPage = lazyPage(() => import('@/pages/organizations/OrganizationsPage').then((module) => ({ default: module.OrganizationsPage })))
const MyOrganizationsPage = lazyPage(() => import('@/pages/myOrganizations/MyOrganizationsPage').then((module) => ({ default: module.MyOrganizationsPage })))
const UsersPage = lazyPage(() => import('@/pages/users/UsersPage').then((module) => ({ default: module.UsersPage })))
const MembershipsPage = lazyPage(() => import('@/pages/memberships/MembershipsPage').then((module) => ({ default: module.MembershipsPage })))
const InvitationsPage = lazyPage(() => import('@/pages/invitations/InvitationsPage').then((module) => ({ default: module.InvitationsPage })))
const GroupsPage = lazyPage(() => import('@/pages/groups/GroupsPage').then((module) => ({ default: module.GroupsPage })))
const RolesPage = lazyPage(() => import('@/pages/roles/RolesPage').then((module) => ({ default: module.RolesPage })))
const PolicyBindingsPage = lazyPage(() => import('@/pages/policyBindings/PolicyBindingsPage').then((module) => ({ default: module.PolicyBindingsPage })))
const ApplicationsPage = lazyPage(() => import('@/pages/applications/ApplicationsPage').then((module) => ({ default: module.ApplicationsPage })))
const ProvidersPage = lazyPage(() => import('@/pages/providers/ProvidersPage').then((module) => ({ default: module.ProvidersPage })))
const SessionsPage = lazyPage(() => import('@/pages/sessions/SessionsPage').then((module) => ({ default: module.SessionsPage })))
const DevicesPage = lazyPage(() => import('@/pages/devices/DevicesPage').then((module) => ({ default: module.DevicesPage })))
const JobsPage = lazyPage(() => import('@/pages/jobs/JobsPage').then((module) => ({ default: module.JobsPage })))
const RunsPage = lazyPage(() => import('@/pages/runs/RunsPage').then((module) => ({ default: module.RunsPage })))
const ProviderSettingsPage = lazyPage(() => import('@/pages/providerSettings/ProviderSettingsPage').then((module) => ({ default: module.ProviderSettingsPage })))
const AuditEventsPage = lazyPage(() => import('@/pages/auditEvents/AuditEventsPage').then((module) => ({ default: module.AuditEventsPage })))
const CorporaPage = lazyPage(() => import('@/pages/knowledge/CorporaPage').then((module) => ({ default: module.CorporaPage })))
const CorpusDetailPage = lazyPage(() => import('@/pages/knowledge/CorpusDetailPage').then((module) => ({ default: module.CorpusDetailPage })))
const EmbedderSettingsPage = lazyPage(() => import('@/pages/knowledge/EmbedderSettingsPage').then((module) => ({ default: module.EmbedderSettingsPage })))
const PlatformProviderSettingsPage = lazyPage(() => import('@/pages/platform/PlatformProviderSettingsPage').then((module) => ({ default: module.PlatformProviderSettingsPage })))
const PlatformEmbedderSettingsPage = lazyPage(() => import('@/pages/platform/PlatformEmbedderSettingsPage').then((module) => ({ default: module.PlatformEmbedderSettingsPage })))
const NotFoundPage = lazyPage(() => import('@/pages/errors/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const NoAccessPage = lazyPage(() => import('@/pages/errors/NoAccessPage').then((module) => ({ default: module.NoAccessPage })))

export const router = createBrowserRouter([
  {
    element: <BootstrapGate />,
    children: [
      { path: '/bootstrap', element: renderLazyPage(BootstrapPage) },
      { path: '/login', element: renderLazyPage(LoginPage) },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <LandingRedirect /> },
              { path: '/my-organizations', element: renderLazyPage(MyOrganizationsPage) },
              { path: '/no-access', element: renderLazyPage(NoAccessPage) },
              {
                element: <RequireSuperAdmin />,
                children: [
                  { path: '/platform', element: <Navigate to="/platform/overview" replace /> },
                  { path: '/platform/overview', element: renderLazyPage(PlatformOverviewPage) },
                  { path: '/platform/organizations', element: renderLazyPage(OrganizationsPage) },
                  { path: '/platform/users', element: renderLazyPage(UsersPage) },
                  { path: '/platform/ai-defaults/providers', element: renderLazyPage(PlatformProviderSettingsPage) },
                  { path: '/platform/ai-defaults/embedder', element: renderLazyPage(PlatformEmbedderSettingsPage) },
                  { path: '/platform/security/sessions', element: renderLazyPage(SessionsPage) },
                  { path: '/platform/security/audit', element: renderLazyPage(AuditEventsPage) },
                ],
              },
              {
                path: '/orgs/:organizationId',
                children: [
                  { index: true, element: <Navigate to="overview" replace /> },
                  { path: 'overview', element: renderLazyPage(OrganizationOverviewPage) },
                  { path: 'team/memberships', element: renderLazyPage(MembershipsPage) },
                  { path: 'team/invitations', element: renderLazyPage(InvitationsPage) },
                  { path: 'team/groups', element: renderLazyPage(GroupsPage) },
                  { path: 'team/roles', element: renderLazyPage(RolesPage) },
                  { path: 'team/policies', element: renderLazyPage(PolicyBindingsPage) },
                  { path: 'ai/provider-settings', element: renderLazyPage(ProviderSettingsPage) },
                  { path: 'ai/embedder', element: renderLazyPage(EmbedderSettingsPage) },
                  { path: 'automation/devices', element: renderLazyPage(DevicesPage) },
                  { path: 'automation/jobs', element: renderLazyPage(JobsPage) },
                  { path: 'automation/runs', element: renderLazyPage(RunsPage) },
                  { path: 'knowledge/corpora', element: renderLazyPage(CorporaPage) },
                  { path: 'knowledge/corpora/:corpusId', element: renderLazyPage(CorpusDetailPage) },
                  { path: 'integrations/applications', element: renderLazyPage(ApplicationsPage) },
                  { path: 'integrations/providers', element: renderLazyPage(ProvidersPage) },
                  { path: 'activity/audit', element: renderLazyPage(AuditEventsPage) },
                ],
              },
              { path: '*', element: renderLazyPage(NotFoundPage) },
            ],
          },
        ],
      },
    ],
  },
])
