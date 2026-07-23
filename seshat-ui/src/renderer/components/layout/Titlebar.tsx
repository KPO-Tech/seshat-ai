import type { ReactNode } from 'react'
import { Close, Minus, Square } from '@icon-park/react'

type Props = {
  left?: ReactNode
  center?: ReactNode
}

// The app runs frameless (frame: false in main/index.ts) so every screen
// needs its own drag region + minimize/maximize/close — there's no OS
// titlebar to fall back on. Shared here so screens rendered outside Shell's
// route tree (Login, Register — see router/index.tsx, they're top-level
// routes, not Shell children) aren't left without any way to move or close
// the window.
export function Titlebar({ left, center }: Props) {
  const handleMinimize = () => window.nexus.window.minimize()
  const handleMaximize = () => window.nexus.window.maximize()
  const handleClose = () => window.nexus.window.close()

  return (
    <div className="shell-titlebar">
      <style>{TITLEBAR_CSS}</style>
      <div className="titlebar-left">{left}</div>
      {center && <div className="titlebar-center">{center}</div>}
      <div className="titlebar-right">
        <button className="tb-sys-btn" onClick={handleMinimize} title="Minimize">
          <Minus size={11} />
        </button>
        <button className="tb-sys-btn" onClick={handleMaximize} title="Maximize/Restore">
          <Square size={10} />
        </button>
        <button className="tb-sys-btn close" onClick={handleClose} title="Close">
          <Close size={11} />
        </button>
      </div>
    </div>
  )
}

export const TITLEBAR_HEIGHT = 42

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
  -webkit-app-region: no-drag;
}

.tb-toggle-btn {
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  width: 32px;
  height: 32px;
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

.titlebar-center {
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
  -webkit-app-region: no-drag;
}

.tb-sys-btn {
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  width: 42px;
  height: 42px;
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
