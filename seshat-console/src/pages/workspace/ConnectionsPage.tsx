import { useState } from 'react'
import { Alert, Button, Card, Input, Popconfirm, Space, Tag, Typography, message } from 'antd'
import { DeleteOutlined, GoogleOutlined, WindowsOutlined, SlackOutlined, MailOutlined, TeamOutlined, BookOutlined, FileTextOutlined, DollarOutlined, TableOutlined, CalendarOutlined, ProjectOutlined } from '@ant-design/icons'
import { useMyConnectorAccountsList, useDeleteMyConnectorAccount } from '@/api/myConnections'
import { useBeginConnectorOAuth, useCreateStaticAgentAccount, type ConnectorAccount, type OAuthConnectorKind, type StaticConnectorKind } from '@/api/connectors'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { useWorkspaceOrganizationStore } from '@/store/workspaceOrganization'

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
]

const KIND_META: Record<OAuthConnectorKind, { label: string; icon: React.ReactNode }> = {
  gdrive: { label: 'Google Drive', icon: <GoogleOutlined /> },
  sharepoint: { label: 'SharePoint', icon: <WindowsOutlined /> },
  onedrive: { label: 'OneDrive', icon: <WindowsOutlined /> },
  confluence: { label: 'Confluence', icon: <BookOutlined /> },
  slack: { label: 'Slack', icon: <SlackOutlined /> },
  outlook: { label: 'Outlook', icon: <MailOutlined /> },
  teams: { label: 'Microsoft Teams', icon: <TeamOutlined /> },
  gmail: { label: 'Gmail', icon: <GoogleOutlined /> },
  // No Notion/Sheets/Calendar/Jira-branded glyph in @ant-design/icons - a
  // semantically-close generic icon stands in as a placeholder until one is
  // worth adding as a custom asset, same call made for Notion.
  notion: { label: 'Notion', icon: <FileTextOutlined /> },
  gsheets: { label: 'Google Sheets', icon: <TableOutlined /> },
  gcalendar: { label: 'Google Calendar', icon: <CalendarOutlined /> },
  jira: { label: 'Jira', icon: <ProjectOutlined /> },
}

// STATIC_CONNECTOR_KINDS lists every kind that authenticates with a single
// static secret pasted in-page instead of an OAuth2 redirect - see
// StaticConnectorKind's doc comment (src/api/connectors.ts).
const STATIC_CONNECTOR_KINDS: StaticConnectorKind[] = ['stripe']

const STATIC_KIND_META: Record<StaticConnectorKind, { label: string; icon: React.ReactNode; secretLabel: string; secretPlaceholder: string }> = {
  stripe: { label: 'Stripe', icon: <DollarOutlined />, secretLabel: 'Secret key', secretPlaceholder: 'sk_live_...' },
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
