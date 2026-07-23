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
import { WorkspacePage } from '@/pages/workspace'
import { TeamPage } from '@/pages/team'
import { SchedulingPage } from '@/pages/scheduling'

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
      { path: 'workspace', element: <WorkspacePage /> },
      // Agents used to have its own separate page; that's now covered by
      // Workspace's Agents tab (the fuller, better-maintained UI) - redirect
      // rather than 404 for anyone with an old link/shortcut.
      { path: 'agents', element: <Navigate to="/workspace" replace /> },
      { path: 'knowledge', element: <Navigate to="/" replace /> },
      { path: 'memories', element: <Navigate to="/" replace /> },
      { path: 'scheduling', element: <SchedulingPage /> },
      // Scheduled Tasks / Automations were the old local-scheduler routes,
      // retired when automation moved to Seshat Server; kept as redirects
      // for anyone with an old link/shortcut.
      { path: 'scheduled-tasks', element: <Navigate to="/scheduling" replace /> },
      { path: 'automation', element: <Navigate to="/scheduling" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
