import { Alert, Button, Card, Popconfirm, Space, Tag, Typography, message } from 'antd'
import { DeleteOutlined, GoogleOutlined, WindowsOutlined, SlackOutlined, MailOutlined, TeamOutlined } from '@ant-design/icons'
import { useMyConnectorAccountsList, useDeleteMyConnectorAccount } from '@/api/myConnections'
import { useBeginConnectorOAuth, type ConnectorAccount, type OAuthConnectorKind } from '@/api/connectors'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { useWorkspaceOrganizationStore } from '@/store/workspaceOrganization'

const OAUTH_CONNECTOR_KINDS: OAuthConnectorKind[] = ['gdrive', 'sharepoint', 'slack', 'outlook', 'teams', 'gmail']

const KIND_META: Record<OAuthConnectorKind, { label: string; icon: React.ReactNode }> = {
  gdrive: { label: 'Google Drive', icon: <GoogleOutlined /> },
  sharepoint: { label: 'SharePoint', icon: <WindowsOutlined /> },
  slack: { label: 'Slack', icon: <SlackOutlined /> },
  outlook: { label: 'Outlook', icon: <MailOutlined /> },
  teams: { label: 'Microsoft Teams', icon: <TeamOutlined /> },
  gmail: { label: 'Gmail', icon: <GoogleOutlined /> },
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
