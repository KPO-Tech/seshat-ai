import { useEffect, useMemo, useState } from 'react'
import {
  AddOne,
  Book,
  Code,
  Command,
  DataSheet,
  FileText,
  FolderClose,
  FolderOpen,
  Left,
  Message,
  More,
  Search,
  Time,
  Workbench,
} from '@icon-park/react'

type ProjectRecord = {
  id: string
  name: string
  description: string
  rootPath: string
  createdAt: string
  updatedAt: string
}

const STORAGE_KEY = 'seshat.projects.v1'

const SAMPLE_PROJECTS: ProjectRecord[] = [
  {
    id: 'sample-nobevia',
    name: 'Nobevia Strategy',
    description: 'Business plan, market research, and launch materials.',
    rootPath: '~/SeshatOS/Projects/Nobevia-Strategy',
    createdAt: '2026-07-26T09:00:00.000Z',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sample-aurelia',
    name: 'Aurelia Redesign',
    description: 'Website redesign and design-system exploration.',
    rootPath: '~/SeshatOS/Projects/Aurelia-Redesign',
    createdAt: '2026-07-18T14:15:00.000Z',
    updatedAt: '2026-08-01T16:15:00.000Z',
  },
  {
    id: 'sample-veridian',
    name: 'Veridian Analytics',
    description: 'Data notebooks, research notes, and reporting workflows.',
    rootPath: '~/SeshatOS/Projects/Veridian-Analytics',
    createdAt: '2026-07-12T10:15:00.000Z',
    updatedAt: '2026-07-31T11:30:00.000Z',
  },
]

const PROJECT_APPS = [
  { label: 'Chat', desc: 'AI conversations', icon: <Message size={34} />, className: 'chat' },
  { label: 'Code', desc: 'IDE & development', icon: <Code size={34} />, className: 'code' },
  { label: 'Research', desc: 'Web & knowledge', icon: <Search size={34} />, className: 'research' },
  { label: 'Workflows', desc: 'Automations', icon: <DataSheet size={34} />, className: 'workflow' },
  { label: 'Documents', desc: 'Files & notes', icon: <FileText size={34} />, className: 'documents' },
  { label: 'Tasks', desc: 'Plan & track', icon: <Time size={34} />, className: 'tasks' },
  { label: 'Knowledge', desc: 'Notes & insights', icon: <Book size={34} />, className: 'knowledge' },
  { label: 'Terminal', desc: 'Command line', icon: <Command size={34} />, className: 'terminal' },
]

const SAMPLE_RUNS = [
  { title: 'Competitor landscape research', type: 'Research - Web Search', status: 'Completed', time: 'Today, 10:15 AM', app: 'research' },
  { title: 'Strategy brief to document', type: 'Workflow - 7 steps', status: 'Completed', time: 'Today, 9:02 AM', app: 'workflow' },
  { title: 'Data analysis script', type: 'Code - Python', status: 'Stopped', time: 'Yesterday, 6:47 PM', app: 'code' },
]

function readProjects(): ProjectRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
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

function formatActivity(project: ProjectRecord) {
  const time = new Date(project.updatedAt).getTime()
  if (!Number.isFinite(time)) return 'Recently'
  const diff = Date.now() - time
  const hours = Math.max(1, Math.round(diff / 36e5))
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openedId, setOpenedId] = useState<string | null>(null)

  useEffect(() => {
    const stored = readProjects()
    const next = stored.length > 0 ? stored : SAMPLE_PROJECTS
    setProjects(next)
    setSelectedId(next[0]?.id ?? null)
  }, [])

  const selected = useMemo(
    () => projects.find((project) => project.id === (openedId ?? selectedId)) ?? projects[0] ?? null,
    [projects, selectedId, openedId],
  )

  async function createFromFolder() {
    const result = await window.nexus?.dialog?.openDirectory?.()
    if (!result || result.canceled || !result.filePaths?.[0]) return
    const rootPath = result.filePaths[0]
    const now = new Date().toISOString()
    const existing = projects.find((project) => project.rootPath === rootPath)
    if (existing) {
      setSelectedId(existing.id)
      setOpenedId(null)
      return
    }

    const nextProject: ProjectRecord = {
      id: crypto.randomUUID(),
      name: basename(rootPath),
      description: 'Local work context',
      rootPath,
      createdAt: now,
      updatedAt: now,
    }
    const persisted = projects.filter((project) => !project.id.startsWith('sample-'))
    const nextProjects = [nextProject, ...persisted]
    setProjects(nextProjects)
    setSelectedId(nextProject.id)
    setOpenedId(null)
    writeProjects(nextProjects)
  }

  const detailProject = openedId ? projects.find((project) => project.id === openedId) ?? null : null

  return (
    <div className="projects-root">
      <style>{PROJECTS_CSS}</style>
      <header className="projects-topbar">
        <div className="projects-heading-wrap">
          {detailProject && (
            <button className="projects-back-btn" type="button" onClick={() => setOpenedId(null)}>
              <Left size={14} />
            </button>
          )}
          <div className="projects-topbar-title" title={detailProject?.rootPath}>
            {detailProject ? detailProject.rootPath : 'Projects'}
          </div>
        </div>
        <div className="projects-topbar-actions">
          <button className="projects-primary-btn" type="button" onClick={() => { void createFromFolder() }}>
            <AddOne size={14} /> New Project
          </button>
          <button className="projects-search-btn" type="button" title="Search projects">
            <Search size={17} />
          </button>
        </div>
      </header>

      {!detailProject ? (
      <main className="projects-home-content">
        <section className="projects-browser">
          <div className="projects-browser-head">
            <div>
              <span className="projects-section-icon"><Time size={15} /></span>
              <strong>Recent Projects</strong>
            </div>
            <button type="button">Last Activity</button>
          </div>

          <div className="projects-card-grid">
            {projects.map((project) => (
              <button
                key={project.id}
                className={`project-card ${selected?.id === project.id ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setSelectedId(project.id)
                  setOpenedId(project.id)
                }}
              >
                <div className="project-folder-icon"><FolderClose size={28} /></div>
                <span className="project-card-copy">
                  <strong>{project.name}</strong>
                  <small title={project.rootPath}>{project.rootPath}</small>
                </span>
                <div className="project-meta-row">
                  <span>{formatActivity(project)}</span>
                  <span>Root folder</span>
                </div>
                <div className="project-mini-apps">
                  <span className="mini-app chat"><Message size={12} /></span>
                  <span className="mini-app code"><Code size={12} /></span>
                  <span className="mini-app research"><Search size={12} /></span>
                  <span className="mini-app workflow"><DataSheet size={12} /></span>
                  <span className="mini-count">+2</span>
                </div>
              </button>
            ))}
          </div>

        </section>
        <div className="projects-home-foot">{projects.length} projects</div>
      </main>
      ) : (
      <main className="project-detail-content">
        <section className="project-canvas">
          {detailProject ? (
            <>
              <div className="project-apps-panel">
                <div className="project-canvas-head">
                  <div className="project-canvas-avatar"><Workbench size={22} /></div>
                  <div className="project-canvas-title">
                    <h1>Apps</h1>
                  </div>
                </div>

                <div className="project-app-grid">
                  {PROJECT_APPS.map((app) => (
                    <button key={app.label} className="project-app" type="button">
                      <span className={`project-app-icon ${app.className}`}>{app.icon}</span>
                      <strong>{app.label}</strong>
                      <small>{app.desc}</small>
                    </button>
                  ))}
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
                  {SAMPLE_RUNS.map((run) => (
                    <div key={run.title} className="project-run-row">
                      <span className={`project-run-icon ${run.app}`} />
                      <div>
                        <strong>{run.title}</strong>
                        <small>{run.type}</small>
                      </div>
                      <time>{run.time}</time>
                      <span className={`project-run-status ${run.status.toLowerCase()}`}>{run.status}</span>
                      <button type="button" aria-label="Run menu"><More size={13} /></button>
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

.projects-back-btn,
.projects-search-btn,
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

.projects-back-btn {
  justify-self: start;
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
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

.projects-search-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.projects-back-btn:hover,
.projects-search-btn:hover,
.project-card:hover,
.project-app:hover,
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

.projects-browser-head button,
.project-runs-head button,
.projects-browser-foot button {
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 800;
  cursor: pointer;
}

.projects-card-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 380px));
  grid-auto-rows: 110px;
  align-content: start;
  gap: 10px;
  padding: 0;
}

.project-card {
  position: relative;
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.015));
  color: var(--color-text);
  text-align: left;
  padding: 11px 13px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  grid-template-rows: auto 1fr auto;
  gap: 5px 10px;
  cursor: pointer;
}

.project-card.active {
  border-color: var(--color-cta);
  box-shadow: 0 0 0 1px rgba(239, 124, 47, 0.24), inset 0 0 0 1px rgba(239, 124, 47, 0.12);
}

.project-folder-icon,
.project-canvas-avatar {
  width: 38px;
  height: 38px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-cta);
  background: rgba(239, 124, 47, 0.12);
  border: 1px solid rgba(239, 124, 47, 0.22);
}

.tone-0,
.project-canvas-avatar { background: rgba(239, 124, 47, 0.16); color: var(--color-cta); }
.tone-1 { background: rgba(127, 87, 241, 0.18); color: #a78bfa; }
.tone-2 { background: rgba(20, 184, 166, 0.18); color: #2dd4bf; }
.tone-3 { background: rgba(245, 158, 11, 0.18); color: #fbbf24; }
.tone-4 { background: rgba(59, 130, 246, 0.18); color: #60a5fa; }
.tone-5 { background: rgba(34, 197, 94, 0.18); color: #86efac; }

.project-status {
  position: absolute;
  top: 24px;
  right: 18px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 800;
}

.project-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.project-status.active { color: var(--color-cta); }

.project-card-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  align-self: center;
}

.project-card strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
  font-weight: 700;
}

.project-card small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
  font-size: var(--font-size-2xs);
}

.project-meta-row {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--color-text-muted);
  font-size: 10px;
}

.project-mini-apps {
  grid-column: 1 / -1;
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.mini-app,
.mini-count {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.mini-count {
  color: var(--color-text-secondary);
  background: rgba(148, 163, 184, 0.12);
  font-size: var(--font-size-2xs);
  font-weight: 800;
}

.chat { background: rgba(16, 185, 129, 0.17); color: #6ee7b7; }
.code { background: rgba(59, 130, 246, 0.18); color: #93c5fd; }
.research { background: rgba(124, 58, 237, 0.2); color: #c4b5fd; }
.workflow { background: rgba(249, 115, 22, 0.2); color: #fdba74; }
.documents { background: rgba(244, 63, 94, 0.18); color: #fda4af; }
.tasks { background: rgba(20, 184, 166, 0.18); color: #5eead4; }
.knowledge { background: rgba(139, 92, 246, 0.2); color: #ddd6fe; }
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
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 0;
  overflow: hidden;
  background: var(--color-surface);
  display: grid;
  grid-template-rows: minmax(0, 1fr) 220px;
  gap: 14px;
}

.project-apps-panel,
.project-runs-panel {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 8px;
  background: var(--color-bg);
}

.project-apps-panel {
  min-height: 0;
  padding: 18px 18px;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.project-canvas-head {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 15px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}

.project-canvas-avatar {
  width: 44px;
  height: 44px;
  font-size: 22px;
}

.project-canvas-title {
  min-width: 0;
}

.project-canvas-title h1 {
  margin: 0;
  font-size: 18px;
  line-height: 1.2;
}

.project-canvas-title span {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--color-text-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-app-grid {
  min-height: 0;
  overflow-y: auto;
  padding: 20px 8px 6px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  align-content: start;
  gap: 26px 24px;
}

.project-app {
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  cursor: pointer;
  text-align: center;
}

.project-app-icon {
  width: 64px;
  height: 64px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 14px 32px rgba(0, 0, 0, 0.22);
  transition: transform 0.16s ease, filter 0.16s ease;
}

.project-app:hover .project-app-icon {
  transform: translateY(-2px);
  filter: brightness(1.08);
}

.project-app strong {
  font-size: 13px;
}

.project-app small {
  color: var(--color-text-muted);
  font-size: 11px;
}

.project-runs-panel {
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
  .project-app-grid {
    grid-template-columns: repeat(3, minmax(112px, 1fr));
    gap: 34px;
  }
}
`
