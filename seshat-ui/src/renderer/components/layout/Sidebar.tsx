import { useNavigate, useLocation } from 'react-router'
import {
  Plus,
  Search,
  Down,
  Right,
  Delete,
  Edit,
  Time,
  History,
  Workbench,
  Browser,
} from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/api/client'
import { UNTITLED_SESSION_TITLE } from '@/lib/sessionTitle'
import { deleteSession } from '@/lib/deleteSession'
import { SearchModal } from './SearchModal'

const PROJECTS_STORAGE_KEY = 'seshat.projects.v1'

type SystemStatus = { mode: 'standalone' | 'connected'; server_url?: string }

function normalizeProjectPath(path: string): string {
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

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const sessions = useSessionStore((s) => s.sessions)
  const activeId = useSessionStore((s) => s.activeId)
  const setActive = useSessionStore((s) => s.setActive)
  const updateSession = useSessionStore((s) => s.updateSession)
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  
  const [recentsOpen, setRecentsOpen] = useState(true)
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)

  useEffect(() => {
    api.get<SystemStatus>('/system/status').then(setSystemStatus).catch(() => setSystemStatus(null))
  }, [])
  const connected = systemStatus?.mode === 'connected'

  const width = collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)'
  const projectParam = new URLSearchParams(search).get('project')
  const projectRouteId = pathname.match(/^\/projects\/([^/]+)/)?.[1]
  const conversationRouteId = pathname.match(/^\/conversation\/([^/]+)/)?.[1]
  const projectContextPath = useMemo(() => {
    if (projectParam) return projectParam
    if (projectRouteId) {
      const decodedId = decodeURIComponent(projectRouteId)
      return readStoredProjectPath(decodedId)
        || sessions.find((s) => s.projectPath && `path-${normalizeProjectPath(s.projectPath).toLowerCase()}` === decodedId)?.projectPath
        || null
    }
    if (conversationRouteId) {
      return sessions.find((s) => s.id === conversationRouteId)?.projectPath || null
    }
    return null
  }, [projectParam, projectRouteId, conversationRouteId, sessions])
  const inProjectContext = Boolean(projectContextPath)
  const recentSessions = sessions
    // Sessions created from Knowledge are real, fully persisted sessions
    // (reachable from History and Ctrl+K search) - just excluded from this
    // list so a one-off lookup doesn't clutter the main chat sidebar.
    .filter((s) => s.source !== 'knowledge' && s.source !== 'inbox')
    .filter((s) => {
      if (!projectContextPath) return !s.projectPath
      return normalizeProjectPath(s.projectPath ?? '').toLowerCase()
        === normalizeProjectPath(projectContextPath).toLowerCase()
    })
    .sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt).getTime()
      const bTime = new Date(b.updatedAt || b.createdAt).getTime()
      return bTime - aTime
    })
    .slice(0, 12)

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('.sb-recent-menu-wrap')) return
      setMenuSessionId(null)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  function startNewChat() {
    navigate(projectContextPath ? `/?project=${encodeURIComponent(projectContextPath)}` : '/')
    useSessionStore.getState().setActive(null)
  }

  function openSession(id: string) {
    setActive(id)
    navigate(`/conversation/${id}`)
  }

  async function handleDeleteSession(id: string) {
    setMenuSessionId(null)
    try {
      await deleteSession(id)
      if (activeId === id) {
        navigate('/')
      }
    } catch {
      // noop for now
    }
  }

  function startRenameSession(id: string, currentTitle?: string) {
    setMenuSessionId(null)
    setEditingSessionId(id)
    setEditingTitle((currentTitle || UNTITLED_SESSION_TITLE).trim())
  }

  async function commitRenameSession(id: string) {
    const nextTitle = editingTitle.trim()
    setEditingSessionId(null)
    if (!nextTitle) {
      setEditingTitle('')
      return
    }
    updateSession(id, { title: nextTitle, updatedAt: new Date().toISOString() })
    setEditingTitle('')
    try {
      await api.patch(`/sessions/${id}`, { title: nextTitle })
    } catch {
      // noop for now
    }
  }

  return (
    <>
      <style>{SIDEBAR_CSS}</style>
      <aside
        className={`sb-root${collapsed ? ' collapsed' : ''}`}
        style={{ width }}
      >
        {/* Primary Actions */}
        <div className="sb-section">
          <SidebarItem
            icon={<Plus theme="outline" size={16} />}
            label="New Chat"
            collapsed={collapsed}
            active={pathname === '/' && !activeId}
            onClick={startNewChat}
          />
          <SidebarItem
            icon={<Search theme="outline" size={16} />}
            label="Search"
            shortcut="Ctrl K"
            collapsed={collapsed}
            onClick={() => setSearchOpen(true)}
          />
          {!inProjectContext && (
            <>
              {connected && (
                <SidebarItem
                  icon={<Time theme="outline" size={16} />}
                  label="Scheduling"
                  collapsed={collapsed}
                  active={pathname === '/scheduling'}
                  onClick={() => navigate('/scheduling')}
                />
              )}
              <SidebarItem
                icon={<Browser theme="outline" size={16} />}
                label="Seshat-Labs"
                collapsed={collapsed}
                active={pathname.startsWith('/apps') || pathname.startsWith('/automation') || pathname.startsWith('/teams')}
                onClick={() => navigate('/apps')}
              />
              <SidebarItem
                icon={<Workbench theme="outline" size={16} />}
                label="Projects"
                collapsed={collapsed}
                active={pathname.startsWith('/projects')}
                onClick={() => navigate('/projects')}
              />
            </>
          )}
        </div>

        {/* History Sections */}
        <div className="sb-scroll">
          
          {/* Recents */}
          {!collapsed && (
            <div className="sb-nav-group">
              <div className="sb-nav-header-row">
                <button
                  className="sb-nav-header interactive"
                  onClick={() => setRecentsOpen(!recentsOpen)}
                >
                  <span>Recents</span>
                  {recentsOpen ? <Down size={12} /> : <Right size={12} />}
                </button>
                <button
                  className="sb-history-btn"
                  type="button"
                  aria-label="Chat history"
                  onClick={() => navigate('/history')}
                >
                  <History size={13} />
                </button>
              </div>

              {recentsOpen && (
                <div className="sb-recents-list">
                  {recentSessions.map((s) => (
                    <div key={s.id} className={`sb-recent-row ${s.id === activeId ? 'active' : ''}`}>
                      {editingSessionId === s.id ? (
                        <input
                          className="sb-recent-rename"
                          value={editingTitle}
                          autoFocus
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onBlur={() => { void commitRenameSession(s.id) }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void commitRenameSession(s.id)
                            } else if (event.key === 'Escape') {
                              setEditingSessionId(null)
                              setEditingTitle('')
                            }
                          }}
                        />
                      ) : (
                        <>
                          <button
                            className="sb-recent-item"
                            onClick={() => openSession(s.id)}
                            type="button"
                          >
                            <span className="sb-recent-title">{s.title || UNTITLED_SESSION_TITLE}</span>
                          </button>
                          <div className="sb-recent-menu-wrap">
                            <button
                              className={`sb-recent-menu-btn${menuSessionId === s.id ? ' open' : ''}`}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                setMenuSessionId((current) => current === s.id ? null : s.id)
                              }}
                            >
                              <span className="sb-recent-menu-icon" aria-hidden="true">...</span>
                            </button>
                            {menuSessionId === s.id && (
                              <div className="sb-recent-menu">
                                <button type="button" onClick={() => startRenameSession(s.id, s.title)}>
                                  <Edit size={12} />
                                  <span>Rename</span>
                                </button>
                                <button type="button" className="danger" onClick={() => { void handleDeleteSession(s.id) }}>
                                  <Delete size={12} />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {recentSessions.length === 0 && (
                    <div className="sb-empty">No recent chats</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      <SearchModal
        open={searchOpen}
        sessions={sessions}
        onClose={() => setSearchOpen(false)}
        onSelect={openSession}
      />
    </>
  )
}

// SidebarItem

type ItemProps = {
  icon: React.ReactNode
  label: string
  shortcut?: string
  collapsed: boolean
  active?: boolean
  accent?: boolean
  onClick: () => void
}

function SidebarItem({ icon, label, shortcut, collapsed, active, accent, onClick }: ItemProps) {
  return (
    <button
      onClick={onClick}
      className={`sb-item${active ? ' active' : ''}${collapsed ? ' collapsed' : ''}${accent ? ' accent' : ''}`}
      aria-label={collapsed ? label : undefined}
    >
      <span className="sb-item-icon">{icon}</span>
      {!collapsed && (
        <>
          <span className="sb-item-label">{label}</span>
          {shortcut && <span className="sb-item-shortcut">{shortcut}</span>}
        </>
      )}
    </button>
  )
}

// Styles

const SIDEBAR_CSS = `
.sb-root {
  position: absolute;
  top: 0; 
  left: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  border-right: 1px solid var(--color-border-subtle);
  overflow: hidden;
  z-index: 100;
  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.sb-section {
  padding: 14px 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.sb-root.collapsed .sb-section {
  align-items: center;
}

.sb-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sb-nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sb-recents-list {
  padding-left: 8px;
  overflow: visible;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 4px;
}

.sb-nav-header-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.sb-nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  font-size: var(--font-size-2xs);
  font-weight: 700;
  color: var(--color-text-muted);
  background: none;
  border: none;
  flex: 1;
  min-width: 0;
  text-align: left;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.sb-history-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}

.sb-history-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.sb-recent-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 8px;
  padding: 1px;
  overflow: visible;
}

.sb-recent-row.active {
  background: rgba(255, 255, 255, 0.04);
}

.sb-recent-item {
  flex: 1;
  min-width: 0;
  display: block;
  width: 100%;
  padding: 5px 8px;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  background: none;
  border: none;
  border-radius: 7px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s;
}

.sb-recent-item:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.sb-recent-item.active {
  background: var(--color-active);
  color: var(--color-text);
  font-weight: 600;
}

.sb-recent-title {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sb-recent-menu-wrap {
  position: relative;
  flex-shrink: 0;
}

.sb-recent-menu-btn {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.sb-recent-menu-icon {
  font-size: var(--font-size-md);
  line-height: 1;
  transform: translateY(-1px);
}

.sb-recent-row:hover .sb-recent-menu-btn,
.sb-recent-menu-btn.open {
  opacity: 1;
}

.sb-recent-menu-btn:hover,
.sb-recent-menu-btn.open {
  background: var(--color-hover);
  color: var(--color-text);
}

.sb-recent-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 156px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--color-border-subtle);
  background: var(--color-menu-bg);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.24);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 30;
}

.sb-recent-menu button {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text);
  border-radius: 7px;
  padding: 7px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-sm);
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}

.sb-recent-menu button:hover {
  background: var(--color-hover);
}

.sb-recent-menu button.danger {
  color: #fda4af;
}

.sb-recent-rename {
  width: 100%;
  min-width: 0;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(239, 124, 47, 0.22);
  color: var(--color-text);
  border-radius: 7px;
  padding: 5px 8px;
  font-size: var(--font-size-sm);
  outline: none;
}

.sb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-base);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.1s;
  white-space: nowrap;
}


.sb-item.collapsed {
  justify-content: center;
  padding: 8px 0;
  width: 36px;
  margin: 0 auto;
}

.sb-item:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.sb-item.active {
  background: var(--color-primary-subtle);
  color: var(--color-cta);
}

.sb-item-icon {
  display: flex;
  align-items: center;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.sb-item.active .sb-item-icon {
  color: var(--color-cta);
}

.sb-item.active .sb-item-label {
  color: var(--color-cta);
}

.sb-item-label {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sb-item-shortcut {
  font-size: var(--font-size-2xs);
  font-weight: 700;
  color: var(--color-text-muted);
  background: var(--color-border-subtle);
  padding: 1px 5px;
  border-radius: 4px;
}

.sb-empty {
  padding: 4px 16px 8px;
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
  font-style: italic;
}
`
