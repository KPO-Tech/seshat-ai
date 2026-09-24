import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Edit, Folder, FolderPlus, Search, Delete } from '@icon-park/react'
import { useSessionStore } from '@renderer/stores/session'
import { addProject, listProjects, projectIdForPath, removeProject, renameProject, type ProjectSummary } from '@renderer/lib/projects'

function fmtActivity(iso: string | null): string {
  if (!iso) return 'No activity yet'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'No activity yet'
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Active now'
  if (diffMin < 60) return `Active ${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `Active ${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `Active ${diffDay}d ago`
  return `Active ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

// Local folders the user works with - see lib/projects.ts for what a
// "project" actually is here (no backend entity, just a labeled path).
// Deliberately not what the old seshat-ui version did: no embedded
// terminal, no per-project settings - find a project, see what's in it,
// jump into a conversation.
export function ProjectsPage() {
  const navigate = useNavigate()
  const sessions = useSessionStore((s) => s.sessions)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const projects = useMemo(
    () => listProjects(sessions),
    [sessions, refreshNonce], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => p.name.toLowerCase().includes(q) || p.rootPath.toLowerCase().includes(q))
  }, [projects, query])

  async function handleNewProject() {
    const result = await window.nexus?.dialog?.openDirectory?.()
    if (!result || result.canceled || !result.filePaths?.length) return
    const project = addProject(result.filePaths[0])
    navigate(`/projects/${encodeURIComponent(project.id)}`)
  }

  function startRename(project: ProjectSummary) {
    setEditingId(project.id)
    setEditingName(project.name)
  }

  function commitRename(project: ProjectSummary) {
    const nextName = editingName.trim()
    setEditingId(null)
    if (!nextName || nextName === project.name) return
    renameProject(project.id, nextName, project.rootPath)
    setRefreshNonce((n) => n + 1)
  }

  function handleRemove(id: string) {
    setDeletingId(null)
    removeProject(id)
    setRefreshNonce((n) => n + 1)
  }

  return (
    <div className="proj-root">
      <style>{CSS}</style>

      <header className="proj-topbar">
        <span className="proj-topbar-title">Projects</span>

        <div className="proj-search">
          <Search size={12} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects..." />
        </div>

        <button className="proj-new-btn" onClick={() => void handleNewProject()}>
          <FolderPlus size={13} /> New project
        </button>
      </header>

      <div className="proj-body">
        <div className="proj-container">
          {filtered.length === 0 ? (
            <div className="proj-empty">
              <Folder size={22} />
              <h2>{projects.length === 0 ? 'No projects yet' : 'No matches'}</h2>
              <p>
                {projects.length === 0
                  ? 'Add a folder, or pick one from the composer next time you start a chat.'
                  : 'Try a different search term.'}
              </p>
            </div>
          ) : (
            <div className="proj-grid">
              {filtered.map((project) => (
                <div key={project.id} className="proj-card">
                  {deletingId === project.id ? (
                    <div className="proj-card-confirm">
                      <span className="proj-card-confirm-text">Remove this project?</span>
                      <div className="proj-card-confirm-actions">
                        <button className="proj-confirm-cancel" onClick={() => setDeletingId(null)}>Cancel</button>
                        <button className="proj-confirm-delete" onClick={() => handleRemove(project.id)}>Remove</button>
                      </div>
                    </div>
                  ) : (
                    <div className="proj-card-actions">
                      <button className="proj-icon-btn" aria-label="Rename" onClick={() => startRename(project)}>
                        <Edit size={12} />
                      </button>
                      <button className="proj-icon-btn proj-icon-btn--danger" aria-label="Remove" onClick={() => setDeletingId(project.id)}>
                        <Delete size={12} />
                      </button>
                    </div>
                  )}

                  {/* A real <button> can't contain the rename <input> (nested
                      interactive elements are invalid HTML), so this is a div
                      with button semantics instead - same pattern used for
                      ToolLineItem/ThinkingBlock's rows. */}
                  <div
                    className="proj-card-main"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/projects/${encodeURIComponent(project.id)}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/projects/${encodeURIComponent(project.id)}`) } }}
                  >
                    <span className="proj-card-icon"><Folder size={24} /></span>
                    {editingId === project.id ? (
                      <input
                        className="proj-rename"
                        value={editingName}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => commitRename(project)}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') { e.preventDefault(); commitRename(project) }
                          else if (e.key === 'Escape') setEditingId(null)
                        }}
                      />
                    ) : (
                      <span className="proj-card-name">{project.name}</span>
                    )}
                    <span className="proj-card-path">{project.rootPath}</span>
                    <span className="proj-card-meta">
                      {project.sessionCount} session{project.sessionCount === 1 ? '' : 's'} · {fmtActivity(project.lastActiveAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const CSS = `
.proj-root {
  display: flex; flex-direction: column;
  width: 100%; height: 100%;
  background: var(--color-surface);
  color: var(--color-text);
  overflow: hidden;
}

.proj-topbar {
  display: flex; align-items: center; gap: 6px;
  padding: 0 17px; height: 52px; flex-shrink: 0;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border-subtle);
}
.proj-topbar-title { font-size: 13px; font-weight: 700; white-space: nowrap; }

.proj-search {
  margin-left: 16px;
  display: flex; align-items: center; gap: 6px;
  padding: 5px 9px; border-radius: 8px;
  border: 1px solid var(--color-border-subtle);
  background: var(--color-surface);
  color: var(--color-text-muted);
  flex: 1;
  max-width: 320px;
}
.proj-search input {
  border: none; background: transparent; outline: none;
  color: var(--color-text); font-size: 11px; width: 100%;
}

.proj-new-btn {
  margin-left: auto;
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 11px; border-radius: 7px;
  border: 1px solid rgba(239, 124, 47, 0.3);
  background: rgba(239, 124, 47, 0.1); color: var(--color-primary);
  font-size: 11px; font-weight: 700; cursor: pointer;
  flex-shrink: 0;
}
.proj-new-btn:hover { background: rgba(239, 124, 47, 0.16); }

.proj-body { flex: 1; overflow-y: auto; padding: 32px 24px 60px; }
.proj-container { max-width: 860px; margin: 0 auto; width: 100%; }

.proj-empty {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  gap: 8px; max-width: 380px; margin: 60px auto 0; color: var(--color-text-muted);
}
.proj-empty h2 { font-size: 14px; font-weight: 700; color: var(--color-text); margin: 4px 0 0; }
.proj-empty p { font-size: 11px; line-height: 1.6; margin: 0; }

.proj-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.proj-card {
  position: relative;
  border: 1px solid var(--color-border-subtle); border-radius: 14px;
  background: var(--color-bg);
  transition: border-color 0.15s;
}
.proj-card:hover { border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-border-subtle)); }

.proj-card-main {
  display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
  width: 100%; cursor: pointer;
  padding: 18px 16px 15px;
  text-align: left;
  border-radius: 14px;
}

.proj-card-icon {
  display: flex; align-items: center; justify-content: center;
  width: 46px; height: 46px; border-radius: 12px;
  background: rgba(239, 124, 47, 0.12); color: var(--color-primary);
  margin-bottom: 10px;
}

.proj-card-name {
  font-size: 14px; font-weight: 700; color: var(--color-text);
  width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.proj-card-path {
  width: 100%;
  font-size: 10.5px; color: var(--color-text-muted); font-family: 'JetBrains Mono', 'Fira Code', monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.proj-card-meta {
  margin-top: 7px;
  font-size: 10.5px; color: var(--color-text-muted);
}

.proj-rename {
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(239, 124, 47, 0.22);
  color: var(--color-text);
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 13px;
  font-weight: 700;
  outline: none;
}

.proj-card-actions {
  position: absolute; top: 10px; right: 10px; z-index: 1;
  display: flex; align-items: center; gap: 3px;
  opacity: 0; transition: opacity 0.15s;
}
.proj-card:hover .proj-card-actions { opacity: 1; }
.proj-icon-btn {
  width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--color-border-subtle);
  background: var(--color-surface); color: var(--color-text-muted);
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.proj-icon-btn:hover { background: var(--color-hover); color: var(--color-text); }
.proj-icon-btn--danger:hover { background: rgba(var(--color-error-rgb), 0.1); color: var(--color-error); }

.proj-card-confirm {
  position: absolute; inset: 0; z-index: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  padding: 16px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-bg) 90%, black);
  text-align: center;
}
.proj-card-confirm-text { font-size: 11.5px; color: var(--color-text); }
.proj-card-confirm-actions { display: flex; align-items: center; gap: 6px; }
.proj-confirm-cancel {
  background: transparent; border: 1px solid var(--color-border-subtle); color: var(--color-text-muted);
  padding: 4px 10px; border-radius: 6px; font-size: 10px; cursor: pointer; white-space: nowrap;
}
.proj-confirm-delete {
  background: rgba(var(--color-error-rgb), 0.12); border: 1px solid rgba(var(--color-error-rgb), 0.3); color: var(--color-error);
  padding: 4px 10px; border-radius: 6px; font-size: 10px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
`
