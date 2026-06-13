import { useNavigate, useLocation } from 'react-router-dom'
import {
  Plus,
  Search,
  Time,
  Peoples,
  SettingTwo,
  User,
  Down,
  Right,
  Delete,
  Edit,
  EditTwo,
  Layers,
} from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'
import { NexusLogo } from '@/components/NexusLogo'
import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { UNTITLED_SESSION_TITLE } from '@/lib/sessionTitle'
import { SearchModal } from './SearchModal'

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const sessions = useSessionStore((s) => s.sessions)
  const activeId = useSessionStore((s) => s.activeId)
  const setActive = useSessionStore((s) => s.setActive)
  const removeSession = useSessionStore((s) => s.removeSession)
  const updateSession = useSessionStore((s) => s.updateSession)
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  
  const [recentsOpen, setRecentsOpen] = useState(true)
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const width = collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)'
  const recentSessions = [...sessions]
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
    navigate('/')
    useSessionStore.getState().setActive(null)
  }

  function openSession(id: string) {
    setActive(id)
    navigate(`/conversation/${id}`)
  }

  async function handleDeleteSession(id: string) {
    setMenuSessionId(null)
    try {
      await api.delete(`/sessions/${id}`)
      removeSession(id)
      // Close the right panel if it belongs to the deleted session so the
      // AgentMonitorPanel doesn't keep rendering for a non-existent session.
      const { rightPanel, closeRightPanel } = useUIStore.getState()
      if (rightPanel.open && rightPanel.sessionId === id) {
        closeRightPanel()
      }
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

        {/* ── Header ── */}
        <div className="sb-header">
          <div className="sb-logo-wrap">
            <NexusLogo size={collapsed ? 32 : 28} />
            {!collapsed && <span className="sb-brand">Nexus</span>}
          </div>
        </div>

        {/* ── Primary Actions (OS Apps) ── */}
        <div className="sb-section">
          <SidebarItem
            icon={<Plus theme="outline" size={20} />}
            label="New Chat"
            shortcut="⌘K"
            collapsed={collapsed}
            active={pathname === '/' && !activeId}
            onClick={startNewChat}
          />
          <SidebarItem
            icon={<Search theme="outline" size={20} />}
            label="Search"
            shortcut="⌘K"
            collapsed={collapsed}
            onClick={() => setSearchOpen(true)}
          />
          <SidebarItem
            icon={<Peoples theme="outline" size={20} />}
            label="Teams"
            collapsed={collapsed}
            active={pathname.startsWith('/teams')}
            onClick={() => navigate('/teams')}
          />
          <SidebarItem
            icon={<EditTwo theme="outline" size={20} />}
            label="Skills Creator"
            collapsed={collapsed}
            active={pathname === '/skills-creator'}
            onClick={() => navigate('/skills-creator')}
            accent
          />
          <SidebarItem
            icon={<Time theme="outline" size={20} />}
            label="Scheduled Tasks"
            collapsed={collapsed}
            active={pathname === '/scheduled-tasks'}
            onClick={() => navigate('/scheduled-tasks')}
          />
          <SidebarItem
            icon={<Layers theme="outline" size={20} />}
            label="Workspace"
            collapsed={collapsed}
            active={pathname === '/workspace'}
            onClick={() => navigate('/workspace')}
            accent
          />
        </div>

        {/* ── History Sections ── */}
        <div className="sb-scroll">
          
          {/* Recents */}
          {!collapsed && (
            <div className="sb-nav-group">
              <button 
                className="sb-nav-header interactive"
                onClick={() => setRecentsOpen(!recentsOpen)}
              >
                <span>Recents</span>
                {recentsOpen ? <Down size={14} /> : <Right size={14} />}
              </button>
              
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
                              <span className="sb-recent-menu-icon" aria-hidden="true">⋮</span>
                            </button>
                            {menuSessionId === s.id && (
                              <div className="sb-recent-menu">
                                <button type="button" onClick={() => startRenameSession(s.id, s.title)}>
                                  <Edit size={14} />
                                  <span>Rename</span>
                                </button>
                                <button type="button" className="danger" onClick={() => { void handleDeleteSession(s.id) }}>
                                  <Delete size={14} />
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

        {/* ── Footer ── */}
        <div className="sb-footer">
          <div className={`sb-footer-items ${collapsed ? 'collapsed' : ''}`}>
            <button 
              className="sb-footer-btn" 
              onClick={() => navigate('/settings')}
              title={collapsed ? "Settings" : ""}
            >
              <SettingTwo theme="outline" size={collapsed ? 24 : 22} />
              {!collapsed && <span>Settings</span>}
            </button>
            
            <button className="sb-footer-btn profile" onClick={() => navigate('/user-settings')} title={collapsed ? user?.display_name || user?.email : ""}>
              <div className="sb-avatar-circle">
                <User theme="outline" size={collapsed ? 18 : 16} />
              </div>
            </button>
          </div>
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

// ─── SidebarItem ─────────────────────────────────────────────────────────────

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
      title={collapsed ? label : undefined}
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

// ─── Styles ──────────────────────────────────────────────────────────────────

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

.sb-header {
  padding: 20px 20px 12px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}

.sb-root:not(.collapsed) .sb-header {
  justify-content: flex-start;
  padding-left: 24px;
}

.sb-logo-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sb-brand {
  font-size: 19px;
  font-weight: 800;
  color: var(--color-text);
  letter-spacing: -0.02em;
}

.sb-section {
  padding: 4px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px; 
}

.sb-root.collapsed .sb-section {
  align-items: center;
}

.sb-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sb-nav-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sb-recents-list {
  padding-left: 10px;
  overflow: visible;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 6px;
}

.sb-nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-muted);
  background: none;
  border: none;
  width: 100%;
  text-align: left;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.sb-recent-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 10px;
  padding: 2px;
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
  padding: 8px 10px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: none;
  border: none;
  border-radius: 8px;
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
  width: 28px;
  height: 28px;
  border-radius: 8px;
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
  font-size: 17px;
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
  background: rgba(44, 42, 49, 0.98);
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
  border-radius: 8px;
  padding: 9px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
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
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
}

.sb-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.1s;
  white-space: nowrap;
}


.sb-item.collapsed {
  justify-content: center;
  padding: 12px 0;
  width: 44px;
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
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-muted);
  background: var(--color-border-subtle);
  padding: 2px 6px;
  border-radius: 5px;
}

.sb-footer {
  padding: 16px 12px 32px;
  border-top: 1px solid var(--color-border-subtle);
}

.sb-footer-items {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
}

.sb-footer-items.collapsed {
  flex-direction: column;
  gap: 16px;
  padding: 0;
}

.sb-footer-btn {
  background: none;
  border: none;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--color-text-secondary);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  padding: 10px;
  border-radius: 10px;
  transition: background 0.15s;
}

.sb-footer-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.sb-avatar-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.sb-empty {
  padding: 4px 24px 8px;
  font-size: 11px;
  color: var(--color-text-muted);
  font-style: italic;
}
`
