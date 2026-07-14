import { Alert, Button, Card, Empty, Skeleton, Space, Tag, Typography } from 'antd'
import {
  ApiOutlined,
  DatabaseOutlined,
  DesktopOutlined,
  MailOutlined,
  ScheduleOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { useOrganizationsList, type Organization } from '@/api/organizations'
import { useMembershipsList } from '@/api/memberships'
import { useInvitationsList } from '@/api/invitations'
import { useJobsList } from '@/api/jobs'
import { useDevicesList } from '@/api/devices'
import { useCorporaList } from '@/api/knowledge'
import { useRunsList } from '@/api/runs'
import { useAuditEventsList } from '@/api/auditEvents'
import { useProviderSettingsList } from '@/api/providerSettings'
import { useEmbedderSetting } from '@/api/embedderSettings'
import { useApplicationsList } from '@/api/applications'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette, monoStack } from '@/theme/tokens'
import { presentText } from '@/lib/present'

function timeAgo(iso?: string) {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim().length > 0)
}

function getOrganizationChecklist(organization: Organization | undefined | null) {
  if (!organization) return []

  const checks = []
  if (!hasValue(organization.description)) checks.push('Add a short description')
  if (!hasValue(organization.website_url)) checks.push('Add the organization website')
  if (!hasValue(organization.support_email)) checks.push('Add a support email')
  return checks
}

const STATUS_COLORS: Record<string, string> = {
  queued: 'default',
  claimed: 'blue',
  running: 'processing',
  completed: 'green',
  failed: 'red',
  cancelled: 'default',
}

export function OrganizationOverviewPage() {
  const navigate = useNavigate()
  const organizationId = useScopedOrganizationId()
  const organizations = useOrganizationsList({ sort: 'name', order: 'asc', limit: 200 })
  const organization = organizations.data?.organizations?.find((org) => org.id === organizationId)
  const checklist = getOrganizationChecklist(organization)

  const memberships = useMembershipsList(organizationId ?? undefined, {
    sort: 'created_at',
    order: 'desc',
    limit: 1,
    offset: 0,
  })
  const invitations = useInvitationsList(organizationId ?? undefined, 'pending', {
    sort: 'created_at',
    order: 'desc',
    limit: 1,
    offset: 0,
  })
  const jobs = useJobsList(organizationId ?? undefined)
  const devices = useDevicesList(organizationId ?? undefined)
  const corpora = useCorporaList(organizationId ?? undefined, {
    sort: 'name',
    order: 'asc',
    limit: 1,
    offset: 0,
  })
  const runs = useRunsList(
    organizationId ?? undefined,
    {},
    { sort: 'queued_at', order: 'desc', limit: 6, offset: 0 },
  )
  const auditEvents = useAuditEventsList(
    { organizationId: organizationId ?? undefined },
    { sort: 'created_at', order: 'desc', limit: 6, offset: 0 },
  )
  const providerSettings = useProviderSettingsList(organizationId ?? undefined)
  const embedder = useEmbedderSetting(organizationId ?? undefined)
  const applications = useApplicationsList(organizationId ?? undefined, {
    sort: 'name',
    order: 'asc',
    limit: 1,
    offset: 0,
  })

  if (!organizationId) return null

  const alerts: Array<{
    title: string
    description: string
    actionLabel: string
    actionPath: string
    type?: 'warning' | 'info'
  }> = []

  if (checklist.length > 0) {
    alerts.push({
      title: 'Complete the organization profile',
      description: checklist.join(' • '),
      actionLabel: 'Edit organization',
      actionPath: '/platform/organizations',
      type: 'warning',
    })
  }

  if ((providerSettings.data?.length ?? 0) === 0) {
    alerts.push({
      title: 'No provider credentials configured',
      description: 'Cloud jobs will rely on platform defaults until this organization has its own provider settings.',
      actionLabel: 'Open AI config',
      actionPath: `/orgs/${organizationId}/ai/provider-settings`,
      type: 'warning',
    })
  }

  if (!embedder.data) {
    alerts.push({
      title: 'No embedder configured',
      description: 'Knowledge ingestion and search will fall back to the platform default if one exists.',
      actionLabel: 'Open embedder',
      actionPath: `/orgs/${organizationId}/ai/embedder`,
      type: 'info',
    })
  }

  if ((jobs.data?.length ?? 0) > 0 && (devices.data?.length ?? 0) === 0) {
    alerts.push({
      title: 'Automation has jobs but no devices',
      description: 'Device-targeted runs need at least one registered desktop to execute locally.',
      actionLabel: 'Open devices',
      actionPath: `/orgs/${organizationId}/automation/devices`,
      type: 'warning',
    })
  }

  return (
    <div>
      <PageHeader
        title={organization?.name ?? 'Organization overview'}
        description={organization?.description || 'Team, AI, automation, knowledge, and integrations.'}
        actions={
          <Space>
            <Button onClick={() => navigate('/platform/organizations')}>All organizations</Button>
            <Button onClick={() => navigate(`/orgs/${organizationId}/team/memberships`)}>Manage team</Button>
            <Button type="primary" onClick={() => navigate(`/orgs/${organizationId}/ai/provider-settings`)}>
              Open AI config
            </Button>
          </Space>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatTile label="Team members" value={memberships.data?.total} loading={memberships.isLoading} icon={<TeamOutlined />} />
        <StatTile label="Pending invites" value={invitations.data?.total} loading={invitations.isLoading} icon={<MailOutlined />} />
        <StatTile label="Jobs" value={jobs.data?.length} loading={jobs.isLoading} icon={<ScheduleOutlined />} />
        <StatTile label="Devices" value={devices.data?.length} loading={devices.isLoading} icon={<DesktopOutlined />} />
        <StatTile label="Corpora" value={corpora.data?.total} loading={corpora.isLoading} icon={<DatabaseOutlined />} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginBottom: 24,
          alignItems: 'start',
        }}
      >
        <Card title="Setup status">
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <div>
              <Typography.Text strong style={{ display: 'block' }}>Profile</Typography.Text>
              <Typography.Text style={{ color: palette.inkSecondary }}>
                {checklist.length === 0 ? 'Profile looks complete.' : `Still missing: ${checklist.join(', ')}`}
              </Typography.Text>
            </div>
            <div>
              <Typography.Text strong style={{ display: 'block' }}>AI configuration</Typography.Text>
              <Typography.Text style={{ color: palette.inkSecondary }}>
                {providerSettings.isLoading
                  ? 'Checking provider settings...'
                  : providerSettings.data?.length
                    ? `${providerSettings.data.length} provider setting(s) configured.`
                    : 'No provider setting configured for this organization yet.'}
              </Typography.Text>
            </div>
            <div>
              <Typography.Text strong style={{ display: 'block' }}>Knowledge</Typography.Text>
              <Typography.Text style={{ color: palette.inkSecondary }}>
                {embedder.isLoading
                  ? 'Checking embedder...'
                  : embedder.data
                    ? `Embedder configured: ${presentText(embedder.data.model, 'Configured')}.`
                    : 'No organization-level embedder configured yet.'}
              </Typography.Text>
            </div>
            <div>
              <Typography.Text strong style={{ display: 'block' }}>Integrations</Typography.Text>
              <Typography.Text style={{ color: palette.inkSecondary }}>
                {applications.isLoading
                  ? 'Checking applications...'
                  : `${applications.data?.total ?? 0} application(s) configured.`}
              </Typography.Text>
            </div>
          </Space>
        </Card>

        <Card title="Needs attention">
          {alerts.length > 0 ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {alerts.map((alert) => (
                <Alert
                  key={alert.title}
                  type={alert.type ?? 'warning'}
                  showIcon
                  message={alert.title}
                  description={
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Typography.Text style={{ color: palette.inkSecondary }}>
                        {alert.description}
                      </Typography.Text>
                      <div>
                        <Button size="small" onClick={() => navigate(alert.actionPath)}>
                          {alert.actionLabel}
                        </Button>
                      </div>
                    </Space>
                  }
                />
              ))}
            </Space>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="This organization looks ready to use."
              style={{ padding: '12px 0' }}
            />
          )}
        </Card>

        <Card title="Quick actions">
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <Button block icon={<TeamOutlined />} onClick={() => navigate(`/orgs/${organizationId}/team/memberships`)}>
              Manage team
            </Button>
            <Button block icon={<ApiOutlined />} onClick={() => navigate(`/orgs/${organizationId}/ai/provider-settings`)}>
              Provider settings
            </Button>
            <Button block icon={<DesktopOutlined />} onClick={() => navigate(`/orgs/${organizationId}/automation/devices`)}>
              Devices
            </Button>
            <Button block icon={<ScheduleOutlined />} onClick={() => navigate(`/orgs/${organizationId}/automation/jobs`)}>
              Jobs
            </Button>
            <Button block icon={<DatabaseOutlined />} onClick={() => navigate(`/orgs/${organizationId}/knowledge/corpora`)}>
              Knowledge base
            </Button>
          </Space>
        </Card>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <Card title="Recent activity" styles={{ body: { padding: 0 } }}>
          {auditEvents.isLoading ? (
            <div style={{ padding: 20 }}>
              <Skeleton active paragraph={{ rows: 4 }} />
            </div>
          ) : auditEvents.data?.audit_events?.length ? (
            auditEvents.data.audit_events.map((event, index) => (
              <div
                key={event.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '12px 20px',
                  borderTop: index === 0 ? 'none' : `1px solid ${palette.border}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <Tag color="default" style={{ fontFamily: monoStack, margin: 0, marginBottom: 6 }}>
                    {event.action}
                  </Tag>
                  <Typography.Text style={{ display: 'block', fontSize: 13, color: palette.inkSecondary }}>
                    {event.resource_type}
                    {event.resource_id ? ` · ${event.resource_id}` : ''}
                  </Typography.Text>
                </div>
                <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary, flexShrink: 0 }}>
                  {timeAgo(event.created_at)}
                </Typography.Text>
              </div>
            ))
          ) : (
            <Empty description="No activity yet" style={{ padding: 32 }} />
          )}
        </Card>

        <Card title="Recent runs" styles={{ body: { padding: 0 } }}>
          {runs.isLoading ? (
            <div style={{ padding: 20 }}>
              <Skeleton active paragraph={{ rows: 4 }} />
            </div>
          ) : runs.data?.runs?.length ? (
            runs.data.runs.map((run, index) => (
              <div
                key={run.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '12px 20px',
                  borderTop: index === 0 ? 'none' : `1px solid ${palette.border}`,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <Typography.Text style={{ display: 'block', fontSize: 13, color: palette.inkSecondary }} code>
                    {run.job_id}
                  </Typography.Text>
                  <Typography.Text style={{ display: 'block', fontSize: 12, color: palette.inkTertiary }}>
                    {run.execution_target}
                  </Typography.Text>
                </div>
                <Tag color={STATUS_COLORS[run.status ?? 'queued']}>{run.status}</Tag>
              </div>
            ))
          ) : (
            <Empty description="No runs yet" style={{ padding: 32 }} />
          )}
        </Card>
      </div>
    </div>
  )
}
