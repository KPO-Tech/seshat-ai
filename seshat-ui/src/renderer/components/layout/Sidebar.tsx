import { useNavigate, useLocation } from 'react-router'
import {
  Plus,
  Search,
  SettingTwo,
  Message,
  Down,
  Right,
  Delete,
  Edit,
  Time,
  History,
  Shield,
  Workbench,
  Browser,
} from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { NexusLogo } from '@/components/NexusLogo'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/api/client'
import { UNTITLED_SESSION_TITLE } from '@/lib/sessionTitle'
import { deleteSession } from '@/lib/deleteSession'
import { SearchModal } from './SearchModal'
import { useSettingsMenu } from './useSettingsMenu'

const PROJECTS_STORAGE_KEY = 'seshat.projects.v1'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

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
  const [consoleMenuOpen, setConsoleMenuOpen] = useState(false)
  const { isAdmin, connected, go } = useSettingsMenu()

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
      if (target?.closest('.sb-console-wrap')) return
      setMenuSessionId(null)
      setConsoleMenuOpen(false)
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
      <aside
        className="absolute inset-y-0 left-0 z-[100] flex flex-col overflow-hidden border-r border-app-border-subtle bg-app-bg transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ width }}
      >
        <div className={cx('flex flex-col gap-px px-2 pb-1 pt-3.5', collapsed && 'items-center')}>
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

        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 py-2">
          {!collapsed && (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-0.5">
                <button
                  className="flex min-w-0 flex-1 items-center justify-between border-0 bg-transparent px-2 text-left text-[var(--font-size-2xs)] font-bold uppercase tracking-[0.05em] text-app-text-muted"
                  onClick={() => setRecentsOpen(!recentsOpen)}
                  type="button"
                >
                  <span>Recents</span>
                  {recentsOpen ? <Down size={12} /> : <Right size={12} />}
                </button>
                <button
                  className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent text-app-text-muted transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text"
                  type="button"
                  aria-label="Chat history"
                  onClick={() => navigate('/history')}
                >
                  <History size={13} />
                </button>
              </div>

              {recentsOpen && (
                <div className="flex flex-col gap-0.5 overflow-visible pl-2 pr-1">
                  {recentSessions.map((s) => {
                    const active = s.id === activeId
                    const menuOpen = menuSessionId === s.id
                    return (
                      <div
                        key={s.id}
                        className={cx(
                          'group relative flex items-center gap-1 overflow-visible rounded-app-md p-px',
                          active && 'bg-white/[0.04]',
                        )}
                      >
                        {editingSessionId === s.id ? (
                          <input
                            className="w-full min-w-0 rounded-[7px] border border-[rgba(239,124,47,0.22)] bg-white/[0.04] px-2 py-[5px] text-[var(--font-size-sm)] text-app-text outline-none"
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
                              className={cx(
                                'block min-w-0 flex-1 cursor-pointer rounded-[7px] border-0 bg-transparent px-2 py-[5px] text-left text-[var(--font-size-sm)] text-app-text-secondary transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text',
                                active && 'font-semibold',
                              )}
                              onClick={() => openSession(s.id)}
                              type="button"
                            >
                              <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{s.title || UNTITLED_SESSION_TITLE}</span>
                            </button>
                            <div className="sb-recent-menu-wrap relative shrink-0">
                              <button
                                className={cx(
                                  'flex size-[22px] cursor-pointer items-center justify-center rounded-[7px] border-0 bg-transparent text-app-text-muted opacity-0 transition duration-150 hover:bg-[var(--color-hover)] hover:text-app-text group-hover:opacity-100',
                                  menuOpen && 'bg-[var(--color-hover)] text-app-text opacity-100',
                                )}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setMenuSessionId((current) => current === s.id ? null : s.id)
                                }}
                              >
                                <span className="-translate-y-px text-[var(--font-size-md)] leading-none" aria-hidden="true">...</span>
                              </button>
                              {menuOpen && (
                                <div className="absolute right-0 top-[calc(100%+6px)] z-30 flex min-w-[156px] flex-col gap-0.5 rounded-app-xl border border-app-border-subtle bg-[var(--color-menu-bg)] p-1.5 shadow-[0_14px_28px_rgba(0,0,0,0.24)]">
                                  <button className="flex w-full cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[7px] border-0 bg-transparent px-2 py-[7px] text-left text-[var(--font-size-sm)] text-app-text hover:bg-[var(--color-hover)]" type="button" onClick={() => startRenameSession(s.id, s.title)}>
                                    <Edit size={12} />
                                    <span>Rename</span>
                                  </button>
                                  <button className="flex w-full cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[7px] border-0 bg-transparent px-2 py-[7px] text-left text-[var(--font-size-sm)] text-[#fda4af] hover:bg-[var(--color-hover)]" type="button" onClick={() => { void handleDeleteSession(s.id) }}>
                                    <Delete size={12} />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                  {recentSessions.length === 0 && (
                    <div className="px-4 pb-2 pt-1 text-[var(--font-size-2xs)] italic text-app-text-muted">No recent chats</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 border-t border-app-border-subtle px-2.5 pb-4 pt-2.5">
          <div className="sb-console-wrap relative min-w-0">
            <button
              className={cx(
                'flex min-w-0 cursor-pointer items-center gap-2 rounded-app-md border-0 bg-transparent px-2 py-1.5 text-[var(--font-size-base)] font-bold text-app-text-secondary transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text',
                collapsed ? 'mx-auto w-9 justify-center' : 'w-full',
                consoleMenuOpen && 'bg-[var(--color-hover)] text-app-text',
              )}
              onClick={() => setConsoleMenuOpen((open) => !open)}
              aria-label={collapsed ? 'Seshat menu' : undefined}
              aria-expanded={consoleMenuOpen}
              aria-haspopup="menu"
              type="button"
            >
              <NexusLogo size={collapsed ? 22 : 18} />
              {!collapsed && (
                <>
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">SeshatOS</span>
                  <Down size={12} />
                </>
              )}
            </button>

            {consoleMenuOpen && (
              <div
                className={cx(
                  'absolute bottom-[calc(100%+10px)] left-0 z-50 flex min-w-[190px] flex-col gap-0.5 rounded-app-xl border border-app-border-subtle bg-[var(--color-menu-bg)] p-1.5 shadow-[0_16px_34px_rgba(0,0,0,0.28)]',
                  collapsed && 'bottom-[calc(100%+8px)] min-w-[164px]',
                )}
                role="menu"
              >
                <ConsoleMenuButton onClick={() => { setConsoleMenuOpen(false); go('settings') }} icon={<SettingTwo theme="outline" size={14} />} label="Settings" />
                <ConsoleMenuButton onClick={() => { setConsoleMenuOpen(false); go('feedback') }} icon={<Message theme="outline" size={14} />} label="Feedback" />
                {connected && (
                  <ConsoleMenuButton
                    onClick={() => { setConsoleMenuOpen(false); go('admin') }}
                    icon={<Shield theme="outline" size={14} />}
                    label="Admin"
                    disabled={!isAdmin}
                  />
                )}
              </div>
            )}
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
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-app-md border-0 bg-transparent px-2.5 py-1.5 text-[var(--font-size-base)] font-semibold text-app-text-secondary transition duration-100 hover:bg-[var(--color-hover)] hover:text-app-text',
        collapsed && 'mx-auto w-9 justify-center px-0 py-2',
        active && 'bg-app-primary-subtle text-[var(--color-cta)] hover:bg-app-primary-subtle hover:text-[var(--color-cta)]',
        accent && 'text-app-primary',
      )}
      aria-label={collapsed ? label : undefined}
    >
      <span className={cx('flex shrink-0 items-center text-app-text-muted', active && 'text-[var(--color-cta)]')}>{icon}</span>
      {!collapsed && (
        <>
          <span className={cx('min-w-0 flex-1 overflow-hidden text-ellipsis text-left', active && 'text-[var(--color-cta)]')}>{label}</span>
          {shortcut && (
            <span className="rounded-[4px] bg-app-border-subtle px-[5px] py-px text-[var(--font-size-2xs)] font-bold text-app-text-muted">
              {shortcut}
            </span>
          )}
        </>
      )}
    </button>
  )
}

function ConsoleMenuButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      className="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-[7px] border-0 bg-transparent px-[9px] py-2 text-left text-[var(--font-size-sm)] font-semibold text-app-text hover:bg-[var(--color-hover)] disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
