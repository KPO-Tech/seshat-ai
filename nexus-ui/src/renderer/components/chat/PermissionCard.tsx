import { Terminal, Globe, FileTextOne, Robot, Caution } from '@icon-park/react'
import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import type { PendingPermission } from '@/stores/session'

type Props = {
  sessionId: string
  permission: PendingPermission
}

export function PermissionCard({ sessionId, permission }: Props) {
  const updateAgentState = useSessionStore((s) => s.updateAgentState)

  async function decide(approved: boolean) {
    // Optimistically clear the card so the UI doesn't feel laggy
    updateAgentState(sessionId, { pendingPermission: null })
    try {
      await api.post(`/permissions/${permission.toolUseId}`, { approved, session_id: sessionId })
    } catch {
      // If the request fails the engine will time out via ctx.Done() — nothing to do
    }
  }

  const snippet = extractSnippet(permission)

  return (
    <div className="perm-root">
      <style>{PERMISSION_CSS}</style>

      <div className="perm-icon-wrap">
        <Caution size={18} />
      </div>

      <div className="perm-body">
        <div className="perm-header">
          <span className="perm-tool-icon">{toolIcon(permission.toolName)}</span>
          <span className="perm-tool-name">{toolLabel(permission.toolName)}</span>
          <span className="perm-label">wants to run</span>
        </div>

        {snippet && (
          <div className="perm-snippet">
            <pre className="perm-pre">{snippet}</pre>
          </div>
        )}
      </div>

      <div className="perm-actions">
        <button
          className="perm-btn perm-btn--deny"
          type="button"
          onClick={() => void decide(false)}
        >
          Deny
        </button>
        <button
          className="perm-btn perm-btn--allow"
          type="button"
          onClick={() => void decide(true)}
        >
          Allow
        </button>
      </div>
    </div>
  )
}

function extractSnippet(p: PendingPermission): string {
  if (p.description) return p.description
  const first = Object.values(p.toolInput)[0]
  if (typeof first !== 'string') return JSON.stringify(p.toolInput, null, 2).slice(0, 200)
  return first.slice(0, 300)
}

function toolIcon(name: string) {
  if (name === 'bash')                                 return <Terminal    size={14} />
  if (name === 'web_search' || name === 'web_fetch')   return <Globe       size={14} />
  if (name === 'agent')                                return <Robot       size={14} />
  return <FileTextOne size={14} />
}

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    bash: 'Bash', web_search: 'Web Search', web_fetch: 'Web Fetch',
    agent: 'Agent', read: 'Read', write: 'Write', edit: 'Edit',
    glob: 'Glob', grep: 'Grep',
  }
  return labels[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export const PERMISSION_CSS = `
.perm-root {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: 14px;
  background: rgba(251, 191, 36, 0.05);
  width: 100%;
}

.perm-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.perm-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.perm-header {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.perm-tool-icon {
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
}

.perm-tool-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
}

.perm-label {
  font-size: 13px;
  color: var(--color-text-muted);
}

.perm-snippet {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  overflow: hidden;
}

.perm-pre {
  margin: 0;
  padding: 8px 12px;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
}

.perm-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.perm-btn {
  padding: 6px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
  white-space: nowrap;
}

.perm-btn--allow {
  background: rgba(52, 211, 153, 0.15);
  border-color: rgba(52, 211, 153, 0.3);
  color: #34d399;
}

.perm-btn--allow:hover {
  background: rgba(52, 211, 153, 0.25);
  border-color: rgba(52, 211, 153, 0.5);
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
`
