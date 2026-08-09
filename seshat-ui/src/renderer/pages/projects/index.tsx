import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  AddOne,
  Book,
  Command,
  DataSheet,
  FolderClose,
  FolderOpen,
  Message,
  More,
  Search,
  Time,
  Workbench,
} from '@icon-park/react'
import { api } from '@/api/client'
import type { Session } from '@/api/types'
import { useSessionStore, type ChatSession } from '@/stores/session'
import { normalizeSessionMessages } from '@/lib/chat'

type ProjectRecord = {
  id: string
  name: string
  description: string
  rootPath: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'seshat.projects.v1'

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

type TerminalLine = {
  id: string
  text: string
  kind: 'input' | 'stdout' | 'stderr' | 'system'
}

function buildProjects(saved: ProjectRecord[], sessions: ChatSession[]): ProjectRecord[] {
  const byPath = new Map<string, ProjectRecord>()
  for (const project of saved) {
    const rootPath = normalizePath(project.rootPath)
    if (!rootPath) continue
    byPath.set(rootPath.toLowerCase(), { ...project, rootPath })
  }

  for (const session of sessions) {
    const rootPath = normalizePath(session.projectPath ?? '')
    if (!rootPath) continue
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
  const isSessionStreaming = useSessionStore((s) => s.isSessionStreaming)
  const [savedProjects, setSavedProjects] = useState<ProjectRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [projectAppsOpen, setProjectAppsOpen] = useState(false)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionsLoaded, setSessionsLoaded] = useState(false)

  useEffect(() => {
    setSavedProjects(readProjects())
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

  const projects = useMemo(() => buildProjects(savedProjects, sessions), [savedProjects, sessions])

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
  }

  return (
    <div className="projects-root">
      <style>{PROJECTS_CSS}</style>
      <header className="projects-topbar">
        <div className="projects-heading-wrap">
          <div className="projects-topbar-title" title={detailProject?.rootPath}>
            {detailProject ? detailProject.rootPath : 'Projects'}
          </div>
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
                return (
                  <button
                    key={project.id}
                    className={`project-row ${selected?.id === project.id ? 'active' : ''}`}
                    type="button"
                    onClick={() => {
                      setSelectedId(project.id)
                      navigate(`/projects/${encodeURIComponent(project.id)}`)
                    }}
                  >
                    <span className="project-row-main">
                      <span className="project-folder-icon"><FolderClose size={20} /></span>
                      <span className="project-card-copy">
                        <strong>{project.name}</strong>
                        <small title={project.rootPath}>{project.rootPath}</small>
                      </span>
                    </span>
                    <span className="project-row-context">
                      <strong>{projectSessionCount}</strong>
                      <small>sessions</small>
                    </span>
                    <span className="project-mini-apps">
                      <span className="mini-app chat" title="Companion"><Message size={12} /></span>
                      <span className="mini-app folder" title="Folder"><FolderOpen size={12} /></span>
                      <span className="mini-app terminal" title="Terminal"><Command size={12} /></span>
                    </span>
                    <span className="project-row-activity">{formatActivity(project)}</span>
                    <span className="project-row-action"><More size={14} /></span>
                  </button>
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
                <div className="project-canvas-head">
                  <button
                    className={`project-app-drawer-btn${projectAppsOpen ? ' open' : ''}`}
                    type="button"
                    aria-label="Project apps"
                    aria-expanded={projectAppsOpen}
                    onClick={() => setProjectAppsOpen((open) => !open)}
                  >
                    <span className="project-burger-lines" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </button>
                  <div className="project-canvas-title">
                    <h1>{detailProject.name}</h1>
                    <span title={detailProject.rootPath}>{detailProject.rootPath}</span>
                  </div>
                  <button
                    className="project-header-action"
                    type="button"
                    onClick={() => { void window.nexus?.openLocalPath?.(detailProject.rootPath) }}
                  >
                    <FolderOpen size={14} /> Open Folder
                  </button>
                </div>

                {projectAppsOpen && (
                  <div className="project-app-drawer">
                    <button
                      className="project-app-drawer-item active"
                      type="button"
                      onClick={() => navigate(`/?project=${encodeURIComponent(detailProject.rootPath)}`)}
                    >
                      <Message size={15} />
                      <span>Companion</span>
                    </button>
                    <button className="project-app-drawer-item disabled" type="button" disabled>
                      <Book size={15} />
                      <span>Notebook</span>
                      <em>Coming soon</em>
                    </button>
                    <button className="project-app-drawer-item disabled" type="button" disabled>
                      <DataSheet size={15} />
                      <span>Data Lab</span>
                      <em>Coming soon</em>
                    </button>
                  </div>
                )}

                <div className="project-workbench-grid">
                  <div className="project-main-column">
                    <div className="project-companion-panel">
                      <div className="project-panel-title">
                        <Message size={16} />
                        <strong>Project Companion</strong>
                      </div>
                      <button
                        className="project-companion-input"
                        type="button"
                        onClick={() => navigate(`/?project=${encodeURIComponent(detailProject.rootPath)}`)}
                      >
                        <span>Ask anything about this project</span>
                        <em>→</em>
                      </button>
                    </div>

                    <div className="project-context-panel">
                      <div className="project-context-head">
                        <strong>Context summary</strong>
                      </div>
                      <div className="project-context-list">
                        <span><FolderOpen size={13} /> Files <em>0</em></span>
                        <span><Command size={13} /> Code files <em>0</em></span>
                        <span><Book size={13} /> Notebooks <em>0</em></span>
                        <span><DataSheet size={13} /> Datasets <em>0</em></span>
                      </div>
                    </div>
                  </div>

                  <ProjectTerminal projectPath={detailProject.rootPath} />
                </div>
              </div>

              <div className="project-runs-panel">
                <div className="project-runs-head">
                  <div>
                    <More size={15} />
                    <strong>Recent Sessions / Runs</strong>
                  </div>
                  <button type="button">View All</button>
                </div>
                <div className="project-runs-list">
                  {projectSessions.length === 0 ? (
                    <div className="project-runs-empty">
                      No sessions have used this project yet.
                    </div>
                  ) : projectSessions.map((session) => (
                    <div key={session.id} className="project-run-row">
                      <span className={`project-run-icon ${session.source === 'knowledge' ? 'knowledge' : 'chat'}`} />
                      <div>
                        <strong>{session.title}</strong>
                        <small>{sessionKind(session)}</small>
                      </div>
                      <time>{formatSessionTime(session)}</time>
                      <span className={`project-run-status ${isSessionStreaming(session.id) ? 'running' : 'completed'}`}>
                        {isSessionStreaming(session.id) ? 'Running' : 'Completed'}
                      </span>
                      <button type="button" aria-label="Open conversation" onClick={() => navigate(`/conversation/${session.id}`)}>
                        <More size={13} />
                      </button>
                    </div>
                  ))}
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

function ProjectTerminal({ projectPath }: { projectPath: string }) {
  const terminalIdRef = useRef(`project-terminal-${crypto.randomUUID()}`)
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [lines, setLines] = useState<TerminalLine[]>([])
  const [command, setCommand] = useState('')
  const [running, setRunning] = useState(false)
  const [shellLabel, setShellLabel] = useState('Shell')
  const [terminalStyle, setTerminalStyle] = useState<'warm' | 'ink'>('warm')

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
    <section className={`project-terminal-panel terminal-style-${terminalStyle}`} onClick={() => inputRef.current?.focus()}>
      <div className="terminal-header">
        <span><Command size={14} /> Terminal</span>
        <div>
          <em>{running ? shellLabel : 'Stopped'}</em>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setTerminalStyle((style) => style === 'warm' ? 'ink' : 'warm')
            }}
          >
            {terminalStyle === 'warm' ? 'Warm' : 'Ink'}
          </button>
          <button type="button" onClick={(event) => { event.stopPropagation(); setLines([]) }}>Clear</button>
          <button type="button" onClick={(event) => { event.stopPropagation(); void startTerminal() }}>Restart</button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              void window.nexus?.openTerminal?.(projectPath)
            }}
          >
            External
          </button>
        </div>
      </div>
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
}

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
  height: 52px;
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 0 17px;
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

.project-row-context {
  display: flex;
  align-items: baseline;
  gap: 6px;
  color: var(--color-text);
}

.project-row-context strong {
  font-size: 13px;
}

.project-row-context small,
.project-row-activity {
  color: var(--color-text-muted);
  font-size: 11px;
}

.project-row-action {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: end;
  border-radius: 6px;
  color: var(--color-text-muted);
}

.project-row:hover .project-row-action {
  background: rgba(255, 255, 255, 0.05);
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
  grid-template-rows: 74px minmax(0, 1fr) 190px;
  gap: 14px;
}

.project-runs-panel {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: var(--color-bg);
}

.project-workbench-panel {
  min-height: 0;
  display: contents;
}

.project-canvas-head {
  position: relative;
  grid-column: 1;
  grid-row: 1;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: var(--color-bg);
}

.project-app-drawer-btn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--color-text-muted);
  cursor: pointer;
}

.project-burger-lines {
  width: 14px;
  display: grid;
  gap: 3px;
}

.project-burger-lines i {
  display: block;
  height: 1.5px;
  border-radius: 999px;
  background: currentColor;
}

.project-app-drawer-btn.open {
  color: var(--color-cta);
  border-color: rgba(239, 124, 47, 0.32);
  background: rgba(239, 124, 47, 0.08);
}

.project-canvas-title {
  min-width: 0;
}

.project-canvas-title h1 {
  margin: 0;
  font-size: 15px;
  line-height: 1.2;
}

.project-canvas-title span {
  margin-top: 5px;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--color-text-muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-header-action {
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--color-text);
  font-size: var(--font-size-2xs);
  font-weight: 800;
  cursor: pointer;
}

.project-app-drawer {
  position: absolute;
  top: 52px;
  left: 0;
  z-index: 4;
  width: 270px;
  padding: 6px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 8px;
  background: #26262e;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
}

.project-app-drawer-item {
  position: relative;
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  text-align: left;
}

.project-app-drawer-item.active {
  color: var(--color-text);
  background: rgba(239, 124, 47, 0.08);
}

.project-app-drawer-item.disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.project-app-drawer-item em {
  margin-left: auto;
  padding: 3px 6px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 6px;
  color: var(--color-text-muted);
  font-style: normal;
  font-size: 10px;
  font-weight: 700;
}

.project-workbench-grid {
  min-height: 0;
  overflow: hidden;
  padding: 0;
  display: contents;
}

.project-main-column {
  min-width: 0;
  min-height: 0;
  display: contents;
}

.project-companion-panel,
.project-terminal-panel {
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
  color: var(--color-text);
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

.project-companion-panel {
  display: none;
}

.project-action-icon {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 14px 32px rgba(0, 0, 0, 0.22);
  transition: transform 0.16s ease, filter 0.16s ease;
}

.project-terminal-panel:hover,
.project-header-action:hover {
  background: rgba(255, 255, 255, 0.04);
}

.project-app-drawer-btn:hover {
  transform: translateY(-2px);
  filter: brightness(1.08);
}

.project-terminal-panel {
  grid-column: 2;
  grid-row: 1 / -1;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.025);
  display: grid;
  grid-template-rows: 38px minmax(0, 1fr) 38px;
}

.project-terminal-panel.terminal-style-ink {
  background: #0d0f14;
}

.project-terminal-panel.terminal-style-warm {
  background: rgba(255, 255, 255, 0.025);
}

.terminal-header {
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.025);
}

.terminal-header span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text);
  font-size: 12px;
  font-weight: 800;
}

.terminal-header div {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.terminal-header em {
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
  font-style: normal;
  font-size: 10px;
  font-weight: 800;
}

.terminal-header button {
  border: 0;
  background: transparent;
  color: var(--color-cta);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.terminal-header button:hover {
  color: var(--color-text);
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

.terminal-style-warm .terminal-lines {
  background: transparent;
}

.terminal-style-ink .terminal-lines {
  background: #0d0f14;
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

.terminal-style-ink .terminal-input-row {
  background: #111217;
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

.project-context-panel {
  grid-column: 1;
  grid-row: 2;
  min-width: 0;
  min-height: 0;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
  overflow: hidden;
}

.project-context-head {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.project-context-head strong {
  font-size: 12px;
}

.project-context-list {
  padding: 0;
  display: grid;
}

.project-context-list span {
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
  color: var(--color-text-muted);
  font-size: 11px;
}

.project-context-list span:last-child {
  border-bottom: 0;
}

.project-context-list em {
  margin-left: auto;
  color: var(--color-text-secondary);
  font-style: normal;
}

.project-runs-panel {
  grid-column: 1;
  grid-row: 3;
  min-height: 0;
  margin-top: 0;
  padding: 16px 20px;
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
  min-height: 52px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 130px 98px 26px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(148, 163, 184, 0.13);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.12);
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

@media (max-width: 1280px) {
  .project-workbench-grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
  }
}
`
