import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Home, Left, Right, SunOne, Moon } from '@icon-park/react'
import { NexusLogo } from '@/components/NexusLogo'
import { WindowCloseIcon, WindowMaximizeIcon, WindowMinimizeIcon } from '@/components/ui/WindowControlIcon'
import { useUIStore } from '@/stores/ui'

type Props = {
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
}

const navButtonClass = 'flex h-7 w-[26px] cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent text-app-text-muted transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text'
const systemButtonClass = 'flex h-[34px] w-[42px] cursor-pointer items-center justify-center border-0 bg-transparent text-app-text-secondary transition-colors duration-150 hover:bg-[var(--color-hover)]'

// The app runs frameless (frame: false in main/index.ts) so every screen
// needs its own drag region + minimize/maximize/close.
export function Titlebar({ left, center, right }: Props) {
  const navigate = useNavigate()
  const handleMinimize = () => window.nexus.window.minimize()
  const handleMaximize = () => window.nexus.window.maximize()
  const handleClose = () => window.nexus.window.close()
  const handleBack = () => navigate(-1)
  const handleForward = () => navigate(1)
  const handleHome = () => navigate('/')

  return (
    <div className="relative z-[1000] flex h-[34px] shrink-0 items-center justify-between border-b border-app-border-subtle bg-app-bg px-2 [-webkit-app-region:drag]">
      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        {left}
        <div className="flex items-center gap-0.5" aria-label="Navigation">
          <button className={navButtonClass} onClick={handleHome} aria-label="Home" type="button">
            <Home size={14} />
          </button>
          <button className={navButtonClass} onClick={handleBack} aria-label="Back" type="button">
            <Left size={14} />
          </button>
          <button className={navButtonClass} onClick={handleForward} aria-label="Forward" type="button">
            <Right size={14} />
          </button>
        </div>
      </div>

      {center && (
        <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 text-[11px] font-semibold tracking-[0.02em] text-app-text-muted">
          <NexusLogo size={14} />
          <span>{center}</span>
        </div>
      )}

      <div className="flex items-center gap-1 [-webkit-app-region:no-drag]">
        {right && (
          <>
            <div className="flex items-center">{right}</div>
            <div className="mx-1 h-[18px] w-px bg-app-border-subtle" aria-hidden="true" />
          </>
        )}
        <button className={systemButtonClass} onClick={handleMinimize} aria-label="Minimize" type="button">
          <WindowMinimizeIcon />
        </button>
        <button className={systemButtonClass} onClick={handleMaximize} aria-label="Maximize/Restore" type="button">
          <WindowMaximizeIcon />
        </button>
        <button className={`${systemButtonClass} hover:bg-app-error hover:text-white`} onClick={handleClose} aria-label="Close" type="button">
          <WindowCloseIcon />
        </button>
      </div>
    </div>
  )
}

export function ThemeToggleButton() {
  const theme = useUIStore((s) => s.theme)
  const toggleTheme = useUIStore((s) => s.toggleTheme)
  return (
    <button
      type="button"
      className="flex size-7 cursor-pointer items-center justify-center rounded-[5px] border-0 bg-transparent text-app-text-secondary transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? <SunOne size={14} /> : <Moon size={14} />}
    </button>
  )
}

export const TITLEBAR_HEIGHT = 34
