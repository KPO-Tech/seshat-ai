import { createHashRouter, Navigate } from 'react-router-dom'
import { Shell } from '@/components/layout/Shell'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { Home } from '@/pages/Home'
import { Conversation } from '@/pages/Conversation'
import { Settings } from '@/pages/settings'
import { UserSettings } from '@/pages/user-settings'
import { SkillsCreatorPage } from '@/pages/skills-creator'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { ScheduledTasksPage } from '@/pages/ScheduledTasks'
import { WorkspacePage } from '@/pages/workspace'
import { TeamPage } from '@/pages/team'

export const router = createHashRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/register',
    element: <Register />,
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <Shell />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Home /> },
      { path: 'conversation/:id', element: <Conversation /> },
      { path: 'settings', element: <Settings /> },
      { path: 'user-settings', element: <UserSettings /> },
      { path: 'capabilities', element: <Navigate to="/settings" replace /> },
      { path: 'teams', element: <TeamPage /> },
      { path: 'skills-creator', element: <SkillsCreatorPage /> },
      { path: 'scheduled-tasks', element: <ScheduledTasksPage /> },
      { path: 'workspace', element: <WorkspacePage /> },
      { path: 'knowledge', element: <Navigate to="/" replace /> },
      { path: 'memories', element: <Navigate to="/" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
