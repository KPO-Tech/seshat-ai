import { useState } from 'react'
import { Avatar, Button, Card, Empty, Input, message, Popconfirm, Popover, Space, Switch, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import {
  ApartmentOutlined,
  CrownOutlined,
  DeleteOutlined,
  EditOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RightOutlined,
  ShareAltOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import {
  useOrganizationsList,
  useCreateOrganization,
  useUpdateOrganization,
  useDeleteOrganization,
  useSetOrganizationDefault,
  useSetOrganizationActive,
  useSetOrganizationSharedDomains,
  type Organization,
} from '@/api/organizations'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { StatTile } from '@/components/StatTile'
import { OrganizationFormDrawer } from '@/components/OrganizationFormDrawer'
import { presentDateTime, presentText } from '@/lib/present'
import { getOrganizationChecklist } from '@/lib/organizationProfile'
import { palette } from '@/theme/tokens'

const PAGE_SIZE = 20

export function OrganizationsPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ field: string; order: 'asc' | 'desc' }>({
    field: 'name',
    order: 'asc',
  })
  const [editing, setEditing] = useState<Organization | 'new' | null>(null)

  const { data, isLoading, isFetching } = useOrganizationsList({
    q: search || undefined,
    sort: sort.field,
    order: sort.order,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  const createOrg = useCreateOrganization()
  const updateOrg = useUpdateOrganization()
  const deleteOrg = useDeleteOrganization()
  const setDefault = useSetOrganizationDefault()
  const setActive = useSetOrganizationActive()
  const setSharedDomains = useSetOrganizationSharedDomains()

  const organizations = data?.organizations ?? []
  const defaultOrg = organizations.find((org) => org.is_default)
  const inactiveCount = organizations.filter((org) => org.is_active === false).length
  const organizationsNeedingAttention = organizations.filter((org) => !getOrganizationChecklist(org).isReady).length

  const handleTableChange: TableProps<Organization>['onChange'] = (_pagination, _filters, sorter) => {
    const single = Array.isArray(sorter) ? sorter[0] : sorter
    if (single?.field && single.order) {
      setSort({
        field: String(single.field),
        order: single.order === 'ascend' ? 'asc' : 'desc',
      })
    }
  }

  const columns: TableProps<Organization>['columns'] = [
    {
      title: 'Organization',
      dataIndex: 'name',
      key: 'name',
      sorter: true,
      render: (name: string, record) => {
        const profile = getOrganizationChecklist(record)
        return (
          <Space align="start" size={12}>
            <Avatar
              size={32}
              style={{ background: palette.accentSoft, color: palette.accent, fontWeight: 700, fontSize: 12 }}
            >
              {name?.slice(0, 2).toUpperCase()}
            </Avatar>
            <div style={{ minWidth: 0 }}>
              <Typography.Text strong style={{ display: 'block' }}>
                {name}
              </Typography.Text>
              <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>
                /{record.slug}
              </Typography.Text>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Tag color={profile.isReady ? 'green' : 'orange'} style={{ margin: 0 }}>
                  {profile.isReady ? 'Ready' : `${profile.completionCount}/3 complete`}
                </Tag>
                {record.is_default && (
                  <Tag color="gold" icon={<CrownOutlined />} style={{ margin: 0 }}>
                    Default
                  </Tag>
                )}
                {record.is_active === false && (
                  <Tag color="red" style={{ margin: 0 }}>
                    Inactive
                  </Tag>
                )}
              </div>
            </div>
          </Space>
        )
      },
    },
    {
      title: 'Details',
      key: 'details',
      render: (_, record) => (
        <div style={{ minWidth: 240 }}>
          <Typography.Text style={{ display: 'block', color: palette.inkSecondary }}>
            {presentText(record.description, 'No description yet')}
          </Typography.Text>
          <Typography.Text style={{ display: 'block', marginTop: 6, fontSize: 12, color: palette.inkTertiary }}>
            Updated {presentDateTime(record.updated_at, 'Unknown')}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Contact',
      key: 'contact',
      render: (_, record) => (
        <div>
          <Typography.Text style={{ display: 'block', color: palette.inkSecondary }}>
            {presentText(record.support_email, 'No support email')}
          </Typography.Text>
          <Typography.Text style={{ display: 'block', marginTop: 6, fontSize: 12, color: palette.inkTertiary }}>
            {presentText(record.website_url, 'No website')}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 260,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/orgs/${record.id}/overview`)} icon={<RightOutlined />}>
            Open
          </Button>
          <Popconfirm
            title={record.is_default ? `Remove ${record.name} as the platform default?` : `Set ${record.name} as the platform default?`}
            description={
              record.is_default
                ? "No organization will be flagged as the platform default afterwards - organizations with no config of their own will resolve nothing until a new default is set."
                : "This replaces the current default organization (if any). AI provider/embedder resolution for every org with no config of its own will use this org's settings."
            }
            onConfirm={(event) => {
              event?.stopPropagation()
              setDefault.mutate(
                { id: record.id!, isDefault: !record.is_default },
                { onError: (error) => message.error(getErrorMessage(error)) },
              )
            }}
          >
            <Button
              size="small"
              type={record.is_default ? 'primary' : 'default'}
              icon={<CrownOutlined />}
              onClick={(event) => event.stopPropagation()}
              aria-label={record.is_default ? `Remove ${record.name} as default` : `Set ${record.name} as default`}
            />
          </Popconfirm>
          {record.is_default && (
            <Popover
              trigger="click"
              placement="bottomRight"
              title="Shared with every organization"
              content={
                <div onClick={(event) => event.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 260 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    Only matters while this org is the platform default. Turn off whatever shouldn't be shared with
                    every other organization.
                  </Typography.Text>
                  {(
                    [
                      { key: 'share_provider_settings', label: 'LLM provider settings' },
                      { key: 'share_embedder_settings', label: 'Embedder settings' },
                      { key: 'share_web_search_settings', label: 'Web search settings' },
                      { key: 'share_mcp_servers', label: 'MCP servers' },
                    ] as const
                  ).map((domain) => (
                    <div key={domain.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography.Text style={{ fontSize: 13 }}>{domain.label}</Typography.Text>
                      <Switch
                        size="small"
                        checked={record[domain.key] ?? true}
                        loading={setSharedDomains.isPending}
                        onChange={(checked) =>
                          setSharedDomains.mutate(
                            { id: record.id!, body: { [domain.key]: checked } },
                            { onError: (error) => message.error(getErrorMessage(error)) },
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              }
            >
              <Button
                size="small"
                icon={<ShareAltOutlined />}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Manage what ${record.name} shares as the platform default`}
              />
            </Popover>
          )}
          <Button
            size="small"
            icon={record.is_active === false ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
            onClick={(event) => {
              event.stopPropagation()
              setActive.mutate(
                { id: record.id!, isActive: record.is_active === false },
                { onError: (error) => message.error(getErrorMessage(error)) },
              )
            }}
            aria-label={record.is_active === false ? `Activate ${record.name}` : `Deactivate ${record.name}`}
          />
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={(event) => {
              event.stopPropagation()
              setEditing(record)
            }}
            aria-label={`Edit ${record.name}`}
          />
          <Popconfirm
            title={`Delete ${record.name}?`}
            description="This cascades everything scoped to this organization."
            onConfirm={(event) => {
              event?.stopPropagation()
              deleteOrg.mutate(record.id!, {
                onError: (error) => message.error(getErrorMessage(error)),
              })
            }}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={(event) => event.stopPropagation()}
              aria-label={`Delete ${record.name}`}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Organizations"
        description="Create and manage the companies that use your Seshat platform."
        actions={
          <Space>
            <Input.Search
              placeholder="Search organizations"
              allowClear
              onSearch={(value) => {
                setPage(1)
                setSearch(value)
              }}
              style={{ width: 260 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              New organization
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
        <StatTile label="Organizations" value={data?.total} loading={isLoading} icon={<ApartmentOutlined />} />
        <StatTile label="Default org" value={defaultOrg?.name ?? 'None set'} loading={isLoading} icon={<CrownOutlined />} />
        <StatTile label="Inactive" value={inactiveCount} loading={isLoading} icon={<PauseCircleOutlined />} />
        <StatTile
          label="Need details"
          value={organizationsNeedingAttention}
          loading={isLoading}
          icon={<WarningOutlined />}
        />
      </div>

      <Card title="All organizations" styles={{ body: { padding: 0 } }}>
        <ConsoleTable<Organization>
          rowKey="id"
          columns={columns}
          dataSource={organizations}
          loading={isLoading || isFetching}
          onChange={handleTableChange}
          onRow={(record) => ({
            onClick: () => navigate(`/orgs/${record.id}/overview`),
            style: { cursor: 'pointer' },
          })}
          locale={{
            emptyText: (
              <Empty
                image={<ApartmentOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
                description={search ? 'No organizations match your search' : 'No organizations yet'}
                style={{ padding: '40px 0' }}
              />
            ),
          }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            onChange: setPage,
            showTotal: (total) => `${total} organizations`,
          }}
        />
      </Card>

      <OrganizationFormDrawer
        organization={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => {
          if (editing === 'new') {
            createOrg.mutate(values, {
              onSuccess: () => setEditing(null),
              onError: (error) => message.error(getErrorMessage(error)),
            })
          } else if (editing) {
            updateOrg.mutate(
              { id: editing.id!, body: values },
              {
                onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)),
              },
            )
          }
        }}
        submitting={createOrg.isPending || updateOrg.isPending}
      />
    </div>
  )
}
