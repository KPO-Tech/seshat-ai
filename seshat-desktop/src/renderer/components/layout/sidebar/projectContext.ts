import type { ChatSession } from '@renderer/stores/session'

const PROJECTS_STORAGE_KEY = 'seshat.projects.v1'

export function normalizeProjectPath(path: string): string {
  return path.trim().replace(/[\\/]+$/, '')
}

function readStoredProjectPath(projectId: string | null): string | null {
  if (!projectId) return null
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return null
    const project = parsed.find((item) => item?.id === projectId)
    return typeof project?.rootPath === 'string' ? project.rootPath : null
  } catch {
    return null
  }
}

// The sidebar's Recents are scoped to a project when the current URL points at
// one (?project=, /projects/:id or /conversation/:id of a project session).
export function resolveProjectContextPath(
  params: { projectParam: string | null; projectRouteId?: string; conversationRouteId?: string },
  sessions: ChatSession[]
): string | null {
  if (params.projectParam) return params.projectParam
  if (params.projectRouteId) {
    const decodedId = decodeURIComponent(params.projectRouteId)
    return readStoredProjectPath(decodedId)
      || sessions.find((s) => s.projectPath && `path-${normalizeProjectPath(s.projectPath).toLowerCase()}` === decodedId)?.projectPath
      || null
  }
  if (params.conversationRouteId) {
    return sessions.find((s) => s.id === params.conversationRouteId)?.projectPath || null
  }
  return null
}

// Chat sessions for the Recents list: no knowledge/inbox one-offs, and only
// those of the current project (or the ones outside any project).
export function selectRecentSessions(sessions: ChatSession[], projectContextPath: string | null, limit = 12): ChatSession[] {
  return sessions
    .filter((s) => s.source !== 'knowledge' && s.source !== 'inbox')
    .filter((s) => {
      if (!projectContextPath) return !s.projectPath
      return normalizeProjectPath(s.projectPath ?? '').toLowerCase() === normalizeProjectPath(projectContextPath).toLowerCase()
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, limit)
}
