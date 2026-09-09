import { Navigate, type RouteObject } from 'react-router'
import { KnowledgePage } from './pages/KnowledgePage'

export const knowledgeRoutes: RouteObject[] = [
  { index: true, element: <KnowledgePage /> },
  { path: '*', element: <Navigate to="/knowledge" replace /> },
]
