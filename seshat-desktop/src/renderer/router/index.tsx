import { createHashRouter, Navigate } from 'react-router'
import { Shell } from '@renderer/components/layout/Shell'
import { PluginsPage } from '@renderer/components/plugins/PluginsPage'
import { SchedulingPage } from '@renderer/components/scheduling/SchedulingPage'
import { SkillsPage } from '@renderer/components/skills/SkillsPage'
import { ConversationPage } from '@renderer/components/chat/conversation/ConversationPage'
import { HistoryPage } from '@renderer/pages/history'
import { Home } from '@renderer/pages/Home'
import { ProjectsPage } from '@renderer/pages/projects'
import { ProjectDetailPage } from '@renderer/pages/projects/detail'
import { RoutePlaceholder } from '@renderer/pages/RoutePlaceholder'

// Authentication is handled in App.tsx (this router only mounts once signed
// in), so every route below lives inside the shell.
export const router = createHashRouter([
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'conversation/:id', element: <ConversationPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'skills', element: <SkillsPage /> },
      { path: 'plugins', element: <PluginsPage /> },
      { path: 'scheduling', element: <SchedulingPage /> },
      { path: 'store', element: <RoutePlaceholder title="Store" /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:projectId', element: <ProjectDetailPage /> },
      { path: 'admin/*', element: <RoutePlaceholder title="Admin" /> }
    ]
  },
  { path: '*', element: <Navigate to="/" replace /> }
])
