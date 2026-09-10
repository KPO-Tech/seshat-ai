import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { SettingTwo, Message, Shield, SunOne, Moon } from '@icon-park/react'
import { useUIStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import { NexusLogo } from '@/components/NexusLogo'

type SystemStatus = { mode: 'standalone' | 'connected' }

// Rendered by Shell inside Titlebar, so it's on every screen this app has -
// unlike Sidebar (see Shell's showSidebar), which several immersive apps
// (Automation, Knowledge, Inbox, ...) deliberately hide. Settings, Feedback
// and Admin are account-level concerns, not per-app ones, so they shouldn't
// disappear just because the current app hid its own nav. Previously this
// lived only in Sidebar's footer - moved here rather than duplicated, so
// there's exactly one Settings/Feedback/Admin entry point.
export function GlobalMenu() {
  const navigate = useNavigate()
  const roles = useAuthStore((s) => s.roles)
  const isAdmin = roles.includes('admin')
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.get<SystemStatus>('/system/status')
      .then((status) => { if (!cancelled) setConnected(status.mode === 'connected') })
      .catch(() => { if (!cancelled) setConnected(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('.gm-wrap')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  function go(kind: 'settings' | 'feedback' | 'admin') {
    setOpen(false)
    if (kind === 'settings') {
      navigate('/settings')
      return
    }
    if (kind === 'admin') {
      if (isAdmin) navigate('/admin')
      return
    }
    window.location.href = 'mailto:feedback@seshat.local?subject=SeshatOS%20feedback'
  }

  return (
    <div className="gm-wrap">
      <style>{GLOBAL_MENU_CSS}</style>
      <button
        type="button"
        className={`gm-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="SeshatOS menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <NexusLogo size={15} />
      </button>

      {open && (
        <div className="gm-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => go('settings')}>
            <SettingTwo theme="outline" size={14} />
            <span>Settings</span>
          </button>
          <button type="button" role="menuitem" onClick={() => go('feedback')}>
            <Message theme="outline" size={14} />
            <span>Feedback</span>
          </button>
          {connected && (
            <button type="button" role="menuitem" disabled={!isAdmin} onClick={() => go('admin')}>
              <Shield theme="outline" size={14} />
              <span>Admin</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Standalone, one-click - kept separate from GlobalMenu's dropdown (same
// reasoning Sidebar's old footer had: a per-turn action shouldn't cost an
// extra click to open a menu first).
export function ThemeToggleButton() {
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  return (
    <button
      type="button"
      className="gm-theme-btn"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? <SunOne size={14} /> : <Moon size={14} />}
    </button>
  )
}

const GLOBAL_MENU_CSS = `
.gm-wrap {
  position: relative;
}

.gm-trigger {
  width: 28px;
  height: 28px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.gm-trigger:hover,
.gm-trigger.open {
  background: var(--color-hover);
  color: var(--color-text);
}

.gm-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 180px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--color-border-subtle);
  background: var(--color-menu-bg);
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 1100;
  -webkit-app-region: no-drag;
}

.gm-menu button {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text);
  border-radius: 7px;
  padding: 8px 9px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-sm);
  font-weight: 650;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}

.gm-menu button:hover:not(:disabled) {
  background: var(--color-hover);
}

.gm-menu button:disabled {
  opacity: 0.45;
  cursor: default;
}

.gm-theme-btn {
  width: 28px;
  height: 28px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.gm-theme-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}
`
