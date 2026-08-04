import { useEffect, useRef, useState } from 'react'
import { More, FileTextOne, Share, Folder, Delete, Shield, Robot } from '@icon-park/react'
import { SelectorMenu, SELECTOR_PILL_CSS, type SelectorOption } from '@/components/ui/SelectorPill'
import { IconButton, ICON_BUTTON_CSS } from '@/components/ui/IconButton'
import type { UIPermissionMode } from '@/stores/ui'
import type { AgentState } from '@/stores/session'

type UIExecutionMode = 'execute' | 'plan'

type Props = {
  title?: string
  executionMode?: AgentState['executionMode']
  onExecutionModeChange?: (mode: UIExecutionMode) => void
  monitorOpen?: boolean
  onToggleMonitor?: () => void
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

  return (
    <div className="chat-top-bar" ref={rootRef}>
      <div className="chat-top-left">
        {/* No "Plan Mode" badge here anymore - the mode toggle on the right
            (blue "Plan" pill) already says that; repeating it here was pure
            duplication. Pair programming has no such indicator elsewhere
            yet, so it keeps its badge until it does. */}
        {title && <span className="chat-session-title" title={title}>{title}</span>}
        {executionMode === 'pair_programming' && (
          <div className="chat-mode-badge chat-mode-badge--pair_programming">
            Pair Programming
          </div>
        )}
      </div>
      <div className="chat-top-actions">
        {onExecutionModeChange && (
          <button
            className="chat-auto-btn"
            onClick={() => {
              const current = (executionMode === 'plan' ? 'plan' : 'execute') as UIExecutionMode
              const currentIndex = EXECUTION_CYCLE.indexOf(current)
              const next = EXECUTION_CYCLE[(currentIndex + 1) % EXECUTION_CYCLE.length]
              onExecutionModeChange(next)
            }}
            title={`Mode: ${EXECUTION_LABEL[executionMode === 'plan' ? 'plan' : 'execute']} (click to toggle)`}
            data-mode={executionMode === 'plan' ? 'plan' : 'execute'}
          >
            <span className="chat-auto-dot" />
            <span>{EXECUTION_LABEL[executionMode === 'plan' ? 'plan' : 'execute']}</span>
          </button>
        )}
        {onToggleMonitor && (
          <IconButton
            icon={<Robot size={15} />}
            variant="bordered"
            size={28}
            title="Agent Monitor"
            active={monitorOpen}
            onClick={onToggleMonitor}
          />
        )}
        {(onTogglePermission || onPermissionModeSelect) && (
          <div className="chat-top-selector">
            <IconButton
              icon={<Shield size={15} />}
              variant="bordered"
              size={28}
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
          <div className="chat-top-selector">
            <button
              className="conv-menu-trigger"
              type="button"
              title="More"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <More size={15} />
            </button>
            {menuOpen && (
              <div className="conv-menu">
                {onExport && (
                  <button type="button" onClick={handleExportClick}>
                    <FileTextOne size={13} />
                    <span>Export as Markdown</span>
                  </button>
                )}
                {onShare && (
                  <button type="button" onClick={handleShareClick}>
                    <Share size={13} />
                    <span>{shareLabel}</span>
                  </button>
                )}
                <button type="button" disabled title="Coming soon">
                  <Folder size={13} />
                  <span>Move to a project</span>
                </button>
                {onDelete && (
                  <button type="button" className="danger" onClick={handleDeleteClick}>
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
${SELECTOR_PILL_CSS}
${ICON_BUTTON_CSS}

.chat-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
}

/* Shrinks (and the title inside it truncates, then disappears entirely)
   before ever taking space away from .chat-top-actions on the right - the
   action icons are the one thing that must never get squeezed off a narrow
   window; the session title is the thing that gives way first. */
.chat-top-left {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.chat-top-selector {
  position: relative;
}

.chat-session-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
  min-width: 0;
}

.chat-mode-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-2xs);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px var(--space-4);
  border-radius: var(--radius-full);
  animation: mode-badge-in 0.2s ease;
}

@keyframes mode-badge-in {
  from { opacity: 0; transform: scale(0.88); }
  to   { opacity: 1; transform: scale(1); }
}

.chat-mode-badge--pair_programming {
  background: rgba(139, 92, 246, 0.12);
  border: 1px solid rgba(139, 92, 246, 0.3);
  color: #a78bfa;
}

.chat-mode-badge--pair_programming::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a78bfa;
  animation: mode-dot-pulse 1.8s ease-in-out infinite;
}

@keyframes mode-dot-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}

.chat-top-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  position: relative;
  flex-shrink: 0;
}

.chat-auto-btn {
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  color: var(--color-text-secondary);
  padding: 3px var(--space-4);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-xs);
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.chat-auto-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background 0.15s;
}

.chat-auto-btn[data-mode="execute"] {
  border-color: color-mix(in srgb, var(--color-primary) 32%, transparent);
  color: var(--color-primary);
}

.chat-auto-btn[data-mode="execute"] .chat-auto-dot {
  background: var(--color-primary);
}

.chat-auto-btn[data-mode="plan"] {
  border-color: color-mix(in srgb, #60a5fa 32%, transparent);
  color: #60a5fa;
}

.chat-auto-btn[data-mode="plan"] .chat-auto-dot {
  background: #60a5fa;
}

.conv-menu-trigger {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.conv-menu-trigger:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.conv-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 190px;
  padding: var(--space-3);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-subtle);
  background: var(--color-menu-bg);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  z-index: 30;
}

.conv-menu button {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text);
  border-radius: var(--radius-md);
  padding: 7px var(--space-5);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  font-size: var(--font-size-sm);
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}

.conv-menu button:hover {
  background: var(--color-hover);
}

.conv-menu button.danger {
  color: var(--color-error);
}

.conv-menu button:disabled {
  opacity: 0.5;
  cursor: default;
}

.conv-menu button:disabled:hover {
  background: transparent;
}
`
