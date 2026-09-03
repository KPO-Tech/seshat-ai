import { useEffect, useState } from 'react'
import { Delete, Edit, Plus } from '@icon-park/react'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import {
  useAdminMCPServerConfigs,
  createAdminMCPServerConfig,
  updateAdminMCPServerConfig,
  deleteAdminMCPServerConfig,
  type AdminMCPServerConfigInput,
} from '@/hooks/useAdminMCPServerConfigs'
import type { AdminMCPServerConfig } from '@/api/types'

const SERVER_TYPE_OPTIONS = ['stdio', 'http', 'sse', 'websocket']

// connector_kind options - each one has a genuine official MCP server from
// the vendor itself (see helps/roadmap.md's "MCP Server Ledger"). Most
// personalize via OAuth (connectors.oauthConnectorKinds on the seshat-server
// side, bridged through connectors.Service.AccessTokenForUser);
// Stripe/Trello/Airtable personalize via a static API key the employee
// pastes once instead (connectors.staticAgentActionKinds, bridged through
// StaticSecretForUser) - their vendor's own MCP server takes a Bearer key
// directly, no OAuth redirect needed. mcpregistry's injectConnectorToken
// tries both automatically at resolve time, so this list doesn't need to
// say which path a given kind uses.
// OneDrive/Google Sheets/Google Calendar are real but Developer Preview at
// the vendor (not GA, no fixed public URL to pre-fill) - listed anyway,
// same "admin pastes their own" precedent as Salesforce, for an admin with
// preview access. Zendesk is deliberately NOT listed (removed 2026-09-03,
// was a real inconsistency with seshat-console's own list) - unlike the
// three above, it has no MCP server at all, preview or GA; the
// zendesk_create_ticket dataflow node remains the only integration path.
const CONNECTOR_KIND_OPTIONS = [
  { value: '', label: 'None (static config only)' },
  { value: 'gdrive', label: 'Google Drive' },
  { value: 'sharepoint', label: 'SharePoint' },
  { value: 'onedrive', label: 'OneDrive' },
  { value: 'confluence', label: 'Confluence' },
  { value: 'slack', label: 'Slack' },
  { value: 'outlook', label: 'Outlook' },
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'gmail', label: 'Gmail' },
  { value: 'notion', label: 'Notion' },
  { value: 'gsheets', label: 'Google Sheets' },
  { value: 'gcalendar', label: 'Google Calendar' },
  { value: 'jira', label: 'Jira (Atlassian Rovo)' },
  { value: 'github', label: 'GitHub' },
  { value: 'asana', label: 'Asana' },
  { value: 'linear', label: 'Linear' },
  { value: 'hubspot', label: 'HubSpot' },
  { value: 'intercom', label: 'Intercom' },
  { value: 'pipedrive', label: 'Pipedrive' },
  { value: 'salesforce', label: 'Salesforce' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'trello', label: 'Trello' },
  { value: 'airtable', label: 'Airtable' },
]

// Same pre-fill convenience as seshat-console's MCPServersPage.tsx
// (VENDOR_HOSTED_MCP_URL/SELF_HOSTED_MCP_PATH) - picking a connector_kind
// with a known official endpoint fills url + server_type automatically.
// gmail/outlook/teams are self-hosted by this org's own seshat-server
// (internal/mcp/*), a relative path rather than an absolute vendor URL -
// left blank here since there's no fixed origin to prefix it with from the
// desktop app; the admin fills those three in manually.
const VENDOR_HOSTED_MCP_URL: Partial<Record<string, string>> = {
  slack: 'https://mcp.slack.com/mcp',
  notion: 'https://mcp.notion.com/mcp',
  github: 'https://api.githubcopilot.com/mcp/',
  linear: 'https://mcp.linear.app/mcp',
  hubspot: 'https://mcp.hubspot.com',
  jira: 'https://mcp.atlassian.com/v2/mcp',
  asana: 'https://mcp.asana.com/v2/mcp',
  intercom: 'https://mcp.intercom.com/mcp',
  pipedrive: 'https://mcp.pipedrive.ai/mcp',
  stripe: 'https://mcp.stripe.com',
  trello: 'https://mcp.trello.com/v1',
  airtable: 'https://mcp.airtable.com/mcp',
}

// AdminMCPServersView — Admin Console's MCP Servers tab. Every write here
// goes to /admin/mcp-server-configs, which seshat-backend forwards
// straight to seshat-server's real mcpregistry store - the exact same one
// seshat-console's MCPServersPage.tsx edits. A change made here is
// immediately visible there, and vice versa. Table layout, same shape as
// AdminTeamsView.tsx (an open-ended list an admin adds/removes rows from).
export function AdminMCPServersView() {
  const { configs, loading, error, refetch } = useAdminMCPServerConfigs()
  const [editing, setEditing] = useState<AdminMCPServerConfig | 'new' | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (deletingId) return
    setActionError(null)
    setDeletingId(id)
    try {
      await deleteAdminMCPServerConfig(id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to delete this MCP server.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="adm-root">
      <header className="adm-header">
        <div>
          <h1>MCP Servers</h1>
        </div>
        <button className="adm-primary-btn" onClick={() => setEditing('new')}>
          <Plus size={12} /> New MCP server
        </button>
      </header>

      {(error || actionError) && (
        <div className="pv-action-error">
          {error || actionError}
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Server</th>
              <th>Type</th>
              <th>Target</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="adm-td-center">Loading…</td></tr>
            ) : configs.length === 0 ? (
              <tr><td colSpan={4} className="adm-td-center adm-muted">No MCP servers configured yet</td></tr>
            ) : configs.map((config) => (
              <tr key={config.id}>
                <td>
                  <div className="adm-strong">
                    {config.display_name || config.name}
                    {config.connector_kind && <span className="adm-muted"> · 🔗 {config.connector_kind}</span>}
                  </div>
                  <div className="adm-mono adm-muted">{config.name}</div>
                </td>
                <td>{config.server_type}</td>
                <td className="adm-mono adm-muted">
                  {config.server_type === 'stdio' ? [config.command, ...(config.args ?? [])].filter(Boolean).join(' ') : config.url || 'Not configured'}
                </td>
                <td>
                  <div className="adm-roles" style={{ justifyContent: 'flex-end' }}>
                    <button className="pv-icon-btn" title="Edit" onClick={() => setEditing(config)}>
                      <Edit size={13} />
                    </button>
                    <button
                      className="pv-icon-btn"
                      title="Delete"
                      onClick={() => handleDelete(config.id)}
                      disabled={deletingId === config.id}
                    >
                      <Delete size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <MCPServerFormModal
          config={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSuccess={() => { setEditing(null); refetch() }}
        />
      )}
    </div>
  )
}

function MCPServerFormModal({
  config,
  onClose,
  onSuccess,
}: {
  config: AdminMCPServerConfig | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [name, setName] = useState(config?.name ?? '')
  const [displayName, setDisplayName] = useState(config?.display_name ?? '')
  const [serverType, setServerType] = useState(config?.server_type ?? 'http')
  const [command, setCommand] = useState(config?.command ?? '')
  const [argsText, setArgsText] = useState((config?.args ?? []).join('\n'))
  const [url, setUrl] = useState(config?.url ?? '')
  const [timeoutSecs, setTimeoutSecs] = useState(config?.timeout_secs ?? 30)
  const [connectorKind, setConnectorKind] = useState(config?.connector_kind ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setName(config?.name ?? '')
    setDisplayName(config?.display_name ?? '')
    setServerType(config?.server_type ?? 'http')
    setCommand(config?.command ?? '')
    setArgsText((config?.args ?? []).join('\n'))
    setUrl(config?.url ?? '')
    setTimeoutSecs(config?.timeout_secs ?? 30)
    setConnectorKind(config?.connector_kind ?? '')
  }, [config])

  const isStdio = serverType === 'stdio'
  const isRemote = serverType === 'http' || serverType === 'sse' || serverType === 'websocket'

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      const args = argsText.split(/\n|,/).map((a) => a.trim()).filter(Boolean)
      const params: AdminMCPServerConfigInput = {
        display_name: displayName || undefined,
        server_type: serverType,
        command: command || undefined,
        args,
        url: url || undefined,
        timeout_secs: timeoutSecs,
        connector_kind: connectorKind || undefined,
      }
      if (config) {
        await updateAdminMCPServerConfig(config.id, params)
      } else {
        await createAdminMCPServerConfig({ ...params, name })
      }
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save this MCP server.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-shell">
        <header className="modal-header">
          <h2>{config ? `Edit ${config.display_name || config.name}` : 'New MCP server'}</h2>
          <button className="modal-close-btn" onClick={onClose}><WindowCloseIcon size={16} /></button>
        </header>
        <div className="modal-content">
          {!config && (
            <div className="modal-field" style={{ marginBottom: 20 }}>
              <label>Name</label>
              <input type="text" placeholder="internal-jira" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
          )}

          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Display name <span className="modal-label-opt">(optional)</span></label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>

          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Server type</label>
            <select value={serverType} onChange={(e) => setServerType(e.target.value)}>
              {SERVER_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {isStdio && (
            <>
              <div className="modal-field" style={{ marginBottom: 20 }}>
                <label>Command</label>
                <input type="text" placeholder="npx" value={command} onChange={(e) => setCommand(e.target.value)} />
              </div>
              <div className="modal-field" style={{ marginBottom: 20 }}>
                <label>Arguments <span className="modal-label-opt">(one per line)</span></label>
                <textarea rows={3} value={argsText} onChange={(e) => setArgsText(e.target.value)} />
              </div>
            </>
          )}

          {isRemote && (
            <div className="modal-field" style={{ marginBottom: 20 }}>
              <label>URL</label>
              <input type="text" placeholder="https://example.com/mcp" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
          )}

          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Timeout (seconds)</label>
            <input
              type="number"
              min={1}
              value={timeoutSecs}
              onChange={(e) => setTimeoutSecs(Number(e.target.value) || 30)}
            />
          </div>

          <div className="modal-field">
            <label>Bridged account <span className="modal-label-opt">(optional)</span></label>
            <select
              value={connectorKind}
              onChange={(e) => {
                const value = e.target.value
                setConnectorKind(value)
                const vendorURL = VENDOR_HOSTED_MCP_URL[value]
                if (vendorURL && !url) {
                  setUrl(vendorURL)
                  setServerType('http')
                }
              }}
            >
              {CONNECTOR_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="modal-label-opt" style={{ marginTop: 6 }}>
              When set, each member's own connected account (Workspace → Connections) is injected as a Bearer header
              when this server resolves - lets an agent action run under that person's own permissions.
            </p>
          </div>

          {error && <div className="modal-error">{error}</div>}
        </div>
        <footer className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-submit" disabled={submitting || (!config && !name.trim())} onClick={handleSubmit}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}
