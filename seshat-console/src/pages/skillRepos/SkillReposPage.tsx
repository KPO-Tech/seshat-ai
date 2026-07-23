import { useEffect, useState } from 'react'
import { Button, Drawer, Empty, Form, Input, message, Popconfirm, Space, Typography } from 'antd'
import type { TableProps } from 'antd'
import { BookOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import {
  useSkillReposList,
  useCreateSkillRepo,
  useUpdateSkillRepo,
  useDeleteSkillRepo,
  type SkillRepo,
} from '@/api/skillRepos'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { ConsoleTable } from '@/components/ConsoleTable'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette } from '@/theme/tokens'

export function SkillReposPage() {
  const organizationId = useScopedOrganizationId()
  const [editing, setEditing] = useState<SkillRepo | 'new' | null>(null)
  const { data, isLoading } = useSkillReposList(organizationId ?? undefined)
  const createRepo = useCreateSkillRepo()
  const updateRepo = useUpdateSkillRepo()
  const deleteRepo = useDeleteSkillRepo()

  const columns: TableProps<SkillRepo>['columns'] = [
    {
      title: 'Repository',
      key: 'name',
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 500 }}>{record.name}</div>
          <Typography.Text style={{ fontSize: 12, color: palette.inkTertiary }}>{record.url}</Typography.Text>
        </div>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      render: (value: string | undefined) => value || <Typography.Text type="secondary">No description</Typography.Text>,
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(record)} aria-label={`Edit ${record.name}`} />
          <Popconfirm
            title={`Delete ${record.name}?`}
            onConfirm={() =>
              deleteRepo.mutate(record.id!, {
                onError: (error) => message.error(getErrorMessage(error)),
              })
            }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${record.name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Skill Repos"
        description="Organization-curated skill repository URLs that connected backends can merge into their local catalog."
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')} disabled={!organizationId}>
            Add skill repo
          </Button>
        }
      />

      <ConsoleTable<SkillRepo>
        rowKey="id"
        columns={columns}
        dataSource={data ?? []}
        loading={isLoading}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={<BookOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
              description="No skill repositories yet"
              style={{ padding: '32px 0' }}
            />
          ),
        }}
      />

      <SkillRepoFormDrawer
        repo={editing === 'new' ? null : editing}
        organizationId={organizationId}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => {
          if (!organizationId) return
          if (editing === 'new') {
            createRepo.mutate(
              { ...values, organization_id: organizationId },
              {
                onSuccess: () => setEditing(null),
                onError: (error) => message.error(getErrorMessage(error)),
              },
            )
            return
          }
          if (!editing?.id) return
          updateRepo.mutate(
            { id: editing.id, body: values },
            {
              onSuccess: () => setEditing(null),
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submitting={createRepo.isPending || updateRepo.isPending}
      />
    </div>
  )
}

function SkillRepoFormDrawer({
  repo,
  organizationId,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  repo: SkillRepo | null
  organizationId: string | null
  open: boolean
  onClose: () => void
  onSubmit: (values: any) => void
  submitting: boolean
}) {
  const [form] = Form.useForm()

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      name: repo?.name ?? '',
      url: repo?.url ?? '',
      description: repo?.description ?? '',
    })
  }, [form, open, repo])

  return (
    <Drawer
      title={repo ? `Edit ${repo.name}` : 'New skill repo'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => {
          const payload = {
            ...(repo ? {} : { organization_id: organizationId ?? '' }),
            name: String(values.name ?? '').trim(),
            url: String(values.url ?? '').trim(),
            description: String(values.description ?? '').trim() || undefined,
          }
          onSubmit(payload)
        }}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="seshat-skills" />
        </Form.Item>
        <Form.Item name="url" label="URL" rules={[{ required: true, type: 'url', message: 'Valid URL required' }]}>
          <Input placeholder="https://github.com/EngineerProjects/seshat-skills" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
