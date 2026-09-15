import { useEffect, useState, type CSSProperties } from 'react'
import { getEffectiveTheme, getStoredTheme, toggleStoredTheme, type EffectiveTheme } from '@renderer/lib/theme'

const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties & { WebkitAppRegion: string }
const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties & { WebkitAppRegion: string }

const navButtonClass = 'flex size-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'
const controlClass = 'flex h-10 w-11 items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]'

type Props = {
  center?: string
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
  onHome?: () => void
  onBack?: () => void
  onForward?: () => void
}

export function Titlebar({ center = 'SeshatOS', sidebarOpen = true, onToggleSidebar, onHome, onBack, onForward }: Props) {
  return (
    <div
      className="relative z-50 flex h-10 shrink-0 items-center justify-between border-b border-[var(--border-soft)] bg-[var(--surface-root)]"
      style={dragStyle}
    >
      <div className="flex items-center gap-1 px-3" style={noDragStyle}>
        <button
          type="button"
          className={navButtonClass}
          style={noDragStyle}
          aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          onClick={onToggleSidebar}
        >
          <SidebarIcon open={sidebarOpen} />
        </button>
        <button type="button" className={navButtonClass} style={noDragStyle} aria-label="Home" onClick={onHome}>
          <HomeIcon />
        </button>
        <button type="button" className={navButtonClass} style={noDragStyle} aria-label="Back" onClick={onBack}>
          <BackIcon />
        </button>
        <button type="button" className={navButtonClass} style={noDragStyle} aria-label="Forward" onClick={onForward}>
          <ForwardIcon />
        </button>
        <ThemeToggle />
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[13px] font-semibold text-[var(--text-secondary)]">
        {center}
      </div>

      <div className="flex" style={noDragStyle}>
        <button type="button" className={controlClass} style={noDragStyle} aria-label="Minimize" onClick={() => void window.nexus?.window.minimize()}>
          <MinimizeIcon size={18} />
        </button>
        <button type="button" className={controlClass} style={noDragStyle} aria-label="Maximize or restore" onClick={() => void window.nexus?.window.maximize()}>
          <MaximizeIcon size={17} />
        </button>
        <button type="button" className={`${controlClass} hover:bg-[var(--accent-danger)] hover:text-white`} style={noDragStyle} aria-label="Close" onClick={() => void window.nexus?.window.close()}>
          <CloseIcon size={18} />
        </button>
      </div>
    </div>
  )
}

function ThemeToggle() {
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() => getEffectiveTheme())

  useEffect(() => {
    const sync = () => setEffectiveTheme(getEffectiveTheme(getStoredTheme()))
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    window.addEventListener('seshat-theme-change', sync)
    media.addEventListener('change', sync)
    return () => {
      window.removeEventListener('seshat-theme-change', sync)
      media.removeEventListener('change', sync)
    }
  }, [])

  const nextLabel = effectiveTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      className={navButtonClass}
      style={noDragStyle}
      aria-label={nextLabel}
      title={nextLabel}
      onClick={() => {
        const nextTheme = toggleStoredTheme()
        setEffectiveTheme(getEffectiveTheme(nextTheme))
      }}
    >
      <ThemeIcon theme={effectiveTheme} />
    </button>
  )
}

function SidebarIcon({ open }: { open: boolean }) {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M8 3v14" />
      {!open && <path d="m12 8 2 2-2 2" />}
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 9 7-6 7 6" />
      <path d="M5 8.5V17h10V8.5" />
      <path d="M8.5 17v-5h3v5" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 5-5 5 5 5" />
    </svg>
  )
}

function ForwardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m8 5 5 5-5 5" />
    </svg>
  )
}

function ThemeIcon({ theme }: { theme: EffectiveTheme }) {
  if (theme === 'dark') {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 2.5v2" />
        <path d="M10 15.5v2" />
        <path d="M4.7 4.7 6.1 6.1" />
        <path d="M13.9 13.9 15.3 15.3" />
        <path d="M2.5 10h2" />
        <path d="M15.5 10h2" />
        <path d="M4.7 15.3 6.1 13.9" />
        <path d="M13.9 6.1 15.3 4.7" />
        <circle cx="10" cy="10" r="2.7" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15.7 12.3A6 6 0 0 1 7.7 4.3 6.6 6.6 0 1 0 15.7 12.3Z" />
    </svg>
  )
}

function MinimizeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M4 11.5h8" />
    </svg>
  )
}

function MaximizeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" />
    </svg>
  )
}

function CloseIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M5 5 11 11" />
      <path d="M11 5 5 11" />
    </svg>
  )
}
