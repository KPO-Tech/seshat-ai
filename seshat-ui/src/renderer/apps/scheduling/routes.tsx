import { Navigate, type RouteObject } from 'react-router'
import { SchedulingPage } from './pages/SchedulingPage'

export const schedulingRoutes: RouteObject[] = [
  { index: true, element: <SchedulingPage /> },
  { path: '*', element: <Navigate to="/scheduling" replace /> },
]
