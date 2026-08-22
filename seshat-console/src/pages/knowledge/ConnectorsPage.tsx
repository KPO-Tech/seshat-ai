import { useEffect, useState } from 'react'
import { Alert, Button, Card, Empty, Form, Input, Modal, Popconfirm, Select, Space, Tag, Typography, message } from 'antd'
import type { TableProps } from 'antd'
import { CloudUploadOutlined, DeleteOutlined, EditOutlined, HistoryOutlined, PlusOutlined, SettingOutlined, SyncOutlined } from '@ant-design/icons'
import {
  useConnectorAccountsList,
  useCreateConnectorAccount,
  useUpdateConnectorAccount,
  useDeleteConnectorAccount,
  useTriggerConnectorSync,
  useConnectorSyncJobs,
  useOAuthAppsList,
  useRegisterOAuthApp,
  useBeginConnectorOAuth,
  type ConnectorAccount,
  type ConnectorAccountInput,
  type ConnectorAccountUpdateInput,
  type ConnectorSyncJob,
  type ConnectorOAuthApp,
  type ConnectorOAuthAppInput,
  type OAuthConnectorKind,
} from '@/api/connectors'
import { useCorporaList } from '@/api/knowledge'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette } from '@/theme/tokens'

const STATUS_COLOR: Record<string, string> = {
  connected: 'success',
  error: 'error',
  disconnected: 'default',
  queued: 'processing',
  running: 'processing',
  completed: 'success',
  failed: 'error',
}

// s3/azureblob connect with static credentials; gdrive/sharepoint connect
// via OAuth (see the OAuth Apps card and OAuthConnectForm below) - the two
// families need different forms, not just different field sets.
const CONNECTOR_KINDS = [
  { value: 's3', label: 'S3-compatible bucket' },
  { value: 'azureblob', label: 'Azure Blob Storage' },
  { value: 'gdrive', label: 'Google Drive' },
  { value: 'sharepoint', label: 'SharePoint' },
  { value: 'onedrive', label: 'OneDrive for Business' },
  { value: 'confluence', label: 'Confluence' },
]

// The OAuth Apps modal is purpose-agnostic (RegisterOAuthApp doesn't care
// whether a kind is knowledge_sync-only or agent_action-only) even though
// this page's own table is knowledge_sync-only (see the accounts filter
// below) - slack/outlook/teams are agent_action-only, self-service-
// connected from Workspace → Connections, never created here, but an org
// admin still needs somewhere to register their client_id/secret once per
// organization, and this modal is that one place for every OAuth-based
// kind regardless of purpose - see connectors.RegisterOAuthApp's doc
// comment. Known UI-label mismatch (this page is titled/scoped as
// Knowledge), not relocated yet - see helps/roadmap.md.
const OAUTH_CONNECTOR_KINDS = ['gdrive', 'sharepoint', 'onedrive', 'confluence', 'slack', 'outlook', 'teams', 'gmail'] as const

// The only two kinds with a static, editable config (see connectors.
// Service.UpdateAccount's own doc comment) - every OAuth-based kind has no
// static config here, only a live token, so there's nothing to edit.
const STATIC_CONFIG_KINDS = new Set(['s3', 'azureblob'])

const OAUTH_APP_LABELS: Record<string, string> = {
  gdrive: 'Google',
  sharepoint: 'Microsoft',
  onedrive: 'Microsoft',
  confluence: 'Atlassian',
  slack: 'Slack',
  outlook: 'Microsoft',
  gmail: 'Google',
  teams: 'Microsoft',
}

export function ConnectorsPage() {
  const organizationId = useScopedOrganizationId()
  const [creating, setCreating] = useState(false)
  const [editingAccount, setEditingAccount] = useState<ConnectorAccount | null>(null)
  const [managingOAuthApps, setManagingOAuthApps] = useState(false)
  const [historyAccount, setHistoryAccount] = useState<ConnectorAccount | null>(null)

  const { data: allAccounts, isLoading, error } = useConnectorAccountsList(organizationId ?? undefined)
  // ListAccounts returns every account regardless of purpose - a member's
  // own agent_action account (self-service, see Workspace → Connections)
  // has no corpus and would show up here as broken (blank corpus, a Sync
  // button that errors). This page is knowledge_sync-only.
  const accounts = (allAccounts ?? []).filter((a) => a.purpose !== 'agent_action')
  const { data: corpora } = useCorporaList(organizationId ?? undefined, { limit: 500 })
  const { data: oauthApps } = useOAuthAppsList(organizationId ?? undefined)
  const createAccount = useCreateConnectorAccount()
  const updateAccount = useUpdateConnectorAccount()
  const deleteAccount = useDeleteConnectorAccount()
  const triggerSync = useTriggerConnectorSync()

  const corpusOptions = (corpora?.corpora ?? []).map((c) => ({ value: c.id!, label: c.name ?? c.id! }))
  const configuredOAuthKinds = new Set<string>((oauthApps ?? []).filter((a) => a.configured && a.kind).map((a) => a.kind!))

  const columns: TableProps<ConnectorAccount>['columns'] = [
    {
      title: 'Name',
      dataIndex: 'display_name',
      key: 'display_name',
      render: (name: string, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{name}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{record.kind?.toUpperCase()}</Typography.Text>
        </div>
      ),
    },
    {
      title: 'Corpus',
      key: 'corpus',
      render: (_, record) => corpusOptions.find((c) => c.value === record.corpus_id)?.label ?? record.corpus_id,
    },
    {
      title: 'Status',
      key: 'status',
      width: 130,
      render: (_, record) =>
        record.status === 'error' ? (
          <Tag color="error" style={{ cursor: record.last_error ? 'pointer' : undefined }} title={record.last_error || undefined}>
            error
          </Tag>
        ) : (
          <Tag color={STATUS_COLOR[record.status ?? '']}>{record.status}</Tag>
        ),
    },
    {
      title: 'Last synced',
      dataIndex: 'last_synced_at',
      key: 'last_synced_at',
      width: 180,
      render: (value: string | undefined) => (value ? new Date(value).toLocaleString() : 'Never'),
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      render: (_, record) => (
        <Space size={4}>
          {record.kind && STATIC_CONFIG_KINDS.has(record.kind) && (
            <Button
              size="small"
              icon={<EditOutlined />}
              title="Edit configuration"
              onClick={() => setEditingAccount(record)}
              aria-label={`Edit ${record.display_name}`}
            />
          )}
          <Button
            size="small"
            icon={<SyncOutlined />}
            loading={triggerSync.isPending}
            title="Sync now"
            onClick={() =>
              triggerSync.mutate(record.id!, {
                onSuccess: () => message.success(`Queued a sync for ${record.display_name}`),
                onError: (error) => message.error(getErrorMessage(error)),
              })
            }
            aria-label={`Sync ${record.display_name} now`}
          />
          <Button
            size="small"
            icon={<HistoryOutlined />}
            title="Sync history"
            onClick={() => setHistoryAccount(record)}
            aria-label={`Sync history for ${record.display_name}`}
          />
          <Popconfirm
            title={`Disconnect ${record.display_name}?`}
            description="Already-ingested files stay in the corpus - only the connection is removed."
            onConfirm={() =>
              deleteAccount.mutate(record.id!, { onError: (error) => message.error(getErrorMessage(error)) })
            }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Disconnect ${record.display_name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Connectors"
        description="External sources synced automatically into a Knowledge corpus."
        actions={
          <Space>
            <Button icon={<SettingOutlined />} onClick={() => setManagingOAuthApps(true)} disabled={!organizationId}>
              OAuth apps
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreating(true)}
              disabled={!organizationId || corpusOptions.length === 0}
            >
              New connector
            </Button>
          </Space>
        }
      />

      {organizationId && corpusOptions.length === 0 && !isLoading && (
        <Alert
          type="info"
          showIcon
          message="Create a corpus first"
          description="A connector syncs into an existing corpus - create one under Knowledge → Corpora before connecting a source."
          style={{ marginBottom: 16 }}
        />
      )}

      <ConsoleTable<ConnectorAccount>
        rowKey="id"
        columns={columns}
        dataSource={accounts ?? []}
        loading={isLoading}
        queryError={error}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={<CloudUploadOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
              description="No connectors yet"
              style={{ padding: '32px 0' }}
            />
          ),
        }}
      />

      <ConnectorFormDrawer
        open={creating || Boolean(editingAccount)}
        editingAccount={editingAccount}
        corpusOptions={corpusOptions}
        configuredOAuthKinds={configuredOAuthKinds}
        organizationId={organizationId ?? undefined}
        onClose={() => {
          setCreating(false)
          setEditingAccount(null)
        }}
        onSubmitStaticAccount={(values) => {
          if (!organizationId) return
          createAccount.mutate(
            { ...values, organization_id: organizationId },
            {
              onSuccess: () => setCreating(false),
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submittingStaticAccount={createAccount.isPending}
        onSubmitUpdate={(values) => {
          if (!editingAccount?.id) return
          updateAccount.mutate(
            { id: editingAccount.id, body: values },
            {
              onSuccess: () => {
                message.success(`Saved ${editingAccount.display_name}`)
                setEditingAccount(null)
              },
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submittingUpdate={updateAccount.isPending}
      />

      <OAuthAppsModal open={managingOAuthApps} organizationId={organizationId ?? undefined} apps={oauthApps ?? []} onClose={() => setManagingOAuthApps(false)} />

      <SyncHistoryModal account={historyAccount} onClose={() => setHistoryAccount(null)} />
    </div>
  )
}

function SyncHistoryModal({ account, onClose }: { account: ConnectorAccount | null; onClose: () => void }) {
  const { data: jobs, error } = useConnectorSyncJobs(account?.id)

  const columns: TableProps<ConnectorSyncJob>['columns'] = [
    { title: 'Status', dataIndex: 'status', key: 'status', width: 110, render: (status: string) => <Tag color={STATUS_COLOR[status]}>{status}</Tag> },
    { title: 'Items synced', dataIndex: 'items_synced', key: 'items_synced', width: 110 },
    { title: 'Attempts', key: 'attempts', width: 100, render: (_, record) => `${record.attempt_count}/${record.max_attempts}` },
    { title: 'Error', dataIndex: 'last_error', key: 'last_error', ellipsis: true, render: (value) => value || 'No error' },
    {
      title: 'When',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (value: string | undefined) => (value ? new Date(value).toLocaleString() : '—'),
    },
  ]

  return (
    <Modal open={Boolean(account)} onCancel={onClose} footer={null} centered width={800} title={`Sync history — ${account?.display_name ?? ''}`}>
      {error && <Alert type="warning" showIcon message="Couldn't load sync history" description={getErrorMessage(error)} style={{ marginBottom: 12 }} />}
      <ConsoleTable<ConnectorSyncJob>
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={jobs ?? []}
        pagination={{ pageSize: 8, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty description="No sync attempts yet" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />
    </Modal>
  )
}

// OAuthAppsModal lets an org admin register the Google/Microsoft OAuth app
// credentials gdrive/sharepoint connectors need, once per organization -
// see connectors.ConnectorOAuthApp's doc comment for why this is separate
// from the per-account connect flow (one app registration serves every
// account an org later connects for that kind).
function OAuthAppsModal({
  open,
  organizationId,
  apps,
  onClose,
}: {
  open: boolean
  organizationId: string | undefined
  apps: ConnectorOAuthApp[]
  onClose: () => void
}) {
  return (
    <Modal open={open} onCancel={onClose} footer={null} centered title="OAuth apps" width={520} destroyOnHidden>
      <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
        Register this organization's own Google/Microsoft OAuth app once per provider - every Drive/SharePoint connector account
        this org connects afterward reuses it.
      </Typography.Paragraph>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {OAUTH_CONNECTOR_KINDS.map((kind) => (
          <OAuthAppCard key={kind} kind={kind} organizationId={organizationId} existing={apps.find((a) => a.kind === kind)} />
        ))}
      </Space>
    </Modal>
  )
}

// Split out from OAuthAppsModal so each card owns its own Form instance -
// calling Form.useForm() once per fixed OAUTH_CONNECTOR_KINDS entry inside
// a .map() would violate the Rules of Hooks (conditional/loop-scoped hook
// calls); a real child component per array item is the correct way to get
// one form per kind.
function OAuthAppCard({
  kind,
  organizationId,
  existing,
}: {
  kind: OAuthConnectorKind
  organizationId: string | undefined
  existing: ConnectorOAuthApp | undefined
}) {
  const registerApp = useRegisterOAuthApp()
  const [form] = Form.useForm<ConnectorOAuthAppInput>()

  return (
    <Card size="small" title={`${OAUTH_APP_LABELS[kind]} (${kind})`}>
      <Form<ConnectorOAuthAppInput>
        form={form}
        layout="vertical"
        initialValues={{ client_id: existing?.client_id ?? '' }}
        onFinish={(values) => {
          if (!organizationId) return
          registerApp.mutate(
            { kind, body: { ...values, organization_id: organizationId } },
            {
              onSuccess: () => message.success(`Saved ${OAUTH_APP_LABELS[kind]} app credentials`),
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
      >
        <Form.Item name="client_id" label="Client ID" rules={[{ required: true, message: 'Required' }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="client_secret"
          label="Client secret"
          extra={existing?.configured ? 'Leave blank to keep the existing secret.' : 'Required to register this app.'}
          rules={[{ required: !existing?.configured, message: 'Required' }]}
        >
          <Input.Password autoComplete="new-password" placeholder={existing?.configured ? 'Unchanged' : undefined} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={registerApp.isPending} size="small">
          Save
        </Button>
        {existing?.configured && (
          <Tag color="success" style={{ marginLeft: 8 }}>
            Configured
          </Tag>
        )}
      </Form>
    </Card>
  )
}

function ConnectorFormDrawer({
  open,
  editingAccount,
  corpusOptions,
  configuredOAuthKinds,
  organizationId,
  onClose,
  onSubmitStaticAccount,
  submittingStaticAccount,
  onSubmitUpdate,
  submittingUpdate,
}: {
  open: boolean
  editingAccount: ConnectorAccount | null
  corpusOptions: { value: string; label: string }[]
  configuredOAuthKinds: Set<string>
  organizationId: string | undefined
  onClose: () => void
  onSubmitStaticAccount: (values: Omit<ConnectorAccountInput, 'organization_id'>) => void
  submittingStaticAccount: boolean
  onSubmitUpdate: (values: ConnectorAccountUpdateInput) => void
  submittingUpdate: boolean
}) {
  const isEditing = Boolean(editingAccount)
  const [kind, setKind] = useState('s3')
  const [form] = Form.useForm<ConnectorAccountInput>()
  const beginOAuth = useBeginConnectorOAuth()

  useEffect(() => {
    if (!open) return
    if (editingAccount) {
      setKind(editingAccount.kind ?? 's3')
      form.resetFields()
      form.setFieldsValue({
        display_name: editingAccount.display_name,
        bucket: editingAccount.bucket,
        region: editingAccount.region,
        endpoint: editingAccount.endpoint,
        prefix: editingAccount.prefix,
        account_name: editingAccount.account_name,
        container: editingAccount.container,
        sync_interval_seconds: editingAccount.sync_interval_seconds ?? 3600,
      })
      return
    }
    setKind('s3')
    form.resetFields()
    form.setFieldsValue({ kind: 's3', sync_interval_seconds: 3600, region: 'us-east-1' })
  }, [open, editingAccount, form])

  const isOAuthKind = !isEditing && OAUTH_CONNECTOR_KINDS.includes(kind as (typeof OAUTH_CONNECTOR_KINDS)[number])
  const oauthConfigured = configuredOAuthKinds.has(kind)

  return (
    <Modal
      title={isEditing ? `Edit ${editingAccount?.display_name}` : 'New connector'}
      open={open}
      onCancel={onClose}
      centered
      destroyOnHidden
      footer={
        isEditing ? (
          <Button type="primary" loading={submittingUpdate} onClick={() => form.submit()}>
            Save
          </Button>
        ) : isOAuthKind ? (
          <Button type="primary" loading={beginOAuth.isPending} disabled={!oauthConfigured} onClick={() => form.submit()}>
            Connect with {OAUTH_APP_LABELS[kind]}
          </Button>
        ) : (
          <Button type="primary" loading={submittingStaticAccount} onClick={() => form.submit()}>
            Connect
          </Button>
        )
      }
    >
      <Form<ConnectorAccountInput>
        form={form}
        layout="vertical"
        onValuesChange={(changed) => {
          if (changed.kind) setKind(changed.kind)
        }}
        onFinish={(values) => {
          if (isEditing) {
            onSubmitUpdate(values)
            return
          }
          if (!isOAuthKind) {
            onSubmitStaticAccount(values)
            return
          }
          if (!organizationId || !values.corpus_id) return
          beginOAuth.mutate(
            {
              kind: kind as OAuthConnectorKind,
              body: {
                organization_id: organizationId,
                corpus_id: values.corpus_id,
                purpose: 'knowledge_sync',
                display_name: values.display_name,
                sync_interval_seconds: values.sync_interval_seconds,
              },
            },
            {
              onSuccess: (authorizationUrl) => {
                window.open(authorizationUrl, '_blank', 'noopener,noreferrer')
                message.info('Complete the connection in the new tab - it will show up here once done.')
                onClose()
              },
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
      >
        {!isEditing && (
          <Form.Item name="kind" label="Kind" rules={[{ required: true }]}>
            <Select options={CONNECTOR_KINDS} />
          </Form.Item>
        )}
        {!isEditing && (
          <Form.Item name="corpus_id" label="Corpus" rules={[{ required: true, message: 'Required' }]} extra="Which corpus this connector syncs documents into.">
            <Select options={corpusOptions} placeholder="Select a corpus" showSearch optionFilterProp="label" />
          </Form.Item>
        )}

        {isOAuthKind && !oauthConfigured && (
          <Alert
            type="warning"
            showIcon
            message={`No ${OAUTH_APP_LABELS[kind]} app registered`}
            description={`Register this organization's ${OAUTH_APP_LABELS[kind]} OAuth app via "OAuth apps" before connecting a ${kind} account.`}
            style={{ marginBottom: 16 }}
          />
        )}

        {isOAuthKind ? (
          <>
            <Form.Item name="display_name" label="Name" extra="Optional - defaults to the connected account's email once connected.">
              <Input placeholder="e.g. Marketing Drive" />
            </Form.Item>
            <Form.Item name="sync_interval_seconds" label="Sync interval (seconds)" extra="How often to check for new/changed files automatically.">
              <Input type="number" min={60} />
            </Form.Item>
          </>
        ) : kind === 'azureblob' ? (
          <>
            <Form.Item name="display_name" label="Name" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="e.g. Vendor Docs Container" />
            </Form.Item>
            <Form.Item name="account_name" label="Storage account name" rules={[{ required: true, message: 'Required' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="container" label="Container" rules={[{ required: true, message: 'Required' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="prefix" label="Prefix" extra="Optional - limit sync to blobs under this path.">
              <Input placeholder="docs/" />
            </Form.Item>
            <Form.Item
              name="account_key"
              label="Account key"
              extra={isEditing ? 'Stored encrypted. Leave blank to keep the existing key.' : 'Stored encrypted. Never shown again after saving.'}
              rules={[{ required: !isEditing, message: 'Required' }]}
            >
              <Input.Password autoComplete="new-password" placeholder={isEditing ? 'Unchanged' : undefined} />
            </Form.Item>
            <Form.Item name="sync_interval_seconds" label="Sync interval (seconds)" extra="How often to check for new/changed files automatically.">
              <Input type="number" min={60} />
            </Form.Item>
          </>
        ) : (
          <>
            <Form.Item name="display_name" label="Name" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="e.g. Vendor Docs Bucket" />
            </Form.Item>
            <Form.Item name="bucket" label="Bucket" rules={[{ required: true, message: 'Required' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="endpoint" label="Endpoint" rules={[{ required: true, message: 'Required' }]} extra="e.g. https://s3.amazonaws.com or a MinIO/R2/B2 endpoint URL.">
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item name="region" label="Region">
              <Input placeholder="us-east-1" />
            </Form.Item>
            <Form.Item name="prefix" label="Prefix" extra="Optional - limit sync to keys under this path.">
              <Input placeholder="docs/" />
            </Form.Item>
            <Form.Item
              name="access_key_id"
              label="Access key ID"
              extra={isEditing ? 'Leave blank to keep the existing key.' : undefined}
              rules={[{ required: !isEditing, message: 'Required' }]}
            >
              <Input autoComplete="off" placeholder={isEditing ? 'Unchanged' : undefined} />
            </Form.Item>
            <Form.Item
              name="secret_access_key"
              label="Secret access key"
              extra={isEditing ? 'Stored encrypted. Leave blank to keep the existing key.' : 'Stored encrypted. Never shown again after saving.'}
              rules={[{ required: !isEditing, message: 'Required' }]}
            >
              <Input.Password autoComplete="new-password" placeholder={isEditing ? 'Unchanged' : undefined} />
            </Form.Item>
            <Form.Item name="sync_interval_seconds" label="Sync interval (seconds)" extra="How often to check for new/changed files automatically.">
              <Input type="number" min={60} />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  )
}
