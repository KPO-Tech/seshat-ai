import { Navigate, useLocation, type RouteObject } from 'react-router'
import { AutomationPage } from './pages/AutomationPage'

function AutomationRoute() {
  const location = useLocation()
  return <AutomationPage key={location.pathname} />
}

export const automationRoutes: RouteObject[] = [
  { index: true, element: <AutomationRoute /> },
  { path: 'new', element: <AutomationRoute /> },
  { path: ':jobId', element: <AutomationRoute /> },
  { path: '*', element: <Navigate to="/automation" replace /> },
]
