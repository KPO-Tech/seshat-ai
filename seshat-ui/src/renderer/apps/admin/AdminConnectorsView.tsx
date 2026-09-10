import { useEffect, useState } from 'react'
import { Edit } from '@icon-park/react'
import {
  siGoogledrive,
  siConfluence,
  siGmail,
  siNotion,
  siGooglesheets,
  siGooglecalendar,
  siJira,
  siGithub,
  siAsana,
  siLinear,
  siHubspot,
  siIntercom,
  siZendesk,
} from 'simple-icons'
import { Windows, Mail, MessageOne, Wechat, CooperativeHandshake, CloudStorage } from '@icon-park/react'
import { OAUTH_CONNECTOR_KINDS, CONNECTOR_KIND_LABELS } from '@seshat/connector-catalog'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import { useAdminConnectorOAuthApps, registerAdminConnectorOAuthApp } from '@/hooks/useAdminConnectorOAuthApps'
import type { ConnectorOAuthApp } from '@/api/types'

// Real vendor logos: simple-icons (CC0-1.0), same source and BrandIcon
// shape already vetted for the Automation node picker (graph/nodeIcons.tsx)
// and seshat-console's ConnectionsPage.tsx. 7 of the 20 OAuth kinds below
// have no entry in that library at all (checked against its real export
// list, not assumed) - SharePoint/OneDrive/Outlook/Teams/Slack (Microsoft's
// own sub-brands, and Slack, are absent) and Pipedrive/Salesforce. Those
// keep a topically-close generic icon instead of a fabricated logo.
function BrandIcon({ icon, size = 20 }: { icon: { path: string; title: string }; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={icon.title}>
      <path d={icon.path} fill="currentColor" />
    </svg>
  )
}

// The kind set and labels come from @seshat/connector-catalog now (single
// source of truth shared with seshat-console) - only the icon choice is
// still made here, since seshat-ui renders via @icon-park/react while
// seshat-console uses @ant-design/icons, two unrelated libraries. The 8
// static kinds (Stripe, SendGrid, ...) have no app to register here at
// all; their one secret is pasted directly by the connecting employee
// (Workspace → Connections), never by an org admin - see
// connectors.oauthConnectorKinds vs staticAgentActionKinds on the
// seshat-server side.
const KIND_ICON: Partial<Record<string, React.ReactNode>> = {
  gdrive: <BrandIcon icon={siGoogledrive} />,
  sharepoint: <Windows size={20} />,
  onedrive: <Windows size={20} />,
  confluence: <BrandIcon icon={siConfluence} />,
  slack: <Wechat size={20} />,
  outlook: <Mail size={20} />,
  teams: <MessageOne size={20} />,
  gmail: <BrandIcon icon={siGmail} />,
  notion: <BrandIcon icon={siNotion} />,
  gsheets: <BrandIcon icon={siGooglesheets} />,
  gcalendar: <BrandIcon icon={siGooglecalendar} />,
  jira: <BrandIcon icon={siJira} />,
  github: <BrandIcon icon={siGithub} />,
  asana: <BrandIcon icon={siAsana} />,
  linear: <BrandIcon icon={siLinear} />,
  hubspot: <BrandIcon icon={siHubspot} />,
  intercom: <BrandIcon icon={siIntercom} />,
  pipedrive: <CooperativeHandshake size={20} />,
  zendesk: <BrandIcon icon={siZendesk} />,
  salesforce: <CloudStorage size={20} />,
}

const OAUTH_KINDS: Array<{ kind: string; label: string; icon: React.ReactNode }> = OAUTH_CONNECTOR_KINDS.map((kind) => ({
  kind,
  label: CONNECTOR_KIND_LABELS[kind],
  icon: KIND_ICON[kind],
}))

// AdminConnectorsView — Admin Console's Connectors tab. Every write here
// goes to /admin/connector-oauth-apps, which seshat-backend forwards
// straight to seshat-server's real connectors.Service store - the exact
// same one seshat-console's ConnectorsPage.tsx "OAuth apps" modal edits. A
// change made here is immediately visible there, and vice versa. Card-grid
// layout, same shape as AdminProvidersView.tsx (a fixed catalog of known
// kinds, each either configured or not) rather than AdminTeamsView.tsx's
// open-ended table (there's no "create a new kind" concept here).
export function AdminConnectorsView() {
  const { apps, loading, error, refetch } = useAdminConnectorOAuthApps()
  const [configuring, setConfiguring] = useState<{ kind: string; label: string } | null>(null)
  const appByKind = new Map(apps.map((a) => [a.kind, a]))

  return (
    <div className="pv-root">
      <header className="pv-header">
        <div className="pv-header-info">
          <h1>Connectors</h1>
          <p>
            Register this organization's own OAuth app once per service - every employee's own "Connect" click in
            Workspace → Connections authenticates against it. Configured here, it's immediately visible and editable
            in Seshat Console too.
          </p>
        </div>
      </header>

      {error && <div className="pv-action-error">{error}</div>}

      {loading ? (
        <div className="pv-models-loading">Loading…</div>
      ) : (
        <div className="pv-list">
          {OAUTH_KINDS.map(({ kind, label, icon }) => {
            const app = appByKind.get(kind)
            return (
              <div key={kind} className="pv-card">
                <div className="pv-card-header pv-card-header--static">
                  <div className="pv-brand">
                    {icon}
                    <div className="pv-meta">
                      <div className="pv-name">{label}</div>
                      <div className="pv-id">{kind}</div>
                    </div>
                  </div>
                  <div className="pv-card-controls">
                    <span className={`pv-status-pill ${app?.configured ? 'connected' : 'disconnected'}`}>
                      {app?.configured ? 'Configured' : 'Not configured'}
                    </span>
                    {app?.configured ? (
                      <button className="pv-icon-btn" aria-label="Edit" onClick={() => setConfiguring({ kind, label })}>
                        <Edit size={13} />
                      </button>
                    ) : (
                      <button className="pv-configure-btn" onClick={() => setConfiguring({ kind, label })}>
                        Configure
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {configuring && (
        <ConnectorOAuthAppModal
          kind={configuring.kind}
          label={configuring.label}
          existing={appByKind.get(configuring.kind)}
          onClose={() => setConfiguring(null)}
          onSuccess={() => { setConfiguring(null); refetch() }}
        />
      )}
    </div>
  )
}

function ConnectorOAuthAppModal({
  kind,
  label,
  existing,
  onClose,
  onSuccess,
}: {
  kind: string
  label: string
  existing?: ConnectorOAuthApp
  onClose: () => void
  onSuccess: () => void
}) {
  const [clientId, setClientId] = useState(existing?.client_id ?? '')
  const [clientSecret, setClientSecret] = useState('')
  const [subdomain, setSubdomain] = useState(existing?.subdomain ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setClientId(existing?.client_id ?? '')
    setSubdomain(existing?.subdomain ?? '')
    setClientSecret('')
  }, [existing])

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      await registerAdminConnectorOAuthApp(kind, {
        client_id: clientId,
        client_secret: clientSecret || undefined,
        subdomain: kind === 'zendesk' ? subdomain : undefined,
      })
      onSuccess()
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Failed to save this connector app.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = clientId.trim() && (existing?.configured || clientSecret.trim()) && (kind !== 'zendesk' || subdomain.trim())

  return (
    <div className="modal-backdrop">
      <div className="modal-shell">
        <header className="modal-header">
          <h2>{existing?.configured ? `Edit ${label}` : `Configure ${label}`}</h2>
          <button className="modal-close-btn" onClick={onClose}><WindowCloseIcon size={16} /></button>
        </header>
        <div className="modal-content">
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Client ID</label>
            <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} autoFocus />
          </div>

          <div className="modal-field" style={{ marginBottom: 20 }}>
            <label>Client secret {!existing?.configured && '*'}</label>
            <input
              type="password"
              placeholder={existing?.configured ? 'Leave empty to keep the current secret' : 'Enter the client secret…'}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>

          {kind === 'zendesk' && (
            <div className="modal-field">
              <label>Zendesk subdomain</label>
              <input
                type="text"
                placeholder="acme"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
              />
              <p className="modal-label-opt" style={{ marginTop: 6 }}>
                Zendesk's own account subdomain, e.g. "acme" for acme.zendesk.com - its OAuth endpoints are hosted
                per-account, unlike every other connector here.
              </p>
            </div>
          )}

          {error && <div className="modal-error">{error}</div>}
        </div>
        <footer className="modal-footer">
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-btn-submit" disabled={submitting || !canSubmit} onClick={handleSubmit}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}
