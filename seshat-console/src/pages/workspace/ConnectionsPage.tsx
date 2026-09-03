import { useState } from 'react'
import { Alert, Button, Card, Input, Popconfirm, Space, Tag, Typography, message } from 'antd'
import {
  DeleteOutlined,
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
import { PageHeader } from '@/components/PageHeader'
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

const OAUTH_CONNECTOR_KINDS: OAuthConnectorKind[] = [
  'gdrive',
  'sharepoint',
  'onedrive',
  'confluence',
  'slack',
  'outlook',
  'teams',
  'gmail',
  'notion',
  'gsheets',
  'gcalendar',
  'jira',
  'github',
  'asana',
  'linear',
  'hubspot',
  'intercom',
  'pipedrive',
  'zendesk',
  'salesforce',
]

const KIND_META: Record<OAuthConnectorKind, { label: string; icon: React.ReactNode }> = {
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
}

// STATIC_CONNECTOR_KINDS lists every kind that authenticates with a single
// static secret pasted in-page instead of an OAuth2 redirect - see
// StaticConnectorKind's doc comment (src/api/connectors.ts).
const STATIC_CONNECTOR_KINDS: StaticConnectorKind[] = ['stripe', 'sendgrid', 'mailgun', 'postmark', 'telegram', 'discord', 'trello', 'airtable']

const STATIC_KIND_META: Record<StaticConnectorKind, { label: string; icon: React.ReactNode; secretLabel: string; secretPlaceholder: string }> = {
  stripe: { label: 'Stripe', icon: <BrandIcon icon={siStripe} />, secretLabel: 'Secret key', secretPlaceholder: 'sk_live_...' },
  // SendGrid/Postmark have no simple-icons entry.
  sendgrid: { label: 'SendGrid', icon: <MailOutlined />, secretLabel: 'API key', secretPlaceholder: 'SG....' },
  mailgun: { label: 'Mailgun', icon: <BrandIcon icon={siMailgun} />, secretLabel: 'API key', secretPlaceholder: 'key-...' },
  postmark: { label: 'Postmark', icon: <NotificationOutlined />, secretLabel: 'Server token', secretPlaceholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
  telegram: { label: 'Telegram', icon: <BrandIcon icon={siTelegram} />, secretLabel: 'Bot token', secretPlaceholder: '123456789:AA...' },
  discord: { label: 'Discord', icon: <BrandIcon icon={siDiscord} />, secretLabel: 'Bot token', secretPlaceholder: 'Bot token from the Developer Portal' },
  // Trello's API needs both an API key and a token (see TrelloCreateCardNode's
  // doc comment) - the connect form asks for both, colon-separated, since
  // this connected-account schema stores exactly one secret string.
  trello: { label: 'Trello', icon: <BrandIcon icon={siTrello} />, secretLabel: 'API Key:Token', secretPlaceholder: 'apikey:apitoken' },
  airtable: { label: 'Airtable', icon: <BrandIcon icon={siAirtable} />, secretLabel: 'Personal Access Token', secretPlaceholder: 'pat...' },
}

export function ConnectionsPage() {
  const organizationId = useWorkspaceOrganizationStore((state) => state.organizationId)
  const { data: accounts, isLoading, error } = useMyConnectorAccountsList(organizationId ?? undefined)

  return (
    <div>
      <PageHeader
        title="Connections"
        description="Connect your own Google Drive or SharePoint account so the workspace agent can act on your behalf, with your own permissions - separate from any Knowledge source an admin has set up."
      />

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
          <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            {OAUTH_CONNECTOR_KINDS.map((kind) => (
              <MyConnectionCard
                key={kind}
                kind={kind}
                organizationId={organizationId}
                loading={isLoading}
                account={(accounts ?? []).find((a) => a.kind === kind)}
              />
            ))}
            {STATIC_CONNECTOR_KINDS.map((kind) => (
              <MyStaticConnectionCard
                key={kind}
                kind={kind}
                organizationId={organizationId}
                loading={isLoading}
                account={(accounts ?? []).find((a) => a.kind === kind)}
              />
            ))}
          </Space>
        </>
      )}
    </div>
  )
}

function MyConnectionCard({
  kind,
  organizationId,
  loading,
  account,
}: {
  kind: OAuthConnectorKind
  organizationId: string
  loading: boolean
  account: ConnectorAccount | undefined
}) {
  const beginOAuth = useBeginConnectorOAuth()
  const deleteAccount = useDeleteMyConnectorAccount()
  const meta = KIND_META[kind]

  return (
    <Card size="small" title={<Space>{meta.icon}{meta.label}</Space>} loading={loading}>
      {account ? (
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{account.display_name || account.external_account_id}</Typography.Text>
            <Tag color={account.status === 'connected' ? 'success' : 'error'}>{account.status}</Tag>
          </Space>
          <Popconfirm
            title="Disconnect this account?"
            description="The workspace agent will no longer be able to act through it."
            onConfirm={() =>
              deleteAccount.mutate(account.id!, { onError: (error) => message.error(getErrorMessage(error)) })
            }
          >
            <Button danger icon={<DeleteOutlined />} loading={deleteAccount.isPending}>
              Disconnect
            </Button>
          </Popconfirm>
        </Space>
      ) : (
        <Button
          type="primary"
          loading={beginOAuth.isPending}
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
          Connect with {meta.label}
        </Button>
      )}
    </Card>
  )
}

// The synchronous, no-redirect counterpart to MyConnectionCard, for a kind
// that authenticates with a single static secret instead of an OAuth2 flow.
// Disconnect reuses useDeleteMyConnectorAccount unchanged - a static
// account is still just a ConnectorAccount row.
function MyStaticConnectionCard({
  kind,
  organizationId,
  loading,
  account,
}: {
  kind: StaticConnectorKind
  organizationId: string
  loading: boolean
  account: ConnectorAccount | undefined
}) {
  const [secret, setSecret] = useState('')
  const createAccount = useCreateStaticAgentAccount()
  const deleteAccount = useDeleteMyConnectorAccount()
  const meta = STATIC_KIND_META[kind]

  return (
    <Card size="small" title={<Space>{meta.icon}{meta.label}</Space>} loading={loading}>
      {account ? (
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{account.display_name || meta.label}</Typography.Text>
            <Tag color={account.status === 'connected' ? 'success' : 'error'}>{account.status}</Tag>
          </Space>
          <Popconfirm
            title="Disconnect this account?"
            description="The workspace agent will no longer be able to act through it."
            onConfirm={() =>
              deleteAccount.mutate(account.id!, { onError: (error) => message.error(getErrorMessage(error)) })
            }
          >
            <Button danger icon={<DeleteOutlined />} loading={deleteAccount.isPending}>
              Disconnect
            </Button>
          </Popconfirm>
        </Space>
      ) : (
        <Space.Compact style={{ width: '100%' }}>
          <Input.Password
            placeholder={meta.secretPlaceholder}
            aria-label={meta.secretLabel}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onPressEnter={() => {
              if (!secret.trim()) return
              createAccount.mutate(
                { kind, body: { organization_id: organizationId, secret: secret.trim() } },
                {
                  onSuccess: () => {
                    setSecret('')
                    message.success(`${meta.label} connected.`)
                  },
                  onError: (error) => message.error(getErrorMessage(error)),
                },
              )
            }}
          />
          <Button
            type="primary"
            loading={createAccount.isPending}
            disabled={!secret.trim()}
            onClick={() =>
              createAccount.mutate(
                { kind, body: { organization_id: organizationId, secret: secret.trim() } },
                {
                  onSuccess: () => {
                    setSecret('')
                    message.success(`${meta.label} connected.`)
                  },
                  onError: (error) => message.error(getErrorMessage(error)),
                },
              )
            }
          >
            Connect
          </Button>
        </Space.Compact>
      )}
    </Card>
  )
}
