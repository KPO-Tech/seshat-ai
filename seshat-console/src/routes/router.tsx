import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from '@/layout/AppLayout'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { RequireSuperAdmin } from '@/routes/RequireSuperAdmin'
import { RequireOrganizationManager } from '@/routes/RequireOrganizationManager'
import { LandingRedirect } from '@/routes/LandingRedirect'
import { lazyPage, renderLazyPage } from '@/routes/lazyPage'

const LoginPage = lazyPage(() => import('@/pages/auth/LoginPage').then((module) => ({ default: module.LoginPage })))
const RegisterPage = lazyPage(() => import('@/pages/auth/RegisterPage').then((module) => ({ default: module.RegisterPage })))
const CreateOrganizationPage = lazyPage(() =>
  import('@/pages/auth/CreateOrganizationPage').then((module) => ({ default: module.CreateOrganizationPage })),
)
const AcceptInvitationPage = lazyPage(() =>
  import('@/pages/auth/AcceptInvitationPage').then((module) => ({ default: module.AcceptInvitationPage })),
)
const ForgotPasswordPage = lazyPage(() =>
  import('@/pages/auth/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage })),
)
const ResetPasswordPage = lazyPage(() =>
  import('@/pages/auth/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage })),
)
const PlatformOverviewPage = lazyPage(() => import('@/pages/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const WorkspaceOverviewPage = lazyPage(() => import('@/pages/workspace/WorkspaceOverviewPage').then((module) => ({ default: module.WorkspaceOverviewPage })))
const WorkspaceChatPage = lazyPage(() => import('@/pages/workspace/WorkspaceChatPage').then((module) => ({ default: module.WorkspaceChatPage })))
const OrganizationOverviewPage = lazyPage(() => import('@/pages/organization/OrganizationOverviewPage').then((module) => ({ default: module.OrganizationOverviewPage })))
const OrganizationsPage = lazyPage(() => import('@/pages/organizations/OrganizationsPage').then((module) => ({ default: module.OrganizationsPage })))
const MyOrganizationsPage = lazyPage(() => import('@/pages/myOrganizations/MyOrganizationsPage').then((module) => ({ default: module.MyOrganizationsPage })))
const MyProfilePage = lazyPage(() => import('@/pages/profile/MyProfilePage').then((module) => ({ default: module.MyProfilePage })))
const ChangePasswordPage = lazyPage(() => import('@/pages/profile/ChangePasswordPage').then((module) => ({ default: module.ChangePasswordPage })))
const PreferencesPage = lazyPage(() => import('@/pages/profile/PreferencesPage').then((module) => ({ default: module.PreferencesPage })))
const MemoriesPage = lazyPage(() => import('@/pages/profile/MemoriesPage').then((module) => ({ default: module.MemoriesPage })))
const MemoryGraphPage = lazyPage(() => import('@/pages/profile/MemoryGraphPage').then((module) => ({ default: module.MemoryGraphPage })))
const QuotaUsagePage = lazyPage(() => import('@/pages/profile/QuotaUsagePage').then((module) => ({ default: module.QuotaUsagePage })))
const MembershipsPage = lazyPage(() => import('@/pages/memberships/MembershipsPage').then((module) => ({ default: module.MembershipsPage })))
const InvitationsPage = lazyPage(() => import('@/pages/invitations/InvitationsPage').then((module) => ({ default: module.InvitationsPage })))
const TeamsPage = lazyPage(() => import('@/pages/teams/TeamsPage').then((module) => ({ default: module.TeamsPage })))
const RolesPage = lazyPage(() => import('@/pages/roles/RolesPage').then((module) => ({ default: module.RolesPage })))
const PolicyBindingsPage = lazyPage(() => import('@/pages/policyBindings/PolicyBindingsPage').then((module) => ({ default: module.PolicyBindingsPage })))
const ApplicationsPage = lazyPage(() => import('@/pages/applications/ApplicationsPage').then((module) => ({ default: module.ApplicationsPage })))
const ProvidersPage = lazyPage(() => import('@/pages/providers/ProvidersPage').then((module) => ({ default: module.ProvidersPage })))
const SessionsPage = lazyPage(() => import('@/pages/sessions/SessionsPage').then((module) => ({ default: module.SessionsPage })))
const DevicesPage = lazyPage(() => import('@/pages/devices/DevicesPage').then((module) => ({ default: module.DevicesPage })))
const JobsPage = lazyPage(() => import('@/pages/jobs/JobsPage').then((module) => ({ default: module.JobsPage })))
const RunsPage = lazyPage(() => import('@/pages/runs/RunsPage').then((module) => ({ default: module.RunsPage })))
const ProviderSettingsPage = lazyPage(() => import('@/pages/providerSettings/ProviderSettingsPage').then((module) => ({ default: module.ProviderSettingsPage })))
const MCPServersPage = lazyPage(() => import('@/pages/mcpServers/MCPServersPage').then((module) => ({ default: module.MCPServersPage })))
const SkillReposPage = lazyPage(() => import('@/pages/skillRepos/SkillReposPage').then((module) => ({ default: module.SkillReposPage })))
const AgentPresetsPage = lazyPage(() => import('@/pages/agentPresets/AgentPresetsPage').then((module) => ({ default: module.AgentPresetsPage })))
const AuditEventsPage = lazyPage(() => import('@/pages/auditEvents/AuditEventsPage').then((module) => ({ default: module.AuditEventsPage })))
const CorporaPage = lazyPage(() => import('@/pages/knowledge/CorporaPage').then((module) => ({ default: module.CorporaPage })))
const CorpusDetailPage = lazyPage(() => import('@/pages/knowledge/CorpusDetailPage').then((module) => ({ default: module.CorpusDetailPage })))
const EmbedderSettingsPage = lazyPage(() => import('@/pages/knowledge/EmbedderSettingsPage').then((module) => ({ default: module.EmbedderSettingsPage })))
const WebSearchSettingsPage = lazyPage(() => import('@/pages/webSearch/WebSearchSettingsPage').then((module) => ({ default: module.WebSearchSettingsPage })))
const OrganizationPreferencesPage = lazyPage(() =>
  import('@/pages/organizationPreferences/OrganizationPreferencesPage').then((module) => ({ default: module.OrganizationPreferencesPage })),
)
const SystemStatusPage = lazyPage(() => import('@/pages/system/SystemStatusPage').then((module) => ({ default: module.SystemStatusPage })))
const NotFoundPage = lazyPage(() => import('@/pages/errors/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))
const NoAccessPage = lazyPage(() => import('@/pages/errors/NoAccessPage').then((module) => ({ default: module.NoAccessPage })))

export const router = createBrowserRouter([
  { path: '/login', element: renderLazyPage(LoginPage) },
  { path: '/register', element: renderLazyPage(RegisterPage) },
  { path: '/create-organization', element: renderLazyPage(CreateOrganizationPage) },
  { path: '/accept-invitation', element: renderLazyPage(AcceptInvitationPage) },
  { path: '/forgot-password', element: renderLazyPage(ForgotPasswordPage) },
  { path: '/reset-password', element: renderLazyPage(ResetPasswordPage) },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <LandingRedirect /> },
          { path: '/my-organizations', element: renderLazyPage(MyOrganizationsPage) },
          { path: '/workspace', element: <Navigate to="/workspace/overview" replace /> },
          { path: '/workspace/overview', element: renderLazyPage(WorkspaceOverviewPage) },
          { path: '/workspace/chat', element: renderLazyPage(WorkspaceChatPage) },
          { path: '/profile', element: <Navigate to="/me/profile" replace /> },
          { path: '/me', element: <Navigate to="/me/profile" replace /> },
          { path: '/me/profile', element: renderLazyPage(MyProfilePage) },
          { path: '/me/security', element: renderLazyPage(ChangePasswordPage) },
          { path: '/me/preferences', element: renderLazyPage(PreferencesPage) },
          { path: '/me/memories', element: renderLazyPage(MemoriesPage) },
          { path: '/me/memory-graph', element: renderLazyPage(MemoryGraphPage) },
          { path: '/me/quota-usage', element: renderLazyPage(QuotaUsagePage) },
          { path: '/no-access', element: renderLazyPage(NoAccessPage) },
          {
            element: <RequireSuperAdmin />,
            children: [
              { path: '/platform', element: <Navigate to="/platform/overview" replace /> },
              { path: '/platform/overview', element: renderLazyPage(PlatformOverviewPage) },
              { path: '/platform/organizations', element: renderLazyPage(OrganizationsPage) },
              { path: '/platform/security/sessions', element: renderLazyPage(SessionsPage) },
              { path: '/platform/security/audit', element: renderLazyPage(AuditEventsPage) },
              { path: '/platform/security/system', element: renderLazyPage(SystemStatusPage) },
            ],
          },
          {
            path: '/orgs/:organizationId',
            element: <RequireOrganizationManager />,
            children: [
              { index: true, element: <Navigate to="overview" replace /> },
              { path: 'overview', element: renderLazyPage(OrganizationOverviewPage) },
              { path: 'team/memberships', element: renderLazyPage(MembershipsPage) },
              { path: 'team/invitations', element: renderLazyPage(InvitationsPage) },
              { path: 'team/teams', element: renderLazyPage(TeamsPage) },
              { path: 'team/roles', element: renderLazyPage(RolesPage) },
              { path: 'team/policies', element: renderLazyPage(PolicyBindingsPage) },
              { path: 'ai/provider-settings', element: renderLazyPage(ProviderSettingsPage) },
              { path: 'ai/embedder', element: renderLazyPage(EmbedderSettingsPage) },
              { path: 'ai/web-search', element: renderLazyPage(WebSearchSettingsPage) },
              { path: 'ai/mcp-servers', element: renderLazyPage(MCPServersPage) },
              { path: 'preferences', element: renderLazyPage(OrganizationPreferencesPage) },
              { path: 'catalog/agent-presets', element: renderLazyPage(AgentPresetsPage) },
              { path: 'catalog/skill-repos', element: renderLazyPage(SkillReposPage) },
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
])
