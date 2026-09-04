import { createHashRouter, Navigate, useLocation } from 'react-router'
import { Shell } from '@/components/layout/Shell'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { Home } from '@/pages/Home'
import { Conversation } from '@/pages/Conversation'
import { Settings } from '@/pages/settings'
import { SkillsCreatorPage } from '@/pages/skills-creator'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { WorkspacePage } from '@/pages/workspace'
import { TeamPage } from '@/pages/team'
import { SchedulingPage } from '@/pages/scheduling'
import { AutomationPage } from '@/pages/automation'
import { HistoryPage } from '@/pages/history'
import { WorkflowsPage } from '@/pages/workflows'
import { AppsPage } from '@/pages/apps'
import { ProjectsPage } from '@/pages/projects'
import { KnowledgePage } from '@/pages/knowledge'
import { InboxPage } from '@/pages/inbox'
import { CompanionPage } from '@/pages/companion'
import { AdminConsolePage } from '@/pages/admin'

// AutomationPage covers Overview (/automation), a new job (/automation/new)
// and editing one (/automation/:jobId) in one component - none of these are
// separate mounts by default under react-router (same element reference), so
// without a key that changes per route, navigating Overview -> a job ->
// "New automation" would carry over the previous job's local state (name,
// graph, ...) instead of resetting it. Keying on the full path forces a
// clean remount on every one of those transitions.
function AutomationRoute() {
  const location = useLocation()
  return <AutomationPage key={location.pathname} />
}

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
      { path: 'admin', element: <AdminConsolePage /> },
      { path: 'user-settings', element: <Navigate to="/settings?tab=account" replace /> },
      { path: 'capabilities', element: <Navigate to="/settings" replace /> },
      { path: 'teams', element: <TeamPage /> },
      { path: 'skills-creator', element: <SkillsCreatorPage /> },
      { path: 'workspace', element: <WorkspacePage /> },
      { path: 'apps', element: <AppsPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:projectId', element: <ProjectsPage /> },
      { path: 'workflows', element: <WorkflowsPage /> },
      { path: 'history', element: <HistoryPage /> },
      // Agents used to have its own separate page; that's now covered by
      // Workspace's Agents tab (the fuller, better-maintained UI) - redirect
      // rather than 404 for anyone with an old link/shortcut.
      { path: 'agents', element: <Navigate to="/workspace" replace /> },
      { path: 'knowledge', element: <KnowledgePage /> },
      { path: 'inbox', element: <InboxPage /> },
      { path: 'companion', element: <CompanionPage /> },
      { path: 'memories', element: <Navigate to="/" replace /> },
      { path: 'scheduling', element: <SchedulingPage /> },
      // Automation is its own home now, separate from Scheduling - bare
      // /automation is its Overview (every graph-based job), /automation/new
      // and /automation/:jobId are the full-screen graph editor. Both pages
      // share the same ScheduledJob backend/list endpoint, just filtered to
      // opposite halves (Scheduling: prompt jobs, Automation: graph jobs) -
      // no separate backend entity, see AutomationPage's own doc comment.
      { path: 'automation', element: <AutomationRoute /> },
      { path: 'automation/new', element: <AutomationRoute /> },
      { path: 'automation/:jobId', element: <AutomationRoute /> },
      // Scheduled Tasks was the old local-scheduler route, retired when
      // automation moved to Seshat Server; kept as a redirect for anyone
      // with an old link/shortcut.
      { path: 'scheduled-tasks', element: <Navigate to="/scheduling" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
