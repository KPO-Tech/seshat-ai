import { useMemo, useState } from 'react'
import { Alert, Popconfirm, message } from 'antd'
import {
  WindowsOutlined,
  SlackOutlined,
  MailOutlined,
  TeamOutlined,
  NotificationOutlined,
  FunnelPlotOutlined,
  CloudOutlined,
} from '@ant-design/icons'
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
  siStripe,
  siMailgun,
  siTelegram,
  siDiscord,
  siTrello,
  siAirtable,
} from 'simple-icons'
import { useMyConnectorAccountsList, useDeleteMyConnectorAccount } from '@/api/myConnections'
import { useBeginConnectorOAuth, useCreateStaticAgentAccount, type ConnectorAccount, type OAuthConnectorKind, type StaticConnectorKind } from '@/api/connectors'
import { getErrorMessage } from '@/api/errors'
import { useWorkspaceOrganizationStore } from '@/store/workspaceOrganization'

// Real vendor logos: simple-icons (CC0-1.0, public-domain icon path data -
// https://simpleicons.org), same source and same "no .hex fill, tint stays
// under the app's own theming" reasoning already vetted for seshat-ui's
// automation node picker (graph/nodeIcons.tsx). Roughly a third of the
// kinds below have no entry in this library at all - checked against the
// installed package's real exports, not assumed: Microsoft's own product
// sub-brands (SharePoint, OneDrive, Outlook, Teams) and a few SaaS vendors
// (Pipedrive, Salesforce, SendGrid, Postmark) are absent. Those keep an
// existing antd icon instead of a fabricated logo.
function BrandIcon({ icon }: { icon: { path: string; title: string } }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" role="img" aria-label={icon.title} style={{ display: 'inline-block' }}>
      <path d={icon.path} fill="currentColor" />
    </svg>
  )
}

type AnyConnectorKind = OAuthConnectorKind | StaticConnectorKind

const KIND_META: Record<AnyConnectorKind, { label: string; icon: React.ReactNode }> = {
  gdrive: { label: 'Google Drive', icon: <BrandIcon icon={siGoogledrive} /> },
  // SharePoint/OneDrive/Outlook/Teams have no entry in simple-icons -
  // Microsoft's own product sub-brands are absent from that library
  // entirely (verified against its real export list, not assumed) - the
  // Windows/Mail/Team glyphs below are the closest existing antd icons,
  // not fabricated logos.
  sharepoint: { label: 'SharePoint', icon: <WindowsOutlined /> },
  onedrive: { label: 'OneDrive', icon: <WindowsOutlined /> },
  confluence: { label: 'Confluence', icon: <BrandIcon icon={siConfluence} /> },
  slack: { label: 'Slack', icon: <SlackOutlined /> },
  outlook: { label: 'Outlook', icon: <MailOutlined /> },
  teams: { label: 'Microsoft Teams', icon: <TeamOutlined /> },
  gmail: { label: 'Gmail', icon: <BrandIcon icon={siGmail} /> },
  notion: { label: 'Notion', icon: <BrandIcon icon={siNotion} /> },
  gsheets: { label: 'Google Sheets', icon: <BrandIcon icon={siGooglesheets} /> },
  gcalendar: { label: 'Google Calendar', icon: <BrandIcon icon={siGooglecalendar} /> },
  jira: { label: 'Jira', icon: <BrandIcon icon={siJira} /> },
  github: { label: 'GitHub', icon: <BrandIcon icon={siGithub} /> },
  asana: { label: 'Asana', icon: <BrandIcon icon={siAsana} /> },
  linear: { label: 'Linear', icon: <BrandIcon icon={siLinear} /> },
  hubspot: { label: 'HubSpot', icon: <BrandIcon icon={siHubspot} /> },
  intercom: { label: 'Intercom', icon: <BrandIcon icon={siIntercom} /> },
  // Pipedrive/Salesforce also have no simple-icons entry.
  pipedrive: { label: 'Pipedrive', icon: <FunnelPlotOutlined /> },
  zendesk: { label: 'Zendesk', icon: <BrandIcon icon={siZendesk} /> },
  salesforce: { label: 'Salesforce', icon: <CloudOutlined /> },
  stripe: { label: 'Stripe', icon: <BrandIcon icon={siStripe} /> },
  // SendGrid/Postmark have no simple-icons entry.
  sendgrid: { label: 'SendGrid', icon: <MailOutlined /> },
  mailgun: { label: 'Mailgun', icon: <BrandIcon icon={siMailgun} /> },
  postmark: { label: 'Postmark', icon: <NotificationOutlined /> },
  telegram: { label: 'Telegram', icon: <BrandIcon icon={siTelegram} /> },
  discord: { label: 'Discord', icon: <BrandIcon icon={siDiscord} /> },
  trello: { label: 'Trello', icon: <BrandIcon icon={siTrello} /> },
  airtable: { label: 'Airtable', icon: <BrandIcon icon={siAirtable} /> },
}

// STATIC_KIND_SECRETS lists every kind that authenticates with a single
// static secret pasted in-page instead of an OAuth2 redirect - see
// StaticConnectorKind's doc comment (src/api/connectors.ts). Trello's API
// needs both an API key and a token (see TrelloCreateCardNode's doc
// comment) - the connect form asks for both, colon-separated, since this
// connected-account schema stores exactly one secret string.
const STATIC_KIND_SECRETS: Record<StaticConnectorKind, { label: string; placeholder: string }> = {
  stripe: { label: 'Secret key', placeholder: 'sk_live_...' },
  sendgrid: { label: 'API key', placeholder: 'SG....' },
  mailgun: { label: 'API key', placeholder: 'key-...' },
  postmark: { label: 'Server token', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
  telegram: { label: 'Bot token', placeholder: '123456789:AA...' },
  discord: { label: 'Bot token', placeholder: 'Bot token from the Developer Portal' },
  trello: { label: 'API Key:Token', placeholder: 'apikey:apitoken' },
  airtable: { label: 'Personal Access Token', placeholder: 'pat...' },
}

const STATIC_KIND_SET = new Set<AnyConnectorKind>(Object.keys(STATIC_KIND_SECRETS) as StaticConnectorKind[])

// Each brand's real mark color (simple-icons' own .hex where the mark is
// legible on a dark card - Notion and GitHub's actual brand hex is near-
// black, so those two use the app's ink color instead; the 8 kinds with no
// simple-icons entry get a representative color for their real brand
// instead of inheriting the card's plain ink). Matches the approved mockup
// this page was built from (docs/helps/roadmap.md, "Connections page
// redesign") - without this every icon rendered the same flat off-white,
// since BrandIcon's <path> uses currentColor and the card chip never set
// one per kind.
const KIND_COLOR: Record<AnyConnectorKind, string> = {
  gdrive: '#4285F4',
  sharepoint: '#0364B8',
  onedrive: '#0364B8',
  confluence: '#2684FF',
  notion: '#F5F2EC',
  gsheets: '#0F9D58',
  gcalendar: '#4285F4',
  airtable: '#FCB400',
  slack: '#4A154B',
  outlook: '#0078D4',
  teams: '#5059C9',
  gmail: '#EA4335',
  telegram: '#26A5E4',
  discord: '#5865F2',
  jira: '#0052CC',
  github: '#F5F2EC',
  asana: '#F06A6A',
  linear: '#5E6AD2',
  trello: '#0079BF',
  hubspot: '#FF7A59',
  intercom: '#1F8DED',
  pipedrive: '#F17E22',
  zendesk: '#03363D',
  salesforce: '#00A1E0',
  stripe: '#635BFF',
  sendgrid: '#51A9E3',
  mailgun: '#C02128',
  postmark: '#FFD43B',
}

// Grouped the same way a marketplace catalog would be, so a related set of
// services (e.g. every ticketing/CRM tool) is easy to scan together instead
// of hunting through one flat list of 28 - see the approved mockup this
// mirrors (docs/helps/roadmap.md, "Connections page redesign").
const CONNECTOR_CATEGORIES: Array<{ label: string; kinds: AnyConnectorKind[] }> = [
  { label: 'Storage & Files', kinds: ['gdrive', 'sharepoint', 'onedrive'] },
  { label: 'Productivity', kinds: ['confluence', 'notion', 'gsheets', 'gcalendar', 'airtable'] },
  { label: 'Communication', kinds: ['slack', 'outlook', 'teams', 'gmail', 'telegram', 'discord'] },
  { label: 'Project & Issue Tracking', kinds: ['jira', 'github', 'asana', 'linear', 'trello'] },
  { label: 'CRM & Support', kinds: ['hubspot', 'intercom', 'pipedrive', 'zendesk', 'salesforce'] },
  { label: 'Payments & Messaging APIs', kinds: ['stripe', 'sendgrid', 'mailgun', 'postmark'] },
]

const TOTAL_KIND_COUNT = CONNECTOR_CATEGORIES.reduce((sum, category) => sum + category.kinds.length, 0)

export function ConnectionsPage() {
  const organizationId = useWorkspaceOrganizationStore((state) => state.organizationId)
  const { data: accounts, isLoading, error } = useMyConnectorAccountsList(organizationId ?? undefined)
  const [search, setSearch] = useState('')

  const accountByKind = useMemo(() => new Map((accounts ?? []).map((account) => [account.kind as AnyConnectorKind, account])), [accounts])
  const connectedCount = accounts?.filter((account) => account.status === 'connected').length ?? 0
  const query = search.trim().toLowerCase()

  return (
    <div className="wsc-root">
      <div className="wsc-head">
        <div className="wsc-head__copy">
          <h1>Connections</h1>
          <p>Connect your own accounts so the workspace agent can act on your behalf, with your own permissions - separate from any Knowledge source an admin has set up.</p>
        </div>
        <div className="wsc-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input type="text" placeholder="Search connections…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {!organizationId ? (
        <Alert
          type="info"
          showIcon
          message="Select an organization"
          description="Pick an organization from the switcher above to manage your connections."
        />
      ) : (
        <>
          {error && (
            <Alert type="warning" showIcon message="Couldn't load your connections" description={getErrorMessage(error)} style={{ marginBottom: 16 }} />
          )}

          <div className="wsc-summary">
            <div>
              <div className="wsc-summary__num">
                {connectedCount}
                <span> / {TOTAL_KIND_COUNT}</span>
              </div>
              <div className="wsc-summary__label">Connected</div>
            </div>
            <div className="wsc-summary__divider" />
            <div className="wsc-summary__bar">
              <div className="wsc-summary__bar-fill" style={{ width: `${TOTAL_KIND_COUNT ? (connectedCount / TOTAL_KIND_COUNT) * 100 : 0}%` }} />
            </div>
            <div className="wsc-summary__hint">Reconnecting an account never affects anyone else on the team</div>
          </div>

          {CONNECTOR_CATEGORIES.map((category) => {
            const kinds = query ? category.kinds.filter((kind) => KIND_META[kind].label.toLowerCase().includes(query)) : category.kinds
            if (kinds.length === 0) return null
            return (
              <section className="wsc-section" key={category.label}>
                <h2 className="wsc-section__title">
                  {category.label} <span className="wsc-section__count">{kinds.length}</span>
                </h2>
                <div className={`wsc-grid ${isLoading ? 'wsc-grid--loading' : ''}`}>
                  {kinds.map((kind) =>
                    STATIC_KIND_SET.has(kind) ? (
                      <StaticConnectionCard
                        key={kind}
                        kind={kind as StaticConnectorKind}
                        organizationId={organizationId}
                        account={accountByKind.get(kind)}
                      />
                    ) : (
                      <OAuthConnectionCard
                        key={kind}
                        kind={kind as OAuthConnectorKind}
                        organizationId={organizationId}
                        account={accountByKind.get(kind)}
                      />
                    ),
                  )}
                </div>
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}

function ConnectionCardAccount({ account, label }: { account: ConnectorAccount; label: string }) {
  return (
    <div className="wsc-card__account">
      <span className="wsc-card__dot" />
      <span className="wsc-card__account-id">{account.display_name || account.external_account_id || label}</span>
    </div>
  )
}

function DisconnectButton({ onConfirm, disabled }: { onConfirm: () => void; disabled: boolean }) {
  return (
    <Popconfirm
      title="Disconnect this account?"
      description="The workspace agent will no longer be able to act through it."
      onConfirm={onConfirm}
    >
      <button type="button" className="wsc-btn-disconnect" disabled={disabled}>
        Disconnect
      </button>
    </Popconfirm>
  )
}

function OAuthConnectionCard({
  kind,
  organizationId,
  account,
}: {
  kind: OAuthConnectorKind
  organizationId: string
  account: ConnectorAccount | undefined
}) {
  const beginOAuth = useBeginConnectorOAuth()
  const deleteAccount = useDeleteMyConnectorAccount()
  const meta = KIND_META[kind]

  return (
    <div className={`wsc-card ${account ? 'wsc-card--connected' : ''}`}>
      <div className="wsc-card__head">
        <div className="wsc-card__icon" style={{ color: KIND_COLOR[kind] }}>{meta.icon}</div>
        <div className="wsc-card__name">{meta.label}</div>
      </div>
      <div className="wsc-card__body">{account && <ConnectionCardAccount account={account} label={meta.label} />}</div>
      <div className="wsc-card__actions">
        {account ? (
          <DisconnectButton
            disabled={deleteAccount.isPending}
            onConfirm={() => deleteAccount.mutate(account.id!, { onError: (error) => message.error(getErrorMessage(error)) })}
          />
        ) : (
          <button
            type="button"
            className="wsc-btn-connect"
            disabled={beginOAuth.isPending}
            onClick={() =>
              beginOAuth.mutate(
                { kind, body: { organization_id: organizationId, purpose: 'agent_action' } },
                {
                  onSuccess: (authorizationUrl) => {
                    window.open(authorizationUrl, '_blank', 'noopener,noreferrer')
                    message.info('Complete the connection in the new tab - it will show up here once done.')
                  },
                  onError: (error) => message.error(getErrorMessage(error)),
                },
              )
            }
          >
            {beginOAuth.isPending ? 'Connecting…' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  )
}

// The synchronous, no-redirect counterpart to OAuthConnectionCard, for a
// kind that authenticates with a single static secret. The secret input
// stays hidden behind "Connect" until clicked, instead of always showing a
// password box for a service the user hasn't touched yet.
function StaticConnectionCard({
  kind,
  organizationId,
  account,
}: {
  kind: StaticConnectorKind
  organizationId: string
  account: ConnectorAccount | undefined
}) {
  const [connecting, setConnecting] = useState(false)
  const [secret, setSecret] = useState('')
  const createAccount = useCreateStaticAgentAccount()
  const deleteAccount = useDeleteMyConnectorAccount()
  const meta = KIND_META[kind]
  const secretMeta = STATIC_KIND_SECRETS[kind]

  function submit() {
    if (!secret.trim()) return
    createAccount.mutate(
      { kind, body: { organization_id: organizationId, secret: secret.trim() } },
      {
        onSuccess: () => {
          setSecret('')
          setConnecting(false)
          message.success(`${meta.label} connected.`)
        },
        onError: (error) => message.error(getErrorMessage(error)),
      },
    )
  }

  return (
    <div className={`wsc-card ${account ? 'wsc-card--connected' : ''}`}>
      <div className="wsc-card__head">
        <div className="wsc-card__icon" style={{ color: KIND_COLOR[kind] }}>{meta.icon}</div>
        <div className="wsc-card__name">{meta.label}</div>
      </div>
      <div className="wsc-card__body">{account && <ConnectionCardAccount account={account} label={meta.label} />}</div>
      <div className="wsc-card__actions">
        {account ? (
          <DisconnectButton
            disabled={deleteAccount.isPending}
            onConfirm={() => deleteAccount.mutate(account.id!, { onError: (error) => message.error(getErrorMessage(error)) })}
          />
        ) : connecting ? (
          <div className="wsc-secret-form">
            <input
              type="password"
              placeholder={secretMeta.placeholder}
              aria-label={secretMeta.label}
              value={secret}
              autoFocus
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            <button type="button" disabled={!secret.trim() || createAccount.isPending} onClick={submit}>
              {createAccount.isPending ? '…' : 'Add'}
            </button>
          </div>
        ) : (
          <button type="button" className="wsc-btn-connect" onClick={() => setConnecting(true)}>
            Connect
          </button>
        )}
      </div>
    </div>
  )
}
