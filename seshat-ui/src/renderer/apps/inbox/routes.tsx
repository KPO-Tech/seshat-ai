import { Navigate, type RouteObject } from 'react-router'
import { InboxPage } from './pages/InboxPage'

export const inboxRoutes: RouteObject[] = [
  { index: true, element: <InboxPage /> },
  { path: '*', element: <Navigate to="/inbox" replace /> },
]
