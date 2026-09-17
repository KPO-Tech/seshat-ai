import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@renderer/api/types'
import { ConfigModal } from '@renderer/components/config/ConfigModal'
import { SettingsModal, type SettingsSection } from '@renderer/components/settings/SettingsModal'
import { applyTheme, getStoredTheme } from '@renderer/lib/theme'
import { Dashboard } from '@renderer/pages/Dashboard'
import { useChatStore } from '@renderer/stores/chat'
import { deleteSession, fetchSession, patchSessionMetadata } from '@renderer/components/chat/lib/chatApi'
import type { ChatSession } from '@renderer/components/chat/lib/chatTypes'
import { Titlebar } from './Titlebar'

type AppView = 'home' | 'store' | 'search' | 'skills' | 'plugins' | 'scheduled' | 'library' | 'projects' | 'tasks'

type Props = {
  user: User
  onLogout: () => void
}

const mainItems: Array<{ id: AppView; label: string; icon: IconName; active?: boolean }> = [
  { id: 'home', label: 'New task', icon: 'edit', active: true },
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'skills', label: 'Skills', icon: 'skills' },
  { id: 'plugins', label: 'Plugins', icon: 'plugins' },
  { id: 'scheduled', label: 'Scheduled', icon: 'clock' },
  { id: 'library', label: 'Library', icon: 'library' },
  { id: 'store', label: 'Store', icon: 'store' }
]

export function AppShell({ user, onLogout }: Props) {
  const [activeView, setActiveView] = useState<AppView>('home')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const setActiveSessionId = useChatStore((state) => state.setActiveSessionId)
  const displayName = user.display_name || user.email
  const initials = useMemo(() => initialsFor(displayName), [displayName])
  const openSettings = (section: SettingsSection) => {
    setProfileMenuOpen(false)
    setConfigOpen(false)
    setSettingsSection(section)
  }

  const openConfig = () => {
    setProfileMenuOpen(false)
    setSettingsSection(null)
    setConfigOpen(true)
  }

  useEffect(() => {
    applyTheme(getStoredTheme())
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isTyping = target?.matches('input, textarea, select, [contenteditable="true"]') ?? false

      if (event.key === 'Escape') {
        if (settingsSection) {
          setSettingsSection(null)
          return
        }
        if (configOpen) {
          setConfigOpen(false)
          return
        }
        if (profileMenuOpen) setProfileMenuOpen(false)
        return
      }

      if (isTyping) return

      if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setSidebarOpen((open) => !open)
        return
      }

      if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setProfileMenuOpen(false)
        setActiveView('search')
        return
      }

      if (event.altKey && event.key === 'Home') {
        event.preventDefault()
        setActiveView('home')
        return
      }

      if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault()
        setActiveView('home')
        return
      }

      if (event.ctrlKey && event.key === ',') {
        event.preventDefault()
        setProfileMenuOpen(false)
        if (event.shiftKey) {
          setSettingsSection(null)
          setConfigOpen(true)
        } else {
          setConfigOpen(false)
          setSettingsSection('general')
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [configOpen, profileMenuOpen, settingsSection])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--surface-root)] text-[var(--text-primary)]">
      <Titlebar
        center="SeshatOS"
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        onHome={() => {
          setActiveView('home')
          setActiveSessionId(null)
        }}
        onBack={() => setActiveView('home')}
        onForward={() => setActiveView('home')}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarOpen && (
          <Sidebar
            activeView={activeView}
            displayName={displayName}
            initials={initials}
            onSelect={setActiveView}
            onNewTask={() => {
              setActiveView('home')
              setActiveSessionId(null)
            }}
            onLogout={onLogout}
            profileMenuOpen={profileMenuOpen}
            onToggleProfileMenu={() => setProfileMenuOpen((open) => !open)}
            onOpenSettings={openSettings}
            onOpenConfig={openConfig}
          />
        )}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface-root)]">
          {activeView === 'home' ? (
            <Dashboard user={user} />
          ) : (
            <LockedView view={activeView} />
          )}
        </main>
      </div>

      {settingsSection && (
        <SettingsModal
          user={user}
          initialSection={settingsSection}
          onLogout={onLogout}
          onClose={() => setSettingsSection(null)}
        />
      )}

      {configOpen && (
        <ConfigModal
          user={user}
          onClose={() => setConfigOpen(false)}
        />
      )}
    </div>
  )
}

function Sidebar({
  activeView,
  displayName,
  initials,
  onSelect,
  onNewTask,
  onLogout,
  profileMenuOpen,
  onToggleProfileMenu,
  onOpenSettings,
  onOpenConfig
}: {
  activeView: AppView
  displayName: string
  initials: string
  onSelect: (view: AppView) => void
  onNewTask: () => void
  onLogout: () => void
  profileMenuOpen: boolean
  onToggleProfileMenu: () => void
  onOpenSettings: (section: SettingsSection) => void
  onOpenConfig: () => void
}) {
  return (
    <aside className="flex w-[236px] shrink-0 flex-col border-r border-[var(--border-soft)] bg-[var(--surface-sidebar)]">
      <nav className="grid gap-1 px-2 pt-3">
        {mainItems.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={activeView === item.id}
            onClick={() => item.id === 'home' ? onNewTask() : onSelect(item.id)}
          />
        ))}
      </nav>

      <div className="mt-4 flex items-center justify-between px-4 text-[12px] font-semibold text-[var(--text-muted)]">
        <span>Projects</span>
        <button type="button" className="flex size-6 items-center justify-center rounded-md hover:bg-[var(--surface-muted)]" aria-label="New project">
          <PlusIcon />
        </button>
      </div>
      <div className="px-2 pt-1">
        <NavButton
          item={{ id: 'projects', label: 'New project', icon: 'folder' }}
          active={activeView === 'projects'}
          onClick={() => onSelect('projects')}
        />
      </div>

      <div className="mt-4 flex items-center justify-between px-4 text-[12px] font-semibold text-[var(--text-muted)]">
        <span>Tasks</span>
        <button type="button" className="flex size-6 items-center justify-center rounded-md hover:bg-[var(--surface-muted)]" aria-label="Task filters">
          <SlidersIcon />
        </button>
      </div>

      <RecentTasks onSelect={() => onSelect('home')} />

      <div className="relative border-t border-[var(--border-soft)] p-2.5">
        {profileMenuOpen && (
          <ProfileMenu
            onAccount={() => onOpenSettings('account')}
            onSettings={() => onOpenSettings('general')}
            onConfig={onOpenConfig}
            onLogout={onLogout}
          />
        )}

        <button
          type="button"
          onClick={onToggleProfileMenu}
          className="flex w-full items-center gap-2.5 rounded-md text-left hover:bg-[var(--surface-muted)]"
          aria-haspopup="menu"
          aria-expanded={profileMenuOpen}
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] text-[12px] font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{displayName}</div>
            <div className="text-[11px] text-[var(--text-muted)]">Local account</div>
          </div>
          <span className="flex size-8 shrink-0 items-center justify-center text-[var(--text-muted)]">
            <ChevronUpIcon />
          </span>
        </button>
      </div>
    </aside>
  )
}

function RecentTasks({ onSelect }: { onSelect: () => void }) {
  const sessions = useChatStore((state) => state.sessions)
  const activeSessionId = useChatStore((state) => state.activeSessionId)
  const isStreamingBySession = useChatStore((state) => state.isStreamingBySession)
  const setActiveSessionId = useChatStore((state) => state.setActiveSessionId)
  const upsertSession = useChatStore((state) => state.upsertSession)
  const updateSession = useChatStore((state) => state.updateSession)
  const removeSession = useChatStore((state) => state.removeSession)
  // openMenuId tracks which row's "..." menu is open - only one at a time,
  // so opening a second row's menu implicitly closes the first.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const recent = [...sessions]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8)

  if (recent.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <div className="max-w-[150px] text-[13px] font-semibold leading-5 text-[var(--text-muted)]">
          <EmptyTasksIcon />
          <div className="mt-3">Create a new task to get started</div>
        </div>
      </div>
    )
  }

  async function rename(session: ChatSession, title: string) {
    const trimmed = title.trim()
    setRenamingId(null)
    if (!trimmed || trimmed === session.title) return
    const previousTitle = session.title
    updateSession(session.id, { title: trimmed })
    try {
      await patchSessionMetadata(session.id, { title: trimmed })
    } catch {
      updateSession(session.id, { title: previousTitle })
    }
  }

  async function remove(session: ChatSession) {
    setOpenMenuId(null)
    if (!window.confirm(`Delete "${session.title || 'New task'}"? This can't be undone.`)) return
    removeSession(session.id)
    try {
      await deleteSession(session.id)
    } catch {
      upsertSession(session)
    }
  }

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pt-1">
      <div className="grid gap-0.5">
        {recent.map((session) => (
          <TaskRow
            key={session.id}
            session={session}
            active={activeSessionId === session.id}
            running={Boolean(isStreamingBySession[session.id])}
            menuOpen={openMenuId === session.id}
            renaming={renamingId === session.id}
            onOpen={() => {
              setActiveSessionId(session.id)
              onSelect()
              void fetchSession(session.id).then(upsertSession).catch(() => undefined)
            }}
            onToggleMenu={() => setOpenMenuId((current) => current === session.id ? null : session.id)}
            onCloseMenu={() => setOpenMenuId(null)}
            onStartRename={() => { setOpenMenuId(null); setRenamingId(session.id) }}
            onRename={(title) => void rename(session, title)}
            onDelete={() => void remove(session)}
          />
        ))}
      </div>
    </div>
  )
}

function TaskRow({
  session,
  active,
  running,
  menuOpen,
  renaming,
  onOpen,
  onToggleMenu,
  onCloseMenu,
  onStartRename,
  onRename,
  onDelete
}: {
  session: ChatSession
  active: boolean
  running: boolean
  menuOpen: boolean
  renaming: boolean
  onOpen: () => void
  onToggleMenu: () => void
  onCloseMenu: () => void
  onStartRename: () => void
  onRename: (title: string) => void
  onDelete: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState(session.title || 'New task')

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onCloseMenu()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen, onCloseMenu])

  useEffect(() => {
    if (renaming) setDraft(session.title || 'New task')
  }, [renaming, session.title])

  if (renaming) {
    return (
      <div className="flex min-h-8 items-center gap-2 rounded-md px-2.5 py-1">
        <SessionStatusDot session={session} running={running} />
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => onRename(draft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onRename(draft)
            if (event.key === 'Escape') onRename(session.title || 'New task')
          }}
          className="min-w-0 flex-1 rounded border border-[var(--border-soft)] bg-[var(--surface-panel)] px-1.5 py-0.5 text-[12px] font-semibold text-[var(--text-primary)] outline-none"
        />
      </div>
    )
  }

  return (
    <div
      className={[
        'group relative flex min-h-8 items-center gap-2 rounded-md px-2.5 py-1 transition-colors',
        active ? 'bg-[var(--surface-panel)]' : 'hover:bg-[var(--surface-muted)]'
      ].join(' ')}
      title={taskMetaLabel(session, running)}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <SessionStatusDot session={session} running={running} />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--text-primary)]">{session.title || 'New task'}</span>
      </button>
      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={onToggleMenu}
          aria-label="Task options"
          className={[
            'flex size-6 shrink-0 items-center justify-center rounded border border-[var(--border-soft)] text-[var(--text-secondary)] hover:bg-[var(--surface-panel)] hover:text-[var(--text-primary)]',
            menuOpen ? 'bg-[var(--surface-panel)] text-[var(--text-primary)]' : 'bg-[var(--surface-sidebar)]'
          ].join(' ')}
        >
          <DotsIcon />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-[140px] overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.32)]">
            <button
              type="button"
              onClick={onStartRename}
              className="flex h-8 w-full items-center rounded-md px-2 text-left text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-muted)]"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex h-8 w-full items-center rounded-md px-2 text-left text-[12px] font-semibold text-[var(--accent-danger)] hover:bg-[var(--surface-muted)]"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function SessionStatusDot({ session, running }: { session: ChatSession; running: boolean }) {
  if (running || session.status === 'running') {
    return (
      <span className="relative flex size-2.5 shrink-0 items-center justify-center" aria-label="Running">
        <span className="absolute size-2.5 animate-ping rounded-full bg-[var(--accent-primary)]/35" />
        <span className="size-2 rounded-full bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary)]" />
      </span>
    )
  }
  if (session.status === 'failed') {
    return <span className="size-2 shrink-0 rounded-full bg-[var(--accent-danger)]" aria-label="Failed" />
  }
  return <span className="size-2 shrink-0 rounded-full border border-[var(--border-soft)] bg-transparent opacity-70" aria-hidden="true" />
}

function taskMetaLabel(session: ChatSession, running: boolean) {
  if (running || session.status === 'running') return 'Agent working'
  if (session.status === 'failed') return 'Failed'
  return formatRelative(session.updatedAt)
}

function formatRelative(value: string) {
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return 'Recent'
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000))
  if (minutes < 1) return 'Now'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h`
  return new Date(value).toLocaleDateString()
}

function ProfileMenu({
  onAccount,
  onSettings,
  onConfig,
  onLogout
}: {
  onAccount: () => void
  onSettings: () => void
  onConfig: () => void
  onLogout: () => void
}) {
  return (
    <div className="absolute bottom-[58px] left-2 right-2 z-20 overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
      <MenuButton icon="account" label="Account" onClick={onAccount} />
      <MenuButton icon="settings" label="Settings" onClick={onSettings} />
      <MenuButton icon="config" label="Config" onClick={onConfig} />
      <div className="my-1 border-t border-[var(--border-soft)]" />
      <MenuButton icon="logout" label="Sign out" danger onClick={onLogout} />
    </div>
  )
}

function MenuButton({ icon, label, danger = false, onClick }: { icon: MenuIconName; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] font-semibold transition-colors hover:bg-[var(--surface-muted)]',
        danger ? 'text-[var(--accent-danger)]' : 'text-[var(--text-primary)]'
      ].join(' ')}
      role="menuitem"
    >
      <MenuIcon name={icon} />
      {label}
    </button>
  )
}

function NavButton({
  item,
  active,
  onClick
}: {
  item: { id: AppView; label: string; icon: IconName }
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[14px] font-medium transition-colors',
        active
          ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-[0_1px_0_rgba(0,0,0,0.04)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
      ].join(' ')}
    >
      <span className={active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
        <Icon name={item.icon} />
      </span>
      <span className="truncate">{item.label}</span>
    </button>
  )
}

function LockedView({ view }: { view: AppView }) {
  const label = mainItems.find((item) => item.id === view)?.label || view
  return (
    <section className="flex flex-1 items-center justify-center px-8">
      <div className="w-full max-w-[520px] text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-muted)]">
          <Icon name="store" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-normal">{label}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          This area is reserved while the Chat workspace is rebuilt first.
        </p>
      </div>
    </section>
  )
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

type IconName = 'edit' | 'search' | 'skills' | 'plugins' | 'clock' | 'library' | 'store' | 'folder'

function Icon({ name }: { name: IconName }) {
  if (name === 'edit') return <EditIcon />
  if (name === 'search') return <SearchIcon />
  if (name === 'skills') return <SkillsIcon />
  if (name === 'plugins') return <PluginsIcon />
  if (name === 'clock') return <ClockIcon />
  if (name === 'library') return <LibraryIcon />
  if (name === 'store') return <StoreIcon />
  return <FolderIcon />
}

function EditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

function SkillsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v5M12 17v5M4.2 4.2l3.5 3.5M16.3 16.3l3.5 3.5M2 12h5M17 12h5M4.2 19.8l3.5-3.5M16.3 7.7l3.5-3.5" />
    </svg>
  )
}

function PluginsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function LibraryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19V5M8 19V5M12 19V5M17 19 14 5M20 19 17 5" />
    </svg>
  )
}

function StoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10h16" />
      <path d="M5 10 7 4h10l2 6" />
      <path d="M6 10v9h12v-9" />
      <path d="M9 19v-5h6v5" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7h6l2 3h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="M16 14h4M18 12v4" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  )
}

function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="3.5" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="8" cy="12.5" r="1.3" />
    </svg>
  )
}

function SlidersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M3 4h10M3 12h10M5.5 2.5v3M10.5 10.5v3" />
    </svg>
  )
}

function ChevronUpIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m4 10 4-4 4 4" />
    </svg>
  )
}

function EmptyTasksIcon() {
  return (
    <svg className="mx-auto text-[var(--text-muted)]" width="42" height="42" viewBox="0 0 42 42" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 10h16a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H18l-7 6v-6h-1a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3" strokeDasharray="3 5" />
    </svg>
  )
}

type MenuIconName = 'account' | 'settings' | 'config' | 'logout'

function MenuIcon({ name }: { name: MenuIconName }) {
  if (name === 'account') return <AccountIcon />
  if (name === 'settings') return <SettingsIcon />
  if (name === 'config') return <ConfigIcon />
  return <LogoutIcon />
}

function AccountIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M4 17h16" />
      <path d="M8 5v4M16 15v4" />
    </svg>
  )
}

function ConfigIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
      <path d="M8 4v4M15 10v4M11 16v4" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 17l5-5-5-5M15 12H3" />
      <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" />
    </svg>
  )
}
