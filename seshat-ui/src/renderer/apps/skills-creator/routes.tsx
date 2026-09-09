import { Navigate, type RouteObject } from 'react-router'
import { SkillsCreatorPage } from './pages/SkillsCreatorPage'

export const skillsCreatorRoutes: RouteObject[] = [
  { index: true, element: <SkillsCreatorPage /> },
  { path: '*', element: <Navigate to="/skills-creator" replace /> },
]
