import { createBrowserRouter, Navigate } from 'react-router-dom'
import { BootstrapGate } from '@/routes/BootstrapGate'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { RequireSuperAdmin } from '@/routes/RequireSuperAdmin'
import { AppLayout } from '@/layout/AppLayout'
import { BootstrapPage } from '@/pages/auth/BootstrapPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { OrganizationsPage } from '@/pages/organizations/OrganizationsPage'
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
  corpora: <CorporaPage />,
  'embedder-settings': <EmbedderSettingsPage />,
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
              ...allNavItems.map((item) => ({
                path: item.path,
                element: builtPages[item.key] ?? <PlaceholderPage title={item.label} />,
              })),
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
