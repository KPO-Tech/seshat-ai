import { createBrowserRouter, Navigate } from 'react-router-dom'
import { BootstrapGate } from '@/routes/BootstrapGate'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { AppLayout } from '@/layout/AppLayout'
import { BootstrapPage } from '@/pages/auth/BootstrapPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { OrganizationsPage } from '@/pages/organizations/OrganizationsPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { allNavItems } from '@/layout/nav'

// Every nav item not explicitly listed here falls back to a placeholder —
// see docs/casdoor-frontend-mapping.md for the intended build order.
const builtPages: Record<string, React.ReactNode> = {
  organizations: <OrganizationsPage />,
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
              { index: true, element: <Navigate to="/organizations" replace /> },
              ...allNavItems.map((item) => ({
                path: item.path,
                element: builtPages[item.key] ?? <PlaceholderPage title={item.label} />,
              })),
            ],
          },
        ],
      },
    ],
  },
])
