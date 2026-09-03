import { useState } from 'react'
import { Alert, Button, Card, Empty, Skeleton, Space, Tag, Typography, message } from 'antd'
import { DatabaseOutlined, DesktopOutlined, MailOutlined, ScheduleOutlined, TeamOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/PageHeader'
import { StatTile } from '@/components/StatTile'
import { OrganizationFormDrawer } from '@/components/OrganizationFormDrawer'
import { useOrganizationsList, useUpdateOrganization } from '@/api/organizations'
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
import { getOrganizationChecklist } from '@/lib/organizationProfile'
import { getErrorMessage } from '@/api/errors'

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
  const [editingProfile, setEditingProfile] = useState(false)
  const organizations = useOrganizationsList({ sort: 'name', order: 'asc', limit: 200 })
  const organization = organizations.data?.organizations?.find((org) => org.id === organizationId)
  const profile = getOrganizationChecklist(organization)
  const updateOrg = useUpdateOrganization()

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
    action: () => void
    type?: 'warning' | 'info'
  }> = []

  if (profile.missing.length > 0) {
    alerts.push({
      title: 'Complete the organization profile',
      description: profile.missing.join(' • '),
      actionLabel: 'Edit organization',
      action: () => setEditingProfile(true),
      type: 'warning',
    })
  }

  if ((providerSettings.data?.length ?? 0) === 0) {
    alerts.push({
      title: 'No provider credentials configured',
      description:
        "Cloud jobs will rely on this platform's default organization's credentials until this organization has its own provider settings.",
      actionLabel: 'Open AI config',
      action: () => navigate(`/orgs/${organizationId}/ai/provider-settings`),
      type: 'warning',
    })
  }

  if (!embedder.data) {
    alerts.push({
      title: 'No embedder configured',
      description: "Knowledge ingestion and search will fall back to this platform's default organization's embedder, if one exists.",
      actionLabel: 'Open embedder',
      action: () => navigate(`/orgs/${organizationId}/ai/embedder`),
      type: 'info',
    })
  }

  if ((jobs.data?.length ?? 0) > 0 && (devices.data?.length ?? 0) === 0) {
    alerts.push({
      title: 'Automation has jobs but no devices',
      description: 'Device-targeted runs need at least one registered desktop to execute locally.',
      actionLabel: 'Open devices',
      action: () => navigate(`/orgs/${organizationId}/automation/devices`),
      type: 'warning',
    })
  }

  return (
    <div>
      <PageHeader
        description={organization?.description || 'Team management, model providers, knowledge corpora, and automations.'}
        actions={
          <Button
            type="default"
            onClick={() => setEditingProfile(true)}
            style={{ borderRadius: 8 }}
          >
            Edit Organization
          </Button>
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
        <StatTile
          label="Team Members"
          value={memberships.data?.total}
          loading={memberships.isLoading}
          icon={<TeamOutlined />}
          sublabel="Active members"
        />
        <StatTile
          label="Pending Invites"
          value={invitations.data?.total}
          loading={invitations.isLoading}
          icon={<MailOutlined />}
          sublabel="Awaiting accept"
        />
        <StatTile
          label="Automation Jobs"
          value={jobs.data?.length}
          loading={jobs.isLoading}
          icon={<ScheduleOutlined />}
          sublabel="Configured tasks"
        />
        <StatTile
          label="Worker Devices"
          value={devices.data?.length}
          loading={devices.isLoading}
          icon={<DesktopOutlined />}
          sublabel="Registered runners"
        />
        <StatTile
          label="Knowledge Corpora"
          value={corpora.data?.total}
          loading={corpora.isLoading}
          icon={<DatabaseOutlined />}
          sublabel="Vector indexes"
        />
      </div>

      <Card title="Needs Attention" style={{ marginBottom: 24 }}>
        {alerts.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {alerts.map((alert) => (
              <Alert
                key={alert.title}
                type={alert.type ?? 'warning'}
                showIcon
                message={<span style={{ fontWeight: 600 }}>{alert.title}</span>}
                description={
                  <div style={{ marginTop: 4 }}>
                    <div style={{ color: palette.inkSecondary, fontSize: 13, marginBottom: 8 }}>
                      {alert.description}
                    </div>
                    <Button size="small" type="default" onClick={alert.action} style={{ borderRadius: 6 }}>
                      {alert.actionLabel}
                    </Button>
                  </div>
                }
                style={{ borderRadius: 10, height: '100%' }}
              />
            ))}
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="This organization is fully configured and operational."
            style={{ padding: '20px 0' }}
          />
        )}
      </Card>

      <div
        className="organization-overview-detail-grid"
        style={{
          display: 'grid',
          gap: 16,
          alignItems: 'stretch',
        }}
      >
        <Card title="Setup Status">
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <div style={{ padding: '8px 12px', background: 'rgba(30, 28, 26, 0.02)', borderRadius: 8, border: `1px solid ${palette.borderSubtle}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <Typography.Text strong>Profile & Branding</Typography.Text>
                <Tag color={profile.isReady ? 'green' : 'orange'} style={{ margin: 0, borderRadius: 6 }}>
                  {profile.isReady ? 'Complete' : 'Incomplete'}
                </Tag>
              </div>
              <Typography.Text style={{ color: palette.inkSecondary, fontSize: 13 }}>
                {profile.isReady ? 'Profile details configured.' : `Missing: ${profile.missing.join(', ')}`}
              </Typography.Text>
            </div>

            <div style={{ padding: '8px 12px', background: 'rgba(30, 28, 26, 0.02)', borderRadius: 8, border: `1px solid ${palette.borderSubtle}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <Typography.Text strong>AI Credentials</Typography.Text>
                <Tag color={providerSettings.data?.length ? 'green' : 'orange'} style={{ margin: 0, borderRadius: 6 }}>
                  {providerSettings.data?.length ? `${providerSettings.data.length} Configured` : 'Missing'}
                </Tag>
              </div>
              <Typography.Text style={{ color: palette.inkSecondary, fontSize: 13 }}>
                {providerSettings.isLoading
                  ? 'Checking provider settings...'
                  : providerSettings.data?.length
                    ? `${providerSettings.data.length} provider setting(s) active.`
                    : 'No provider setting configured yet.'}
              </Typography.Text>
            </div>

            <div style={{ padding: '8px 12px', background: 'rgba(30, 28, 26, 0.02)', borderRadius: 8, border: `1px solid ${palette.borderSubtle}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <Typography.Text strong>Embedder & Search</Typography.Text>
                <Tag color={embedder.data ? 'green' : 'default'} style={{ margin: 0, borderRadius: 6 }}>
                  {embedder.data ? 'Configured' : 'Inherited'}
                </Tag>
              </div>
              <Typography.Text style={{ color: palette.inkSecondary, fontSize: 13 }}>
                {embedder.isLoading
                  ? 'Checking embedder...'
                  : embedder.data
                    ? `Model: ${presentText(embedder.data.model, 'Configured')}`
                    : 'Using platform default embedder fallback.'}
              </Typography.Text>
            </div>

            <div style={{ padding: '8px 12px', background: 'rgba(30, 28, 26, 0.02)', borderRadius: 8, border: `1px solid ${palette.borderSubtle}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                <Typography.Text strong>Integrations & Apps</Typography.Text>
                <Tag color={(applications.data?.total ?? 0) > 0 ? 'green' : 'default'} style={{ margin: 0, borderRadius: 6 }}>
                  {(applications.data?.total ?? 0) > 0 ? `${applications.data?.total} Connected` : 'None'}
                </Tag>
              </div>
              <Typography.Text style={{ color: palette.inkSecondary, fontSize: 13 }}>
                {applications.isLoading
                  ? 'Checking applications...'
                  : (applications.data?.total ?? 0) > 0
                    ? `${applications.data?.total} application(s) integrated.`
                    : 'No external applications connected yet.'}
              </Typography.Text>
            </div>
          </Space>
        </Card>

        <Card title="Recent Activity" styles={{ body: { padding: 0 } }}>
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

      <OrganizationFormDrawer
        organization={organization ?? null}
        open={editingProfile}
        onClose={() => setEditingProfile(false)}
        onSubmit={(values) => {
          if (!organizationId) return
          updateOrg.mutate(
            { id: organizationId, body: values },
            {
              onSuccess: () => setEditingProfile(false),
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submitting={updateOrg.isPending}
      />
    </div>
  )
}
