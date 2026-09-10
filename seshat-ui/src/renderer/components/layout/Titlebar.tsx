import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Home, Left, Right } from '@icon-park/react'
import { NexusLogo } from '@/components/NexusLogo'
import { WindowCloseIcon, WindowMaximizeIcon, WindowMinimizeIcon } from '@/components/ui/WindowControlIcon'

type Props = {
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
}

// The app runs frameless (frame: false in main/index.ts) so every screen
// needs its own drag region + minimize/maximize/close — there's no OS
// titlebar to fall back on. Shared here so screens rendered outside Shell's
// route tree (Login, Register — see router/index.tsx, they're top-level
// routes, not Shell children) aren't left without any way to move or close
// the window.
export function Titlebar({ left, center, right }: Props) {
  const navigate = useNavigate()
  const handleMinimize = () => window.nexus.window.minimize()
  const handleMaximize = () => window.nexus.window.maximize()
  const handleClose = () => window.nexus.window.close()
  const handleBack = () => navigate(-1)
  const handleForward = () => navigate(1)
  const handleHome = () => navigate('/')

  return (
    <div className="shell-titlebar">
      <style>{TITLEBAR_CSS}</style>
      <div className="titlebar-left">
        {left}
        <div className="tb-nav-group" aria-label="Navigation">
          <button className="tb-nav-btn" onClick={handleHome} aria-label="Home" type="button">
            <Home size={14} />
          </button>
          <button className="tb-nav-btn" onClick={handleBack} aria-label="Back" type="button">
            <Left size={14} />
          </button>
          <button className="tb-nav-btn" onClick={handleForward} aria-label="Forward" type="button">
            <Right size={14} />
          </button>
        </div>
      </div>
      {center && (
        <div className="titlebar-center">
          <NexusLogo size={14} />
          <span>{center}</span>
        </div>
      )}
      <div className="titlebar-right">
        {right && (
          <>
            <div className="tb-right-slot">{right}</div>
            <div className="tb-divider" aria-hidden="true" />
          </>
        )}
        <button className="tb-sys-btn" onClick={handleMinimize} aria-label="Minimize">
          <WindowMinimizeIcon />
        </button>
        <button className="tb-sys-btn" onClick={handleMaximize} aria-label="Maximize/Restore">
          <WindowMaximizeIcon />
        </button>
        <button className="tb-sys-btn close" onClick={handleClose} aria-label="Close">
          <WindowCloseIcon />
        </button>
      </div>
    </div>
  )
}

export const TITLEBAR_HEIGHT = 34

export const TITLEBAR_CSS = `
.shell-titlebar {
  height: ${TITLEBAR_HEIGHT}px;
  background: var(--color-bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  border-bottom: 1px solid var(--color-border-subtle);
  -webkit-app-region: drag;
  z-index: 1000;
  flex-shrink: 0;
  position: relative;
}

.titlebar-left {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.tb-toggle-btn {
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  width: 28px;
  height: 28px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.tb-toggle-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.tb-nav-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.tb-nav-btn {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  width: 26px;
  height: 28px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.tb-nav-btn:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.titlebar-center {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
}

.titlebar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

.tb-right-slot {
  display: flex;
  align-items: center;
}

.tb-divider {
  width: 1px;
  height: 18px;
  background: var(--color-border-subtle);
  margin: 0 4px;
}

.tb-sys-btn {
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  width: 42px;
  height: ${TITLEBAR_HEIGHT}px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s;
}

.tb-sys-btn:hover {
  background: var(--color-hover);
}

.tb-sys-btn.close:hover {
  background: var(--color-error);
  color: white;
}
`
