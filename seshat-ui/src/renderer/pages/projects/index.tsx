import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  AddOne,
  Attention,
  Book,
  Browser as BrowserIcon,
  CheckOne,
  Command,
  DataSheet,
  Delete,
  Edit,
  FolderClose,
  FolderOpen,
  GridFour,
  LinkOne,
  List,
  Message,
  More,
  Refresh,
  Search,
  Time,
  Workbench,
} from '@icon-park/react'
import { api } from '@/api/client'
import type { Session } from '@/api/types'
import { useSessionStore, type ChatSession } from '@/stores/session'
import { normalizeSessionMessages } from '@/lib/chat'
import { deleteSession } from '@/lib/deleteSession'
import { UNTITLED_SESSION_TITLE } from '@/lib/sessionTitle'
import { BrowserPanel, RIGHT_PANEL_CSS } from '@/components/layout/RightPanelHost'

type ProjectRecord = {
  id: string
  name: string
  description: string
  rootPath: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'seshat.projects.v1'
// Removing a project only deletes its localStorage customization (name,
// saved-project record) - the underlying sessions still carry projectPath,
// so buildProjects() would otherwise just re-synthesize the same project
// on the next render. This separate "tombstone" set is what actually keeps
// a removed project out of the Hub.
const REMOVED_STORAGE_KEY = 'seshat.projects.removed.v1'

function readProjects(): ProjectRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((project) => !String(project?.id ?? '').startsWith('sample-')) : []
  } catch {
    return []
  }
}

function writeProjects(projects: ProjectRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

function readRemovedPaths(): Set<string> {
  try {
    const raw = localStorage.getItem(REMOVED_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((item) => typeof item === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function writeRemovedPaths(paths: Set<string>) {
  localStorage.setItem(REMOVED_STORAGE_KEY, JSON.stringify([...paths]))
}

function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, '')
  return normalized.split(/[\\/]/).pop() || 'Untitled project'
}

function normalizePath(path: string): string {
  return path.trim().replace(/[\\/]+$/, '')
}

function sessionToChatSession(session: Session): ChatSession {
  return {
    id: session.session_id,
    title: session.title || 'Untitled conversation',
    messages: normalizeSessionMessages(session.messages ?? []),
    createdAt: new Date(session.created_at * 1000).toISOString(),
    updatedAt: new Date(session.updated_at * 1000).toISOString(),
    providerSettingId: session.provider_setting_id,
    modelId: session.model_id,
    permissionMode: session.permission_mode,
    executionOrigin: session.execution_origin,
    workspacePath: session.workspace_path,
    projectPath: session.project_path,
  }
}

function formatActivity(project: ProjectRecord) {
  const time = new Date(project.updatedAt).getTime()
  if (!Number.isFinite(time)) return 'Recently'
  const diff = Date.now() - time
  const hours = Math.max(1, Math.round(diff / 36e5))
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function formatSessionTime(session: ChatSession) {
  const date = new Date(session.updatedAt || session.createdAt)
  if (!Number.isFinite(date.getTime())) return 'Recently'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function sessionKind(session: ChatSession) {
  if (session.source === 'knowledge') return 'Knowledge'
  if (session.source === 'inbox') return 'Inbox'
  if (session.executionOrigin === 'plan') return 'Plan'
  return 'Chat'
}

// No dedicated "session failed" flag exists in the store - a failure shows
// up as a failed tool_use in the last message instead, so that's what we
// check rather than inventing a new status field.
function sessionHasError(session: ChatSession): boolean {
  const last = session.messages[session.messages.length - 1]
  if (!last) return false
  return last.content.some((block) => block.type === 'tool_use' && block._status === 'failed')
}

function sessionStatus(session: ChatSession, streaming: boolean): 'running' | 'error' | 'completed' {
  if (streaming) return 'running'
  if (sessionHasError(session)) return 'error'
  return 'completed'
}

type TerminalLine = {
  id: string
  text: string
  kind: 'input' | 'stdout' | 'stderr' | 'system'
}

function buildProjects(saved: ProjectRecord[], sessions: ChatSession[], removedPaths: Set<string>): ProjectRecord[] {
  const byPath = new Map<string, ProjectRecord>()
  for (const project of saved) {
    const rootPath = normalizePath(project.rootPath)
    if (!rootPath || removedPaths.has(rootPath.toLowerCase())) continue
    byPath.set(rootPath.toLowerCase(), { ...project, rootPath })
  }

  for (const session of sessions) {
    const rootPath = normalizePath(session.projectPath ?? '')
    if (!rootPath || removedPaths.has(rootPath.toLowerCase())) continue
    const key = rootPath.toLowerCase()
    const existing = byPath.get(key)
    const updatedAt = session.updatedAt || session.createdAt
    if (existing) {
      byPath.set(key, {
        ...existing,
        updatedAt: new Date(updatedAt).getTime() > new Date(existing.updatedAt).getTime()
          ? updatedAt
          : existing.updatedAt,
      })
      continue
    }
    byPath.set(key, {
      id: `path-${key}`,
      name: basename(rootPath),
      description: 'Local work context',
      rootPath,
      createdAt: session.createdAt,
      updatedAt,
    })
  }

  return [...byPath.values()].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function ProjectsPage() {
  const navigate = useNavigate()
  const { projectId } = useParams()
  const openedId = projectId ? decodeURIComponent(projectId) : null
  const sessions = useSessionStore((s) => s.sessions)
  const upsertSession = useSessionStore((s) => s.upsertSession)
  const updateSession = useSessionStore((s) => s.updateSession)
  const isSessionStreaming = useSessionStore((s) => s.isSessionStreaming)
  const [savedProjects, setSavedProjects] = useState<ProjectRecord[]>([])
  const [removedPaths, setRemovedPaths] = useState<Set<string>>(() => new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [appsViewMode, setAppsViewMode] = useState<'grid' | 'list'>('list')
  const [rightPanelView, setRightPanelView] = useState<'terminal' | 'browser'>('terminal')
  const [terminalRunning, setTerminalRunning] = useState(false)
  const [terminalShellLabel, setTerminalShellLabel] = useState('Shell')
  const terminalRef = useRef<ProjectTerminalHandle>(null)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [projectMenuId, setProjectMenuId] = useState<string | null>(null)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingProjectName, setEditingProjectName] = useState('')
  const [sessionMenuId, setSessionMenuId] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingSessionTitle, setEditingSessionTitle] = useState('')
  const [contextStatus, setContextStatus] = useState<Record<string, boolean>>({})
  const [pathExists, setPathExists] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setSavedProjects(readProjects())
    setRemovedPaths(readRemovedPaths())
  }, [])

  useEffect(() => {
    if (sessions.length > 0 || sessionsLoading || sessionsLoaded) return
    setSessionsLoading(true)
    api.get<{ sessions: Session[] }>('/sessions')
      .then((response) => {
        for (const session of response.sessions ?? []) {
          upsertSession(sessionToChatSession(session))
        }
      })
      .catch(() => {})
      .finally(() => {
        setSessionsLoaded(true)
        setSessionsLoading(false)
      })
  }, [sessions.length, sessionsLoaded, sessionsLoading, upsertSession])

  const projects = useMemo(() => buildProjects(savedProjects, sessions, removedPaths), [savedProjects, sessions, removedPaths])

  useEffect(() => {
    const hasProjectContextFile = window.nexus?.hasProjectContextFile
    if (!hasProjectContextFile) return
    const missing = projects.filter((project) => !(project.rootPath in contextStatus))
    if (missing.length === 0) return
    let cancelled = false
    for (const project of missing) {
      void hasProjectContextFile(project.rootPath).then((hasContext) => {
        if (cancelled) return
        setContextStatus((current) => ({ ...current, [project.rootPath]: hasContext }))
      }).catch(() => undefined)
    }
    return () => { cancelled = true }
  }, [projects, contextStatus])

  useEffect(() => {
    const projectPathExists = window.nexus?.projectPathExists
    if (!projectPathExists) return
    const missing = projects.filter((project) => !(project.rootPath in pathExists))
    if (missing.length === 0) return
    let cancelled = false
    for (const project of missing) {
      void projectPathExists(project.rootPath).then((exists) => {
        if (cancelled) return
        setPathExists((current) => ({ ...current, [project.rootPath]: exists }))
      }).catch(() => undefined)
    }
    return () => { cancelled = true }
  }, [projects, pathExists])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('.project-menu-wrap')) return
      if (target?.closest('.session-menu-wrap')) return
      setProjectMenuId(null)
      setSessionMenuId(null)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  function persistProject(id: string, patch: Partial<Pick<ProjectRecord, 'name'>>) {
    const project = projects.find((p) => p.id === id)
    if (!project) return
    const now = new Date().toISOString()
    const updated: ProjectRecord = { ...project, ...patch, updatedAt: now }
    const persisted = savedProjects.filter(
      (p) => normalizePath(p.rootPath).toLowerCase() !== normalizePath(project.rootPath).toLowerCase(),
    )
    const next = [updated, ...persisted]
    setSavedProjects(next)
    writeProjects(next)
  }

  function startRenameProject(id: string, currentName: string) {
    setProjectMenuId(null)
    setEditingProjectId(id)
    setEditingProjectName(currentName)
  }

  function commitRenameProject(id: string) {
    const name = editingProjectName.trim()
    setEditingProjectId(null)
    if (!name) return
    persistProject(id, { name })
  }

  function removeProject(id: string) {
    setProjectMenuId(null)
    const project = projects.find((p) => p.id === id)
    if (!project) return
    if (!window.confirm(`Remove "${project.name}" from the Project Hub? Its sessions and files are kept - it will just no longer show up here.`)) {
      return
    }
    const key = normalizePath(project.rootPath).toLowerCase()
    const nextRemoved = new Set(removedPaths)
    nextRemoved.add(key)
    setRemovedPaths(nextRemoved)
    writeRemovedPaths(nextRemoved)
    const nextSaved = savedProjects.filter((p) => normalizePath(p.rootPath).toLowerCase() !== key)
    setSavedProjects(nextSaved)
    writeProjects(nextSaved)
    if (openedId === id) navigate('/projects')
    if (selectedId === id) setSelectedId(null)
  }

  function startRenameSession(id: string, currentTitle?: string) {
    setSessionMenuId(null)
    setEditingSessionId(id)
    setEditingSessionTitle((currentTitle || UNTITLED_SESSION_TITLE).trim())
  }

  async function commitRenameSession(id: string) {
    const nextTitle = editingSessionTitle.trim()
    setEditingSessionId(null)
    if (!nextTitle) {
      setEditingSessionTitle('')
      return
    }
    updateSession(id, { title: nextTitle, updatedAt: new Date().toISOString() })
    setEditingSessionTitle('')
    try {
      await api.patch(`/sessions/${id}`, { title: nextTitle })
    } catch {
      // noop for now
    }
  }

  async function handleDeleteSession(id: string) {
    setSessionMenuId(null)
    try {
      await deleteSession(id)
    } catch {
      // noop for now
    }
  }

  useEffect(() => {
    if (!projects.length) {
      setSelectedId(null)
      return
    }
    setSelectedId((current) => current && projects.some((project) => project.id === current) ? current : projects[0].id)
  }, [projects])

  const selected = useMemo(
    () => projects.find((project) => project.id === (openedId ?? selectedId)) ?? projects[0] ?? null,
    [projects, selectedId, openedId],
  )

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((project) =>
      project.name.toLowerCase().includes(q)
      || project.rootPath.toLowerCase().includes(q)
      || project.description.toLowerCase().includes(q)
    )
  }, [projects, query])

  const detailProject = openedId ? projects.find((project) => project.id === openedId) ?? null : null

  const projectSessions = useMemo(() => {
    if (!detailProject) return []
    const rootPath = normalizePath(detailProject.rootPath).toLowerCase()
    return sessions
      .filter((session) => normalizePath(session.projectPath ?? '').toLowerCase() === rootPath)
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
  }, [detailProject, sessions])

  async function createFromFolder() {
    const result = await window.nexus?.dialog?.openDirectory?.()
    if (!result || result.canceled || !result.filePaths?.[0]) return
    const rootPath = result.filePaths[0]
    const now = new Date().toISOString()
    const normalizedRoot = normalizePath(rootPath)
    const existing = projects.find((project) => normalizePath(project.rootPath).toLowerCase() === normalizedRoot.toLowerCase())
    if (existing) {
      setSelectedId(existing.id)
      navigate('/projects')
      return
    }

    const nextProject: ProjectRecord = {
      id: crypto.randomUUID(),
      name: basename(normalizedRoot),
      description: 'Local work context',
      rootPath: normalizedRoot,
      createdAt: now,
      updatedAt: now,
    }
    const persisted = savedProjects.filter((project) => normalizePath(project.rootPath).toLowerCase() !== normalizedRoot.toLowerCase())
    const nextProjects = [nextProject, ...persisted]
    setSavedProjects(nextProjects)
    setSelectedId(nextProject.id)
    navigate('/projects')
    writeProjects(nextProjects)

    if (removedPaths.has(normalizedRoot.toLowerCase())) {
      const nextRemoved = new Set(removedPaths)
      nextRemoved.delete(normalizedRoot.toLowerCase())
      setRemovedPaths(nextRemoved)
      writeRemovedPaths(nextRemoved)
    }
  }

  return (
    <div className="projects-root">
      <style>{PROJECTS_CSS}</style>
      <header className="projects-topbar">
        <div className="projects-heading-wrap">
          {detailProject ? (
            <div className="projects-topbar-title-group">
              <span className="projects-topbar-subtitle" title={detailProject.rootPath}>{detailProject.rootPath}</span>
              <span className="projects-topbar-sep">/</span>
              {editingProjectId === detailProject.id ? (
                <input
                  className="projects-topbar-title-input"
                  value={editingProjectName}
                  autoFocus
                  onChange={(event) => setEditingProjectName(event.target.value)}
                  onBlur={() => commitRenameProject(detailProject.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') { event.preventDefault(); commitRenameProject(detailProject.id) }
                    else if (event.key === 'Escape') setEditingProjectId(null)
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="projects-topbar-title-edit"
                  onClick={() => startRenameProject(detailProject.id, detailProject.name)}
                >
                  <strong>{detailProject.name}</strong>
                  <Edit size={12} />
                </button>
              )}
            </div>
          ) : (
            <div className="projects-topbar-title">Projects</div>
          )}
        </div>
        <div className="projects-topbar-actions">
          {!detailProject && (
            <label className="projects-search-field">
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects..."
              />
            </label>
          )}
          <button className="projects-primary-btn" type="button" onClick={() => { void createFromFolder() }}>
            <AddOne size={14} /> New Project
          </button>
        </div>
      </header>

      {!detailProject ? (
      <main className="projects-home-content">
        <section className="projects-browser">
          <div className="projects-browser-head">
            <div>
              <span className="projects-section-icon"><Time size={15} /></span>
              <strong>Project Hub</strong>
            </div>
            <span>{projects.length} project{projects.length === 1 ? '' : 's'}</span>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="projects-empty-state">
              <span><FolderOpen size={24} /></span>
              <strong>{projects.length === 0 ? 'No projects yet' : 'No matching projects'}</strong>
              <p>{projects.length === 0 ? 'Choose a local folder or start a chat with a project folder attached.' : 'Try a different project name or path.'}</p>
              {projects.length === 0 && (
                <button type="button" onClick={() => { void createFromFolder() }}>
                  <FolderOpen size={14} /> Choose Folder
                </button>
              )}
            </div>
          ) : (
          <div className="projects-list">
            <div className="projects-list-header" aria-hidden="true">
              <span>Project</span>
              <span>Context</span>
              <span>Apps</span>
              <span>Activity</span>
              <span />
            </div>
            <div className="projects-list-body">
              {filteredProjects.map((project) => {
                const projectSessionCount = sessions.filter(
                  (session) => normalizePath(session.projectPath ?? '').toLowerCase() === normalizePath(project.rootPath).toLowerCase(),
                ).length
                const hasContext = contextStatus[project.rootPath]
                const isMissing = pathExists[project.rootPath] === false
                return (
                  <div
                    key={project.id}
                    className={`project-row ${selected?.id === project.id ? 'active' : ''}`}
                    onClick={() => {
                      if (editingProjectId === project.id) return
                      setSelectedId(project.id)
                      navigate(`/projects/${encodeURIComponent(project.id)}`)
                    }}
                  >
                    {editingProjectId === project.id ? (
                      <input
                        className="project-row-rename"
                        value={editingProjectName}
                        autoFocus
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setEditingProjectName(event.target.value)}
                        onBlur={() => commitRenameProject(project.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') { event.preventDefault(); commitRenameProject(project.id) }
                          else if (event.key === 'Escape') setEditingProjectId(null)
                        }}
                      />
                    ) : (
                      <>
                        <span className="project-row-main">
                          <span className={`project-folder-icon${isMissing ? ' missing' : ''}`}>
                            {isMissing ? <Attention size={18} /> : <FolderClose size={20} />}
                          </span>
                          <span className="project-card-copy">
                            <strong>{project.name}</strong>
                            <small title={project.rootPath}>{project.rootPath}</small>
                          </span>
                        </span>
                        <span className="project-row-context">
                          {isMissing ? (
                            <small className="project-context-badge missing" title="This folder could not be found on disk">
                              <Attention size={11} /> Folder not found
                            </small>
                          ) : hasContext === undefined ? (
                            <small className="project-context-badge pending">Checking...</small>
                          ) : hasContext ? (
                            <small className="project-context-badge set"><CheckOne size={11} /> Context set</small>
                          ) : (
                            <small className="project-context-badge unset">No context yet</small>
                          )}
                        </span>
                        <span className="project-mini-apps">
                          <span className="mini-app chat" title="Seshat"><Message size={12} /></span>
                          <span className="mini-app folder" title="Folder"><FolderOpen size={12} /></span>
                          <span className="mini-app terminal" title="Terminal"><Command size={12} /></span>
                          <span className="mini-count" title="Sessions using this project">{projectSessionCount}</span>
                        </span>
                        <span className="project-row-activity">{formatActivity(project)}</span>
                      </>
                    )}
                    <div className="project-menu-wrap" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className={`project-row-action${projectMenuId === project.id ? ' open' : ''}`}
                        onClick={() => setProjectMenuId((current) => current === project.id ? null : project.id)}
                      >
                        <More size={14} />
                      </button>
                      {projectMenuId === project.id && (
                        <div className="project-row-menu">
                          <button type="button" onClick={() => startRenameProject(project.id, project.name)}>
                            <Edit size={12} />
                            <span>Rename</span>
                          </button>
                          <button type="button" className="danger" onClick={() => removeProject(project.id)}>
                            <Delete size={12} />
                            <span>Remove</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          )}

        </section>
        <div className="projects-home-foot">{sessionsLoading ? 'Loading sessions...' : 'Local project contexts'}</div>
      </main>
      ) : (
      <main className="project-detail-content">
        <section className="project-canvas">
          {detailProject ? (
            <>
              <div className="project-workbench-panel">
                <div className="project-main-column">
                  {pathExists[detailProject.rootPath] === false && (
                    <div className="project-missing-banner">
                      <Attention size={15} />
                      <span>This folder could not be found on disk. Sessions and history are kept, but Seshat, Terminal, and Browser actions here may fail.</span>
                    </div>
                  )}
                  <div className="project-apps-panel">
                    <div className="project-apps-head">
                      <strong>Apps</strong>
                      <div className="project-apps-view-toggle" aria-label="Apps view mode">
                        <button
                          className={appsViewMode === 'grid' ? 'active' : ''}
                          type="button"
                          aria-label="Grid view"
                          onClick={() => setAppsViewMode('grid')}
                        >
                          <GridFour size={13} />
                        </button>
                        <button
                          className={appsViewMode === 'list' ? 'active' : ''}
                          type="button"
                          aria-label="List view"
                          onClick={() => setAppsViewMode('list')}
                        >
                          <List size={13} />
                        </button>
                      </div>
                    </div>
                    <div className={`project-apps-grid project-apps-grid--${appsViewMode}`}>
                      <button
                        className="project-app-row active"
                        type="button"
                        onClick={() => navigate(`/?project=${encodeURIComponent(detailProject.rootPath)}`)}
                      >
                        <span className="project-app-icon seshat"><Message size={16} /></span>
                        <span className="project-app-copy">
                          <strong>Seshat</strong>
                          <small className="project-app-copy-hint">Ask anything about this project →</small>
                        </span>
                      </button>
                      <button className="project-app-row disabled" type="button" disabled>
                        <span className="project-app-icon notebook"><Book size={16} /></span>
                        <span className="project-app-copy">
                          <strong>Notebook</strong>
                          <small>Coming soon</small>
                        </span>
                      </button>
                      <button className="project-app-row disabled" type="button" disabled>
                        <span className="project-app-icon datalab"><DataSheet size={16} /></span>
                        <span className="project-app-copy">
                          <strong>Data Lab</strong>
                          <small>Coming soon</small>
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="project-runs-panel">
                    <div className="project-runs-head">
                      <div>
                        <More size={15} />
                        <strong>Recent Sessions / Runs</strong>
                      </div>
                    </div>
                    <div className="project-runs-list">
                      {projectSessions.length === 0 ? (
                        <div className="project-runs-empty">
                          No sessions have used this project yet.
                        </div>
                      ) : projectSessions.map((session) => {
                        const status = sessionStatus(session, isSessionStreaming(session.id))
                        return (
                        <div
                          key={session.id}
                          className="project-run-row"
                          onClick={() => {
                            if (editingSessionId === session.id) return
                            navigate(`/conversation/${session.id}`)
                          }}
                        >
                          <span className={`project-run-icon ${session.source === 'knowledge' ? 'knowledge' : 'chat'}`} />
                          {editingSessionId === session.id ? (
                            <input
                              className="project-run-rename"
                              value={editingSessionTitle}
                              autoFocus
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => setEditingSessionTitle(event.target.value)}
                              onBlur={() => { void commitRenameSession(session.id) }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') { event.preventDefault(); void commitRenameSession(session.id) }
                                else if (event.key === 'Escape') { setEditingSessionId(null); setEditingSessionTitle('') }
                              }}
                            />
                          ) : (
                            <div>
                              <strong>{session.title || UNTITLED_SESSION_TITLE}</strong>
                              <small>{sessionKind(session)}</small>
                            </div>
                          )}
                          <time>{formatSessionTime(session)}</time>
                          <span className={`project-run-status ${status}`}>
                            {status === 'running' ? 'Running' : status === 'error' ? 'Error' : 'Completed'}
                          </span>
                          <div className="session-menu-wrap" onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              className={`project-run-menu-btn${sessionMenuId === session.id ? ' open' : ''}`}
                              aria-label="Session actions"
                              onClick={() => setSessionMenuId((current) => current === session.id ? null : session.id)}
                            >
                              <More size={13} />
                            </button>
                            {sessionMenuId === session.id && (
                              <div className="project-row-menu">
                                <button type="button" onClick={() => startRenameSession(session.id, session.title)}>
                                  <Edit size={12} />
                                  <span>Rename</span>
                                </button>
                                <button type="button" className="danger" onClick={() => { void handleDeleteSession(session.id) }}>
                                  <Delete size={12} />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="project-right-panel">
                  <style>{RIGHT_PANEL_CSS}</style>
                  <div className="project-right-panel-tabs">
                    <div className="project-right-panel-switch">
                      <button
                        type="button"
                        className={rightPanelView === 'terminal' ? 'active' : ''}
                        aria-label="Terminal"
                        onClick={() => setRightPanelView('terminal')}
                      >
                        <Command size={14} />
                      </button>
                      <button
                        type="button"
                        className={rightPanelView === 'browser' ? 'active' : ''}
                        aria-label="Browser"
                        onClick={() => setRightPanelView('browser')}
                      >
                        <BrowserIcon size={14} />
                      </button>
                    </div>
                    {rightPanelView === 'terminal' && (
                      <div className="project-right-panel-actions">
                        <em>{terminalRunning ? terminalShellLabel : 'Stopped'}</em>
                        <button type="button" aria-label="Clear" onClick={() => terminalRef.current?.clear()}>
                          <Delete size={13} />
                        </button>
                        <button type="button" aria-label="Restart" onClick={() => terminalRef.current?.restart()}>
                          <Refresh size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label="Open in external terminal"
                          onClick={() => { void window.nexus?.openTerminal?.(detailProject.rootPath) }}
                        >
                          <LinkOne size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                  <ProjectTerminal
                    ref={terminalRef}
                    projectPath={detailProject.rootPath}
                    hidden={rightPanelView !== 'terminal'}
                    onStatusChange={(running, shellLabel) => {
                      setTerminalRunning(running)
                      setTerminalShellLabel(shellLabel)
                    }}
                  />
                  {rightPanelView === 'browser' && (
                    <BrowserPanel contextId={`project:${normalizePath(detailProject.rootPath).toLowerCase()}`} />
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="project-empty">
              <span><Workbench size={28} /></span>
              <h1>Create a project</h1>
              <p>Choose a local folder to create a concrete work context for chats, apps, files, runs, and project settings.</p>
              <button type="button" onClick={() => { void createFromFolder() }}>
                <FolderOpen size={14} /> Choose Folder
              </button>
            </div>
          )}
        </section>
      </main>
      )}
    </div>
  )
}

type ProjectTerminalHandle = {
  clear: () => void
  restart: () => void
}

type ProjectTerminalProps = {
  projectPath: string
  hidden: boolean
  onStatusChange: (running: boolean, shellLabel: string) => void
}

const ProjectTerminal = forwardRef<ProjectTerminalHandle, ProjectTerminalProps>(function ProjectTerminal(
  { projectPath, hidden, onStatusChange },
  ref,
) {
  const terminalIdRef = useRef(`project-terminal-${crypto.randomUUID()}`)
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [lines, setLines] = useState<TerminalLine[]>([])
  const [command, setCommand] = useState('')
  const [running, setRunning] = useState(false)
  const [shellLabel, setShellLabel] = useState('Shell')

  useEffect(() => {
    onStatusChange(running, shellLabel)
  }, [running, shellLabel, onStatusChange])

  function appendLine(text: string, kind: TerminalLine['kind'] = 'system') {
    if (!text) return
    const escape = String.fromCharCode(27)
    if (text.includes(`${escape}c`) || text.includes(`${escape}[2J`) || text.includes(`${escape}[3J`)) {
      setLines([])
      text = text
        .replaceAll(`${escape}c`, '')
        .replace(new RegExp(`${escape.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[[0-9;]*[A-Za-z]`, 'g'), '')
      if (!text.trim()) return
    }
    setLines((current) => [
      ...current,
      ...text.replace(/\r/g, '').split('\n').filter(Boolean).map((part) => ({
        id: crypto.randomUUID(),
        text: part,
        kind,
      })),
    ].slice(-500))
  }

  async function startTerminal() {
    const terminal = window.nexus?.terminal
    if (!terminal) {
      appendLine('Internal terminal is only available in the desktop app.', 'stderr')
      return
    }
    const id = terminalIdRef.current
    setRunning(false)
    setLines([])
    try {
      const result = await terminal.start({ id, cwd: projectPath })
      setShellLabel(result.shell)
      setRunning(true)
      appendLine(`${result.shell} ready in ${result.cwd}`, 'system')
    } catch (error) {
      appendLine(error instanceof Error ? error.message : 'Terminal failed to start.', 'stderr')
    }
  }

  useImperativeHandle(ref, () => ({
    clear: () => setLines([]),
    restart: () => { void startTerminal() },
  }))

  useEffect(() => {
    const terminal = window.nexus?.terminal
    const id = terminalIdRef.current
    const unsubscribe = terminal?.onEvent(id, (event) => {
      if (event.type === 'started') {
        setRunning(true)
        if (event.shell) setShellLabel(event.shell)
        return
      }
      if (event.type === 'data') {
        appendLine(event.data ?? '', event.stream === 'stderr' ? 'stderr' : 'stdout')
        return
      }
      if (event.type === 'error') {
        appendLine(event.message ?? 'Terminal error.', 'stderr')
        setRunning(false)
        return
      }
      if (event.type === 'exit') {
        if (event.code !== null || event.signal !== null) {
          appendLine(`Terminal exited${event.code !== undefined && event.code !== null ? ` with code ${event.code}` : ''}.`, 'system')
          setRunning(false)
        }
      }
    })
    void startTerminal()
    return () => {
      unsubscribe?.()
      void terminal?.stop(id).catch(() => undefined)
    }
  }, [projectPath])

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight })
  }, [lines])

  async function submitCommand(event: React.FormEvent) {
    event.preventDefault()
    const value = command.trim()
    if (!value || !running) return
    setCommand('')
    if (/^(clear|cls|clear-host)$/i.test(value)) {
      setLines([])
    }
    await window.nexus?.terminal?.write(terminalIdRef.current, `${value}\n`).catch((error) => {
      appendLine(error instanceof Error ? error.message : 'Command failed.', 'stderr')
      setRunning(false)
    })
  }

  return (
    <section
      className="project-terminal-panel"
      style={hidden ? { display: 'none' } : undefined}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="terminal-lines" ref={outputRef}>
        {lines.length === 0 ? (
          <span className="terminal-muted">Starting terminal...</span>
        ) : lines.map((line) => (
          <span key={line.id} className={`terminal-line terminal-line--${line.kind}`}>
            {line.text}
          </span>
        ))}
      </div>
      <form className="terminal-input-row" onSubmit={submitCommand}>
        <span>{running ? '>' : '!'}</span>
        <input
          ref={inputRef}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={running ? 'Run a command in this project...' : 'Terminal stopped'}
          disabled={!running}
          spellCheck={false}
        />
      </form>
    </section>
  )
})

const PROJECTS_CSS = `
.projects-root {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-surface);
  color: var(--color-text);
}

.projects-topbar {
  min-height: 52px;
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 8px 17px;
  border-bottom: 1px solid var(--color-border-subtle);
  background: var(--color-bg);
}

.projects-primary-btn {
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.035);
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.projects-heading-wrap {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.projects-topbar-title {
  justify-self: start;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-base);
  font-weight: 700;
}

.projects-topbar-title-group {
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
}

.projects-topbar-sep {
  flex-shrink: 0;
  color: var(--color-text-muted);
  opacity: 0.5;
}

.projects-topbar-title-edit {
  min-width: 0;
  flex-shrink: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: var(--color-text);
  padding: 0;
  cursor: pointer;
}

.projects-topbar-title-edit strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-base);
  font-weight: 700;
}

.projects-topbar-title-edit svg {
  flex-shrink: 0;
  color: var(--color-text-muted);
  opacity: 0;
}

.projects-topbar-title-edit:hover svg {
  opacity: 1;
}

.projects-topbar-title-input {
  height: 24px;
  max-width: 340px;
  border: 1px solid rgba(239, 124, 47, 0.4);
  border-radius: 6px;
  background: var(--color-surface);
  color: var(--color-text);
  padding: 0 8px;
  font: inherit;
  font-size: var(--font-size-base);
  font-weight: 700;
  outline: 0;
}

.projects-topbar-subtitle {
  flex: 1 1 auto;
  min-width: 40px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
  font-size: 11px;
}

.projects-topbar-actions {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 10px;
}

.projects-search-field {
  width: min(280px, 28vw);
  height: 30px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--color-text-muted);
}

.projects-search-field input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-size-2xs);
}

.projects-search-field input::placeholder {
  color: var(--color-text-muted);
}

.projects-primary-btn {
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 10px;
  border: 0;
  background: var(--color-cta);
  color: #fff;
  font-size: var(--font-size-2xs);
}

.project-terminal-panel:hover,
.project-run-row:hover {
  border-color: rgba(239, 124, 47, 0.38);
  color: var(--color-text);
}

.projects-home-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 22px;
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.projects-browser {
  flex: 1;
  min-height: 0;
  padding: 0;
  border-right: 0;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.projects-browser-head,
.projects-browser-foot,
.project-runs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.projects-browser-head {
  height: 34px;
}

.projects-browser-head div,
.project-runs-head div {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.projects-section-icon {
  color: var(--color-cta);
  display: flex;
}

.projects-browser-head strong,
.project-runs-head strong {
  font-size: 13px;
}

.projects-browser-head span,
.project-runs-head button,
.projects-browser-foot button {
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.projects-list {
  flex: 1;
  min-height: 0;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 8px;
  background: var(--color-bg);
  overflow: hidden;
  display: grid;
  grid-template-rows: 38px minmax(0, 1fr);
}

.projects-list-header,
.project-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 110px 120px 110px 34px;
  align-items: center;
  gap: 14px;
}

.projects-list-header {
  padding: 0 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}

.projects-list-body {
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

.project-row {
  position: relative;
  width: 100%;
  min-height: 58px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.project-row:hover {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(148, 163, 184, 0.14);
}

.project-row.active {
  border-color: rgba(239, 124, 47, 0.5);
  background: rgba(239, 124, 47, 0.06);
}

.project-row-main {
  min-width: 0;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.project-row-rename {
  grid-column: 1 / 5;
  height: 32px;
  min-width: 0;
  border: 1px solid rgba(239, 124, 47, 0.4);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 10px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  outline: 0;
}

.project-row-context {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--color-text);
}

.project-context-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 800;
  color: var(--color-text-muted);
}

.project-context-badge.set {
  color: var(--color-success);
}

.project-context-badge.pending {
  opacity: 0.6;
}

.project-context-badge.missing {
  color: #ff9b8f;
}

.project-row-context small,
.project-row-activity {
  color: var(--color-text-muted);
  font-size: 11px;
}

.project-menu-wrap,
.session-menu-wrap {
  position: relative;
  z-index: 1;
  justify-self: end;
}

.project-row-action,
.project-run-menu-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.project-row:hover .project-row-action,
.project-row-action.open,
.project-run-menu-btn.open {
  background: rgba(255, 255, 255, 0.05);
}

.project-row-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  min-width: 140px;
  padding: 4px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: var(--color-bg);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-row-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}

.project-row-menu button:hover {
  background: rgba(255, 255, 255, 0.06);
}

.project-row-menu button.danger {
  color: #ff9b8f;
}

.projects-empty-state {
  min-height: 260px;
  border: 1px dashed rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text-muted);
  text-align: center;
}

.projects-empty-state > span {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--color-cta);
  background: rgba(239, 124, 47, 0.1);
  border: 1px solid rgba(239, 124, 47, 0.2);
}

.projects-empty-state strong {
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.projects-empty-state p {
  max-width: 360px;
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.projects-empty-state button {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: 8px;
  background: var(--color-cta);
  color: white;
  padding: 0 12px;
  font-size: var(--font-size-2xs);
  font-weight: 800;
  cursor: pointer;
}

.project-folder-icon {
  width: 34px;
  height: 34px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-cta);
  background: rgba(239, 124, 47, 0.12);
  border: 1px solid rgba(239, 124, 47, 0.22);
}

.project-folder-icon.missing {
  color: #ff9b8f;
  background: rgba(255, 155, 143, 0.12);
  border-color: rgba(255, 155, 143, 0.28);
}

.tone-0 { background: rgba(239, 124, 47, 0.16); color: var(--color-cta); }
.tone-1 { background: rgba(127, 87, 241, 0.18); color: #a78bfa; }
.tone-2 { background: rgba(20, 184, 166, 0.18); color: #2dd4bf; }
.tone-3 { background: rgba(245, 158, 11, 0.18); color: #fbbf24; }
.tone-4 { background: rgba(59, 130, 246, 0.18); color: #60a5fa; }
.tone-5 { background: rgba(34, 197, 94, 0.18); color: #86efac; }

.project-card-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-self: center;
}

.project-card-copy strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 700;
}

.project-card-copy small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
}

.project-mini-apps {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mini-app,
.mini-count {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.mini-app svg {
  width: 12px;
  height: 12px;
}

.mini-count {
  color: var(--color-text-secondary);
  background: rgba(148, 163, 184, 0.12);
  font-size: var(--font-size-2xs);
  font-weight: 800;
}

.chat { background: rgba(16, 185, 129, 0.17); color: #6ee7b7; }
.code { background: rgba(59, 130, 246, 0.18); color: #93c5fd; }
.folder { background: rgba(239, 124, 47, 0.16); color: var(--color-cta); }
.tasks { background: rgba(20, 184, 166, 0.18); color: #5eead4; }
.terminal { background: rgba(100, 116, 139, 0.2); color: #cbd5e1; }

.projects-home-foot {
  color: var(--color-text-muted);
  font-size: 11px;
}

.project-detail-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 20px;
  background: var(--color-surface);
}

.project-canvas {
  position: relative;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 0;
  overflow: hidden;
  background: var(--color-surface);
  display: grid;
  grid-template-columns: minmax(360px, 36%) minmax(520px, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 14px;
}

.project-workbench-panel {
  display: contents;
}

.project-main-column {
  grid-column: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.project-missing-banner {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid rgba(255, 155, 143, 0.3);
  border-radius: 8px;
  background: rgba(255, 155, 143, 0.1);
  color: #ff9b8f;
  font-size: 11px;
  line-height: 1.5;
}

.project-missing-banner svg {
  flex-shrink: 0;
}

.project-apps-panel {
  flex-shrink: 0;
  padding: 6px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: var(--color-bg);
}

.project-apps-head {
  padding: 6px 8px 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.project-apps-head strong {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.project-apps-view-toggle {
  display: flex;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 6px;
  overflow: hidden;
}

.project-apps-view-toggle button {
  width: 26px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.project-apps-view-toggle button + button {
  border-left: 1px solid rgba(148, 163, 184, 0.16);
}

.project-apps-view-toggle button.active {
  color: var(--color-cta);
  background: rgba(239, 124, 47, 0.1);
}

.project-apps-grid--list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-apps-grid--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
  padding: 4px;
}

.project-app-row {
  position: relative;
  width: 100%;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.project-apps-grid--list .project-app-row {
  min-height: 46px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
}

.project-apps-grid--grid .project-app-row {
  min-height: 84px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 8px;
  text-align: center;
}

.project-app-row.active {
  background: rgba(239, 124, 47, 0.08);
}

.project-app-row.disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.project-app-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.project-app-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-apps-grid--list .project-app-copy {
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
  flex: 1;
}

.project-app-copy strong {
  font-size: 12px;
  font-weight: 800;
  color: var(--color-text);
}

.project-app-copy small {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-apps-grid--list .project-app-copy small {
  margin-left: auto;
}

.project-apps-grid--grid .project-app-copy {
  align-items: center;
  text-align: center;
}

.project-apps-grid--grid .project-app-copy small {
  white-space: normal;
}

.project-apps-grid--grid .project-app-copy-hint {
  display: none;
}

.project-app-icon.seshat { background: rgba(239, 124, 47, 0.18); color: #f7a35c; }
.project-app-icon.notebook { background: rgba(245, 158, 11, 0.18); color: #fbbf24; }
.project-app-icon.datalab { background: rgba(20, 184, 166, 0.18); color: #5eead4; }

.project-terminal-panel:hover {
  background: rgba(255, 255, 255, 0.04);
}

.project-right-panel {
  grid-column: 2;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
  color: var(--color-text);
  display: flex;
  flex-direction: column;
}

.project-right-panel-tabs {
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.025);
}

.project-right-panel-switch {
  display: flex;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 6px;
  overflow: hidden;
}

.project-right-panel-switch button {
  width: 30px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.project-right-panel-switch button + button {
  border-left: 1px solid rgba(148, 163, 184, 0.16);
}

.project-right-panel-switch button.active {
  color: var(--color-cta);
  background: rgba(239, 124, 47, 0.1);
}

.project-right-panel-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.project-right-panel-actions em {
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
  font-style: normal;
  font-size: 10px;
  font-weight: 800;
}

.project-right-panel-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.project-right-panel-actions button:hover {
  color: var(--color-cta);
}

.project-terminal-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  color: var(--color-text);
  text-align: left;
  display: grid;
  grid-template-rows: minmax(0, 1fr) 38px;
}

.terminal-lines {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #d8c9ad;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.55;
}

.terminal-muted {
  color: rgba(216, 201, 173, 0.58);
}

.terminal-line {
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.terminal-line--input {
  color: #f6a15f;
}

.terminal-line--stderr {
  color: #ff9b8f;
}

.terminal-line--system {
  color: rgba(216, 201, 173, 0.68);
}

.terminal-input-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border-top: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.025);
  color: #f6a15f;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
}

.terminal-input-row input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #f8fafc;
  font: inherit;
}

.terminal-input-row input::placeholder {
  color: rgba(248, 250, 252, 0.38);
}

.project-runs-panel {
  flex: 1;
  min-height: 0;
  margin-top: 0;
  padding: 16px 20px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: var(--color-bg);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.project-runs-head {
  margin-bottom: 14px;
}

.project-runs-head button {
  color: var(--color-cta);
}

.project-runs-list {
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-run-row {
  position: relative;
  min-height: 52px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 130px 98px 26px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(148, 163, 184, 0.13);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.12);
  cursor: pointer;
}

.project-run-rename {
  height: 30px;
  min-width: 0;
  border: 1px solid rgba(239, 124, 47, 0.4);
  border-radius: 6px;
  background: var(--color-bg);
  color: var(--color-text);
  padding: 0 8px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  outline: 0;
}

.project-run-icon {
  width: 32px;
  height: 32px;
  border-radius: 7px;
}

.project-run-row strong {
  display: block;
  color: var(--color-text);
  font-size: 12px;
}

.project-run-row small,
.project-run-row time {
  color: var(--color-text-muted);
  font-size: 10px;
}

.project-run-status {
  justify-self: start;
  padding: 5px 9px;
  border-radius: 7px;
  color: var(--color-text-muted);
  background: rgba(148, 163, 184, 0.1);
  font-size: 10px;
  font-weight: 800;
}

.project-run-status.completed {
  color: var(--color-success);
  background: rgba(var(--color-success-rgb), 0.1);
}

.project-run-status.running {
  color: var(--color-cta);
  background: rgba(239, 124, 47, 0.12);
}

.project-run-status.error {
  color: #ff9b8f;
  background: rgba(255, 155, 143, 0.14);
}

.project-runs-empty {
  min-height: 92px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.project-run-row button {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.project-empty {
  min-height: calc(100% - 2px);
  border: 1px dashed rgba(239, 124, 47, 0.3);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  padding: 32px;
}

.project-empty > span {
  width: 58px;
  height: 58px;
  border-radius: 12px;
  background: rgba(239, 124, 47, 0.1);
  color: var(--color-cta);
  display: flex;
  align-items: center;
  justify-content: center;
}

.project-empty h1 {
  margin: 0;
  font-size: 20px;
}

.project-empty p {
  max-width: 460px;
  margin: 0;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.project-empty button {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: 8px;
  background: var(--color-cta);
  color: white;
  padding: 0 14px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.project-right-panel .right-panel-browser {
  flex: 1;
  min-height: 0;
  height: auto;
}

`
