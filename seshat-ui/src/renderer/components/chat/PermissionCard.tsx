import { Caution } from '@icon-park/react'
import type { ToolUseBlock } from '@/api/types'
import { useUIStore } from '@/stores/ui'
import { permissionSignature } from '@/lib/permissionSignature'
import { fallbackApprovalDescription, toolIcon, toolLabel } from './tool-block/helpers'

type Props = {
  tool: ToolUseBlock
  onApprove?: (toolUseId: string) => void
  onDeny?: (toolUseId: string) => void
}

// Standalone card for a tool call awaiting user approval — rendered by
// MessageItem in place of ToolBlock for the awaiting_approval status (not
// embedded inside a tool's own expanded card). Calls the existing
// onApprove/onDeny props threaded down from Conversation.tsx's
// handlePermissionDecision (which POSTs to /permissions/{tool_use_id}) —
// does not make its own API call, to avoid a second, divergent approval path.
export function PermissionCard({ tool, onApprove, onDeny }: Props) {
  const rememberApproval = useUIStore((s) => s.rememberApproval)
  const description = tool._approval?.description || fallbackApprovalDescription(tool)
  const snippet = commandSnippet(tool)

  function handleAlwaysAllow() {
    rememberApproval(permissionSignature(tool.name, tool.input))
    onApprove?.(tool.id)
  }

  return (
    <div className="perm-root">
      <style>{PERMISSION_CSS}</style>

      <div className="perm-top">
        <div className="perm-icon-wrap">
          <Caution size={13} />
        </div>
        <div className="perm-copy">
          <div className="perm-title">
            Allow Claude to run <span className="perm-tool">{toolIcon(tool.name)}{toolLabel(tool.name)}</span>?
          </div>
          <div className="perm-desc">{description}</div>
        </div>
      </div>

      {snippet && (
        <div className="perm-snippet">
          <pre className="perm-pre">{snippet}</pre>
        </div>
      )}

      <div className="perm-actions">
        {onDeny && (
          <button className="perm-btn perm-btn--deny" type="button" onClick={() => onDeny(tool.id)}>
            Deny
          </button>
        )}
        {onApprove && (
          <>
            <button className="perm-btn perm-btn--allow-always" type="button" onClick={handleAlwaysAllow}>
              Always allow
            </button>
            <button className="perm-btn perm-btn--allow" type="button" onClick={() => onApprove(tool.id)}>
              Allow once
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function commandSnippet(tool: ToolUseBlock): string {
  if (typeof tool.input.command === 'string' && tool.input.command.trim()) return tool.input.command
  const first = Object.values(tool.input)[0]
  if (typeof first === 'string') return first.slice(0, 400)
  if (Object.keys(tool.input).length === 0) return ''
  return JSON.stringify(tool.input, null, 2).slice(0, 400)
}

export const PERMISSION_CSS = `
.perm-root {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 10px 11px;
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 11px;
  background: rgba(251, 191, 36, 0.05);
  width: 100%;
}

.perm-top {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.perm-icon-wrap {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.perm-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.perm-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.4;
}

.perm-tool {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--color-text);
}

.perm-desc {
  font-size: 11px;
  line-height: 1.5;
  color: var(--color-text-muted);
}

.perm-snippet {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  overflow: hidden;
}

.perm-pre {
  margin: 0;
  padding: 6px 8px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 10px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
}

.perm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.perm-btn {
  padding: 4px 11px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
  white-space: nowrap;
}

.perm-btn--allow {
  background: rgba(var(--color-success-rgb), 0.15);
  border-color: rgba(var(--color-success-rgb), 0.3);
  color: var(--color-success);
}

.perm-btn--allow:hover {
  background: rgba(var(--color-success-rgb), 0.25);
  border-color: rgba(var(--color-success-rgb), 0.5);
}

.perm-btn--deny {
  background: transparent;
  border-color: var(--color-border-subtle);
  color: var(--color-text-muted);
}

.perm-btn--deny:hover {
  background: var(--color-hover);
  color: var(--color-text);
}

.perm-btn--allow-always {
  background: transparent;
  border-color: var(--color-border-subtle);
  color: var(--color-text-muted);
}

.perm-btn--allow-always:hover {
  background: var(--color-hover);
  color: var(--color-text);
}
`
