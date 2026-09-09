import { createHashRouter, Navigate } from 'react-router'
import { Shell } from '@/components/layout/Shell'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { Home } from '@/pages/Home'
import { Conversation } from '@/pages/Conversation'
import { Settings } from '@/pages/settings'
import { SkillsCreatorApp } from '@/apps/skills-creator'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { TeamPage } from '@/apps/team'
import { SchedulingApp } from '@/apps/scheduling'
import { AutomationApp } from '@/apps/automation'
import { HistoryPage } from '@/pages/history'
import { AppsPage } from '@/pages/app-launcher'
import { ProjectsPage } from '@/pages/projects'
import { KnowledgeApp } from '@/apps/knowledge'
import { InboxApp } from '@/apps/inbox'
import { CompanionPage } from '@/apps/companion'
import { AdminConsolePage } from '@/apps/admin'

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
      { path: 'admin/*', element: <AdminConsolePage /> },
      { path: 'user-settings', element: <Navigate to="/settings?tab=account" replace /> },
      { path: 'capabilities', element: <Navigate to="/settings" replace /> },
      { path: 'teams/*', element: <TeamPage /> },
      { path: 'skills-creator/*', element: <SkillsCreatorApp /> },
      { path: 'workspace/*', element: <Navigate to="/admin?tab=workspace" replace /> },
      { path: 'apps', element: <AppsPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:projectId', element: <ProjectsPage /> },
      { path: 'workflows/*', element: <Navigate to="/automation" replace /> },
      { path: 'history', element: <HistoryPage /> },
      // Workspace now lives under Admin Console; keep old shortcuts alive.
      { path: 'agents', element: <Navigate to="/admin?tab=workspace" replace /> },
      { path: 'knowledge/*', element: <KnowledgeApp /> },
      { path: 'inbox/*', element: <InboxApp /> },
      { path: 'companion/*', element: <CompanionPage /> },
      { path: 'memories', element: <Navigate to="/" replace /> },
      { path: 'scheduling/*', element: <SchedulingApp /> },
      { path: 'automation/*', element: <AutomationApp /> },
      // Scheduled Tasks was the old local-scheduler route, retired when
      // automation moved to Seshat Server; kept as a redirect for anyone
      // with an old link/shortcut.
      { path: 'scheduled-tasks', element: <Navigate to="/scheduling" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
