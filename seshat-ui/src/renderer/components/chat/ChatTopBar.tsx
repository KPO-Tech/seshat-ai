import { useEffect, useRef, useState } from 'react'
import { More, FileTextOne, Share, Folder, Delete, Shield, Robot, Browser } from '@icon-park/react'
import { SelectorMenu, type SelectorOption } from '@/components/ui/SelectorPill'
import { IconButton } from '@/components/ui/IconButton'
import type { UIPermissionMode } from '@/stores/ui'
import type { AgentState } from '@/stores/session'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

const MENU_BTN_CSS = 'flex w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-[7px] border-0 bg-transparent px-[9px] py-[7px] text-left text-[12px] hover:bg-[var(--color-hover)] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent'

type UIExecutionMode = 'execute' | 'plan'

type Props = {
  title?: string
  executionMode?: AgentState['executionMode']
  onExecutionModeChange?: (mode: UIExecutionMode) => void
  monitorOpen?: boolean
  onToggleMonitor?: () => void
  browserOpen?: boolean
  onToggleBrowser?: () => void
  permissionMode?: UIPermissionMode
  onTogglePermission?: () => void
  onPermissionModeSelect?: (mode: UIPermissionMode) => void
  onExport?: () => void
  onShare?: () => void
  onDelete?: () => void
}

const EXECUTION_CYCLE: UIExecutionMode[] = ['execute', 'plan']
const EXECUTION_LABEL: Record<UIExecutionMode, string> = { execute: 'Execute', plan: 'Plan' }

function permissionModeTitle(mode: UIPermissionMode): string {
  return { onRequest: 'Ask First', auto: 'Smart', bypass: 'Auto' }[mode]
}

function permissionModeColor(mode: UIPermissionMode): 'green' | 'orange' | 'red' {
  if (mode === 'onRequest') return 'green'
  if (mode === 'auto') return 'orange'
  return 'red'
}

// All the session-level controls (mode, permission, agent monitor, the
// "•••" conversation menu) live here in the top-right, per the user's
// explicit layout call — Provider/Model are the only things that moved down
// into ChatInput, next to where the user actually types.
export function ChatTopBar({
  title,
  executionMode = 'execute',
  onExecutionModeChange,
  monitorOpen = false,
  onToggleMonitor,
  browserOpen = false,
  onToggleBrowser,
  permissionMode = 'auto',
  onTogglePermission,
  onPermissionModeSelect,
  onExport,
  onShare,
  onDelete,
}: Props) {
  const [openSelector, setOpenSelector] = useState<'permission' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [shareLabel, setShareLabel] = useState('Share conversation')
  const rootRef = useRef<HTMLDivElement>(null)
  const hasMenu = !!onExport || !!onShare || !!onDelete
  // "Ask First" is retired — only Smart (honors configured deny/ask rules)
  // and Auto (runs everything except explicit deny rules) remain.
  const permissionOptions: SelectorOption[] = [
    { id: 'auto', label: 'Smart' },
    { id: 'bypass', label: 'Auto' },
  ]

  useEffect(() => {
    if (!openSelector && !menuOpen) return
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenSelector(null)
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [openSelector, menuOpen])

  function handlePermissionTrigger() {
    if (onPermissionModeSelect) {
      setOpenSelector((current) => (current === 'permission' ? null : 'permission'))
      return
    }
    onTogglePermission?.()
  }

  function handleExportClick() {
    onExport?.()
    setMenuOpen(false)
  }

  function handleShareClick() {
    onShare?.()
    setShareLabel('Copied')
    setTimeout(() => setShareLabel('Share conversation'), 1200)
    setMenuOpen(false)
  }

  function handleDeleteClick() {
    setMenuOpen(false)
    onDelete?.()
  }

  const modeAttr = executionMode === 'plan' ? 'plan' : 'execute'
  const isPlanMode = modeAttr === 'plan'

  return (
    <div className="flex min-h-[26px] items-center justify-between gap-2.5" ref={rootRef}>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {/* No "Plan Mode" badge here anymore - the mode toggle on the right
            (blue "Plan" pill) already says that; repeating it here was pure
            duplication. Pair programming has no such indicator elsewhere
            yet, so it keeps its badge until it does. */}
        {title && <span className="min-w-0 max-w-[420px] truncate text-[12px] font-[650] text-app-text" title={title}>{title}</span>}
        {executionMode === 'pair_programming' && (
          <div className="inline-flex items-center gap-1 rounded-full border border-[rgba(139,92,246,0.3)] bg-[rgba(139,92,246,0.12)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-[#a78bfa] [animation:mode-badge-in_0.2s_ease] before:size-1.5 before:rounded-full before:bg-[#a78bfa] before:[animation:mode-dot-pulse_1.8s_ease-in-out_infinite] before:content-['']">
            Pair Programming
          </div>
        )}
      </div>
      <div className="relative flex shrink-0 items-center gap-[5px]">
        {onExecutionModeChange && (
          <button
            className={cx(
              'flex h-6 cursor-pointer items-center gap-[5px] rounded-md border px-2 text-[11px] font-semibold transition-[border-color,color] duration-150',
              isPlanMode
                ? 'border-[color-mix(in_srgb,#60a5fa_32%,transparent)] text-[#60a5fa]'
                : 'border-[color-mix(in_srgb,var(--color-primary)_32%,transparent)] text-[var(--color-primary)]',
            )}
            onClick={() => {
              const current = modeAttr as UIExecutionMode
              const currentIndex = EXECUTION_CYCLE.indexOf(current)
              const next = EXECUTION_CYCLE[(currentIndex + 1) % EXECUTION_CYCLE.length]
              onExecutionModeChange(next)
            }}
            data-mode={modeAttr}
          >
            <span className={cx('size-[5px] shrink-0 rounded-full transition-colors duration-150', isPlanMode ? 'bg-[#60a5fa]' : 'bg-[var(--color-primary)]')} />
            <span>{EXECUTION_LABEL[modeAttr]}</span>
          </button>
        )}
        {onToggleMonitor && (
          <IconButton
            icon={<Robot size={13} />}
            variant="bordered"
            size={24}
            title="Agent Monitor"
            active={monitorOpen}
            onClick={onToggleMonitor}
          />
        )}
        {onToggleBrowser && (
          <IconButton
            icon={<Browser size={13} />}
            variant="bordered"
            size={24}
            title="Browser"
            active={browserOpen}
            onClick={onToggleBrowser}
          />
        )}
        {(onTogglePermission || onPermissionModeSelect) && (
          <div className="relative">
            <IconButton
              icon={<Shield size={13} />}
              variant="bordered"
              size={24}
              title={permissionModeTitle(permissionMode)}
              active
              activeColor={permissionModeColor(permissionMode)}
              onClick={handlePermissionTrigger}
            />
            {openSelector === 'permission' && onPermissionModeSelect && (
              <SelectorMenu
                align="right"
                options={permissionOptions}
                selectedId={permissionMode}
                onSelect={(id) => {
                  setOpenSelector(null)
                  onPermissionModeSelect(id as UIPermissionMode)
                }}
              />
            )}
          </div>
        )}
        {hasMenu && (
          <div className="relative">
            <button
              className="flex size-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-app-text-muted transition-[background,color] duration-150 hover:bg-[var(--color-hover)] hover:text-app-text"
              type="button"
              aria-label="More"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <More size={13} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-30 flex min-w-[190px] flex-col gap-0.5 rounded-[9px] border border-app-border-subtle bg-[var(--color-menu-bg)] p-[5px] shadow-[0_14px_32px_rgba(0,0,0,0.22)]">
                {onExport && (
                  <button type="button" className={cx(MENU_BTN_CSS, 'text-app-text')} onClick={handleExportClick}>
                    <FileTextOne size={13} />
                    <span>Export as Markdown</span>
                  </button>
                )}
                {onShare && (
                  <button type="button" className={cx(MENU_BTN_CSS, 'text-app-text')} onClick={handleShareClick}>
                    <Share size={13} />
                    <span>{shareLabel}</span>
                  </button>
                )}
                <button type="button" className={cx(MENU_BTN_CSS, 'text-app-text')} disabled>
                  <Folder size={13} />
                  <span>Move to a project</span>
                </button>
                {onDelete && (
                  <button type="button" className={cx(MENU_BTN_CSS, 'text-app-error')} onClick={handleDeleteClick}>
                    <Delete size={13} />
                    <span>Delete conversation</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export const CHAT_TOP_BAR_CSS = `
`
