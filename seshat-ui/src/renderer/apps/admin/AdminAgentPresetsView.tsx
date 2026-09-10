import { useState } from 'react'
import { Delete, Edit, Plus } from '@icon-park/react'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import {
  useAdminAgentPresets,
  createAdminAgentPreset,
  updateAdminAgentPreset,
  deleteAdminAgentPreset,
  type AgentPresetInput,
} from '@/hooks/useAdminAgentPresets'
import type { OrgAgentPreset } from '@/api/types'

const PERMISSION_MODE_OPTIONS = ['', 'onRequest', 'never', 'auto', 'acceptEdits', 'bypass', 'granular']
const ISOLATION_OPTIONS = ['', 'worktree', 'chroot']

// AdminAgentPresetsView — Admin Console's Agents tab. Deliberately a
// SEPARATE component from the personal Workspace "Agents" view: this
// device's own agents (Settings/Workspace → Agents) stay local, and already
// read this exact same organization catalog read-only as an enrichment (see
// internal/agents.Service.ListOrganizationPresets) - this view is what
// finally lets an org admin create/edit/delete those shared presets from
// the desktop app instead of only from seshat-console. Every write here
// goes to /admin/agent-presets, which seshat-backend forwards straight to
// seshat-server's real agentregistry.AgentPreset store.
export function AdminAgentPresetsView() {
  const { presets, loading, error, refetch } = useAdminAgentPresets()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<OrgAgentPreset | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function handleDelete(preset: OrgAgentPreset) {
    if (deletingId) return
    if (!window.confirm(`Delete ${preset.name || preset.slug}? Devices using this preset will fall back to the built-in registry.`)) return
    setActionError(null)
    setDeletingId(preset.id)
    try {
      await deleteAdminAgentPreset(preset.id)
      await refetch()
    } catch (e: unknown) {
      setActionError((e as { message?: string })?.message ?? 'Failed to delete this agent preset.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="adm-root">
      <header className="adm-header">
        <div>
          <h1>Agents</h1>
        </div>
        <button className="adm-primary-btn" onClick={() => setCreating(true)}>
          <Plus size={12} /> New preset
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
              <th>Preset</th>
              <th>Model</th>
              <th>Mode</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="adm-td-center">Loading…</td></tr>
            ) : presets.length === 0 ? (
              <tr><td colSpan={5} className="adm-td-center adm-muted">No agent presets yet</td></tr>
            ) : presets.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="adm-strong">{p.name || p.slug}</div>
                  <div className="adm-mono adm-muted">{p.slug}</div>
                </td>
                <td>{p.model || <span className="adm-muted">Default</span>}</td>
                <td>
                  <div className="adm-roles">
                    <span className="adm-role-chip">{p.permission_mode || 'default'}</span>
                    <span className="adm-role-chip">{p.isolation || 'default'}</span>
                  </div>
                </td>
                <td>
                  <span className={`adm-status-badge ${p.enabled ? 'adm-ok' : 'adm-inactive'}`}>
                    {p.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                <td>
                  <div className="adm-roles" style={{ justifyContent: 'flex-end' }}>
                    <button className="pv-icon-btn" aria-label="Edit" onClick={() => setEditing(p)}>
                      <Edit size={13} />
                    </button>
                    <button
                      className="pv-icon-btn"
                      aria-label="Delete"
                      onClick={() => handleDelete(p)}
                      disabled={deletingId === p.id}
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

      {creating && (
        <AgentPresetModal
          onClose={() => setCreating(false)}
          onSuccess={() => { setCreating(false); refetch() }}
        />
      )}
      {editing && (
        <AgentPresetModal
          preset={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => { setEditing(null); refetch() }}
        />
      )}
    </div>
  )
}

function toCommaList(values?: string[]): string {
  return (values ?? []).join(', ')
}

function fromCommaList(value: string): string[] | undefined {
  const cleaned = value.split(',').map((v) => v.trim()).filter(Boolean)
  return cleaned.length > 0 ? cleaned : undefined
}

function AgentPresetModal({
  preset,
  onClose,
  onSuccess,
}: {
  preset?: OrgAgentPreset
  onClose: () => void
  onSuccess: () => void
}) {
  const [slug, setSlug] = useState(preset?.slug ?? '')
  const [name, setName] = useState(preset?.name ?? '')
  const [whenToUse, setWhenToUse] = useState(preset?.when_to_use ?? '')
  const [systemPrompt, setSystemPrompt] = useState(preset?.system_prompt ?? '')
  const [model, setModel] = useState(preset?.model ?? '')
  const [tools, setTools] = useState(toCommaList(preset?.tools))
  const [disallowedTools, setDisallowedTools] = useState(toCommaList(preset?.disallowed_tools))
  const [mcpServers, setMcpServers] = useState(toCommaList(preset?.mcp_servers))
  const [maxTurns, setMaxTurns] = useState(preset?.max_turns ? String(preset.max_turns) : '')
  const [permissionMode, setPermissionMode] = useState(preset?.permission_mode ?? '')
  const [isolation, setIsolation] = useState(preset?.isolation ?? '')
  const [icon, setIcon] = useState(preset?.icon ?? '')
  const [enabled, setEnabled] = useState(preset?.enabled !== false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    const body: AgentPresetInput = {
      name: name.trim() || undefined,
      when_to_use: whenToUse.trim() || undefined,
      system_prompt: systemPrompt.trim() || undefined,
      model: model.trim() || undefined,
      tools: fromCommaList(tools),
      disallowed_tools: fromCommaList(disallowedTools),
      mcp_servers: fromCommaList(mcpServers),
      max_turns: maxTurns ? Number(maxTurns) : undefined,
      permission_mode: permissionMode || undefined,
      isolation: isolation || undefined,
      icon: icon.trim() || undefined,
      enabled,
    }
    try {
      if (preset) {
        await updateAdminAgentPreset(preset.id, body)
      } else {
        await createAdminAgentPreset({ ...body, slug: slug.trim() })
      }
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save this agent preset.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-shell">
        <header className="modal-header">
          <h2>{preset ? `Edit ${preset.name || preset.slug}` : 'New agent preset'}</h2>
          <button className="modal-close-btn" onClick={onClose}><WindowCloseIcon size={16} /></button>
        </header>
        <div className="modal-content">
          {!preset && (
            <div className="modal-field" style={{ marginBottom: 20 }}>
              <label>Slug</label>
              <input type="text" placeholder="data-scientist" value={slug} onChange={(e) => setSlug(e.target.value)} autoFocus />
            </div>
          )}
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Name</label>
            <input type="text" placeholder="Data Scientist" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>When to use</label>
            <textarea rows={2} placeholder="For data analysis, statistics, and reporting tasks." value={whenToUse} onChange={(e) => setWhenToUse(e.target.value)} />
          </div>
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>System prompt</label>
            <textarea rows={6} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
          </div>
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Model <span className="modal-label-opt">(optional)</span></label>
            <input type="text" placeholder="anthropic:claude-sonnet-5" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Allowed tools <span className="modal-label-opt">(comma-separated, optional)</span></label>
            <input type="text" placeholder="bash, write, web_search" value={tools} onChange={(e) => setTools(e.target.value)} />
          </div>
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Disallowed tools <span className="modal-label-opt">(comma-separated, optional)</span></label>
            <input type="text" placeholder="git, edit" value={disallowedTools} onChange={(e) => setDisallowedTools(e.target.value)} />
          </div>
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>MCP servers <span className="modal-label-opt">(comma-separated, optional)</span></label>
            <input type="text" placeholder="Org-shared MCP server names" value={mcpServers} onChange={(e) => setMcpServers(e.target.value)} />
          </div>
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Max turns <span className="modal-label-opt">(optional)</span></label>
            <input type="number" min={1} value={maxTurns} onChange={(e) => setMaxTurns(e.target.value)} />
          </div>
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Permission mode</label>
            <select className="adm-role-select adm-role-select--modal" value={permissionMode} onChange={(e) => setPermissionMode(e.target.value)}>
              {PERMISSION_MODE_OPTIONS.map((v) => (
                <option key={v} value={v}>{v || 'Default'}</option>
              ))}
            </select>
          </div>
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Isolation</label>
            <select className="adm-role-select adm-role-select--modal" value={isolation} onChange={(e) => setIsolation(e.target.value)}>
              {ISOLATION_OPTIONS.map((v) => (
                <option key={v} value={v}>{v || 'Default'}</option>
              ))}
            </select>
          </div>
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Icon <span className="modal-label-opt">(optional)</span></label>
            <input type="text" placeholder="🤖" value={icon} onChange={(e) => setIcon(e.target.value)} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Enabled
          </label>

          {error && <div className="modal-error">{error}</div>}
        </div>
        <footer className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-submit"
            disabled={submitting || (!preset && !slug.trim())}
            onClick={handleSubmit}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}
