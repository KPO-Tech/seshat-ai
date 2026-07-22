import { useEffect, useRef, useState } from 'react'
import { Browser, CheckCorrect, Shield, Robot } from '@icon-park/react'
import { SelectorPill, SELECTOR_PILL_CSS } from '@/components/ui/SelectorPill'
import { IconButton, ICON_BUTTON_CSS } from '@/components/ui/IconButton'
import type { UIPermissionMode } from '@/stores/ui'
import type { AgentState } from '@/stores/session'

export type ChatTopBarOption = {
  id: string
  label: string
  disabled?: boolean
}

type Props = {
  providerLabel?: string
  modelLabel?: string
  onProviderClick?: () => void
  onModelClick?: () => void
  providerOptions?: ChatTopBarOption[]
  modelOptions?: ChatTopBarOption[]
  selectedProviderId?: string | null
  selectedModelId?: string | null
  onProviderSelect?: (id: string) => void
  onModelSelect?: (id: string) => void
  providerDisabled?: boolean
  modelDisabled?: boolean
  monitorOpen?: boolean
  onToggleMonitor?: () => void
  permissionMode?: UIPermissionMode
  onTogglePermission?: () => void
  onPermissionModeSelect?: (mode: UIPermissionMode) => void
  executionMode?: AgentState['executionMode']
}

export function ChatTopBar({
  providerLabel = 'Provider',
  modelLabel = 'Model',
  onProviderClick,
  onModelClick,
  providerOptions,
  modelOptions,
  selectedProviderId,
  selectedModelId,
  onProviderSelect,
  onModelSelect,
  providerDisabled = false,
  modelDisabled = false,
  monitorOpen = false,
  onToggleMonitor,
  permissionMode = 'onRequest',
  onTogglePermission,
  onPermissionModeSelect,
  executionMode = 'execute',
}: Props) {
  const [openMenu, setOpenMenu] = useState<'provider' | 'model' | 'permission' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const hasProviderMenu = !!providerOptions?.length && !!onProviderSelect
  const hasModelMenu = !!modelOptions?.length && !!onModelSelect
  const permissionOptions: Array<{ id: UIPermissionMode; label: string; description: string }> = [
    { id: 'onRequest', label: 'Ask First', description: 'Request approval for non-automatic actions.' },
    { id: 'auto', label: 'Auto', description: 'Auto-approve safe actions and ask only when needed.' },
    { id: 'bypass', label: 'Bypass', description: 'Skip permission checks entirely.' },
  ]

  useEffect(() => {
    if (!openMenu) return

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [openMenu])

  function handleProviderTrigger() {
    if (providerDisabled) return
    if (hasProviderMenu) {
      setOpenMenu((current) => (current === 'provider' ? null : 'provider'))
      return
    }
    onProviderClick?.()
  }

  function handleModelTrigger() {
    if (modelDisabled) return
    if (hasModelMenu) {
      setOpenMenu((current) => (current === 'model' ? null : 'model'))
      return
    }
    onModelClick?.()
  }

  function handlePermissionTrigger() {
    if (onPermissionModeSelect) {
      setOpenMenu((current) => (current === 'permission' ? null : 'permission'))
      return
    }
    onTogglePermission?.()
  }

  return (
    <div className="chat-top-bar" ref={rootRef}>
      <div className="chat-top-left">
        <div className="chat-top-selectors">
          <div className="chat-top-selector">
            <SelectorPill
              label={providerLabel}
              icon={<Browser size={14} />}
              onClick={handleProviderTrigger}
              disabled={providerDisabled}
            />
            {openMenu === 'provider' && providerOptions && onProviderSelect && (
              <SelectorMenu
                options={providerOptions}
                selectedId={selectedProviderId}
                onSelect={(id) => {
                  setOpenMenu(null)
                  onProviderSelect(id)
                }}
              />
            )}
          </div>
          <div className="chat-top-selector">
            <SelectorPill
              label={modelLabel}
              icon={<CheckCorrect size={14} />}
              onClick={handleModelTrigger}
              disabled={modelDisabled}
            />
            {openMenu === 'model' && modelOptions && onModelSelect && (
              <SelectorMenu
                options={modelOptions}
                selectedId={selectedModelId}
                onSelect={(id) => {
                  setOpenMenu(null)
                  onModelSelect(id)
                }}
              />
            )}
          </div>
        </div>
        {executionMode !== 'execute' && (
          <div className={`chat-mode-badge chat-mode-badge--${executionMode}`}>
            {executionMode === 'plan' ? 'Plan Mode' : 'Pair Programming'}
          </div>
        )}
      </div>
      <div className="chat-top-actions">
        <IconButton
          icon={<Shield size={18} />}
          variant="bordered"
          size={34}
          title={permissionModeTitle(permissionMode)}
          active
          activeColor={permissionModeColor(permissionMode)}
          onClick={handlePermissionTrigger}
        />
        {openMenu === 'permission' && onPermissionModeSelect && (
          <SelectorMenu
            align="right"
            options={permissionOptions.map((option) => ({
              id: option.id,
              label: option.label,
              description: option.description,
            }))}
            selectedId={permissionMode}
            onSelect={(id) => {
              setOpenMenu(null)
              onPermissionModeSelect(id as UIPermissionMode)
            }}
          />
        )}
        {onToggleMonitor && (
          <IconButton
            icon={<Robot size={18} />}
            variant="bordered"
            size={34}
            title="Agent Monitor"
            active={monitorOpen}
            onClick={onToggleMonitor}
          />
        )}
      </div>
    </div>
  )
}

type SelectorMenuProps = {
  options: Array<ChatTopBarOption & { description?: string }>
  selectedId?: string | null
  onSelect: (id: string) => void
  align?: 'left' | 'right'
}

function SelectorMenu({ options, selectedId, onSelect, align = 'left' }: SelectorMenuProps) {
  return (
    <div className={`chat-top-menu chat-top-menu--${align}`}>
      {options.map((option) => (
        <button
          key={option.id}
          className={`chat-top-menu-item${option.id === selectedId ? ' active' : ''}`}
          disabled={option.disabled}
          onClick={() => !option.disabled && onSelect(option.id)}
          type="button"
        >
          <span className="chat-top-menu-copy">
            <span>{option.label}</span>
            {option.description && (
              <span className="chat-top-menu-description">{option.description}</span>
            )}
          </span>
          {option.id === selectedId && <CheckCorrect size={14} />}
        </button>
      ))}
    </div>
  )
}

function permissionModeTitle(mode: UIPermissionMode): string {
  return {
    onRequest: 'Ask First mode',
    auto: 'Auto mode',
    bypass: 'Bypass mode',
  }[mode]
}

function permissionModeColor(mode: UIPermissionMode): 'green' | 'orange' | 'red' {
  if (mode === 'onRequest') return 'green'
  if (mode === 'auto') return 'orange'
  return 'red'
}

export const CHAT_TOP_BAR_CSS = `
${SELECTOR_PILL_CSS}
${ICON_BUTTON_CSS}

.chat-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chat-top-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chat-top-selectors {
  display: flex;
  gap: 8px;
}

.chat-top-selector {
  position: relative;
}

.chat-mode-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 3px 10px;
  border-radius: 999px;
  animation: mode-badge-in 0.2s ease;
}

@keyframes mode-badge-in {
  from { opacity: 0; transform: scale(0.88); }
  to   { opacity: 1; transform: scale(1); }
}

.chat-mode-badge--plan {
  background: rgba(239, 124, 47, 0.13);
  border: 1px solid rgba(239, 124, 47, 0.35);
  color: var(--color-accent);
}

.chat-mode-badge--plan::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-accent);
  animation: mode-dot-pulse 1.8s ease-in-out infinite;
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

.chat-top-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 220px;
  padding: 8px;
  border-radius: 14px;
  border: 1px solid var(--color-border-subtle);
  background: rgba(44, 42, 49, 0.98);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 30;
}

.chat-top-menu--right {
  left: auto;
  right: 0;
}

.chat-top-menu-item {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.chat-top-menu-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.chat-top-menu-description {
  font-size: 11px;
  line-height: 1.35;
  color: var(--color-text-muted);
  font-weight: 400;
}

.chat-top-menu-item:hover {
  background: var(--color-hover);
}

.chat-top-menu-item.active {
  background: rgba(239, 124, 47, 0.12);
  color: var(--color-accent);
}

.chat-top-menu-item:disabled {
  opacity: 0.6;
  cursor: default;
}

.chat-top-menu-item:disabled:hover {
  background: transparent;
}

.chat-top-actions {
  display: flex;
  gap: 6px;
  position: relative;
}
`
