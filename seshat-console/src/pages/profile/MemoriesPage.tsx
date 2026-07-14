import { useEffect, useState } from 'react'
import { Button, Drawer, Empty, Form, Input, InputNumber, message, Popconfirm, Select, Space, Tag } from 'antd'
import type { TableProps } from 'antd'
import { DeleteOutlined, EditOutlined, PlusOutlined, ProfileOutlined } from '@ant-design/icons'
import {
  useMyMemoriesList,
  useCreateMyMemory,
  useUpdateMyMemory,
  useDeleteMyMemory,
  useDeleteAllMyMemories,
  type UserMemory,
  type UserMemoryInput,
  type UserMemoryUpdateInput,
} from '@/api/memories'
import { getErrorMessage } from '@/api/errors'
import { ConsoleTable } from '@/components/ConsoleTable'
import { PageHeader } from '@/components/PageHeader'
import { memoryTypeOptions } from '@/lib/runtimeOptions'
import { presentDateTime } from '@/lib/present'
import { palette } from '@/theme/tokens'

export function MemoriesPage() {
  const [editing, setEditing] = useState<UserMemory | 'new' | null>(null)
  const { data, isLoading } = useMyMemoriesList()
  const createMemory = useCreateMyMemory()
  const updateMemory = useUpdateMyMemory()
  const deleteMemory = useDeleteMyMemory()
  const deleteAll = useDeleteAllMyMemories()

  const columns: TableProps<UserMemory>['columns'] = [
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (value: string | undefined) => <Tag>{value ?? 'fact'}</Tag>,
    },
    { title: 'Key', dataIndex: 'key', key: 'key', width: 220 },
    { title: 'Value', dataIndex: 'value', key: 'value' },
    {
      title: 'Importance',
      dataIndex: 'importance',
      key: 'importance',
      width: 110,
      render: (value: number | undefined) => (value ?? 0).toFixed(2),
    },
    {
      title: 'Updated',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (value: string | undefined) => presentDateTime(value, 'Unknown'),
    },
    {
      title: '',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(record)} aria-label={`Edit ${record.key}`} />
          <Popconfirm
            title={`Delete ${record.key}?`}
            onConfirm={() =>
              deleteMemory.mutate(record.id!, {
                onError: (error) => message.error(getErrorMessage(error)),
              })
            }
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${record.key}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Memories"
        description="Flat personal memories: facts, instructions, preferences and context specific to you."
        actions={
          <Space>
            <Popconfirm
              title="Delete all memories?"
              description="This clears your flat personal memory list only."
              onConfirm={() =>
                deleteAll.mutate(undefined, {
                  onSuccess: () => message.success('Memories cleared'),
                  onError: (error) => message.error(getErrorMessage(error)),
                })
              }
            >
              <Button danger disabled={!data?.length}>
                Clear all
              </Button>
            </Popconfirm>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
              Add memory
            </Button>
          </Space>
        }
      />

      <ConsoleTable<UserMemory>
        rowKey="id"
        columns={columns}
        dataSource={data ?? []}
        loading={isLoading}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={<ProfileOutlined style={{ fontSize: 32, color: palette.inkTertiary }} />}
              description="No personal memories yet"
              style={{ padding: '32px 0' }}
            />
          ),
        }}
      />

      <MemoryFormDrawer
        memory={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSubmit={(values) => {
          if (editing === 'new') {
            createMemory.mutate(values as UserMemoryInput, {
              onSuccess: () => setEditing(null),
              onError: (error) => message.error(getErrorMessage(error)),
            })
            return
          }
          if (!editing?.id) return
          updateMemory.mutate(
            { id: editing.id, body: values as UserMemoryUpdateInput },
            {
              onSuccess: () => setEditing(null),
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submitting={createMemory.isPending || updateMemory.isPending}
      />
    </div>
  )
}

function MemoryFormDrawer({
  memory,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  memory: UserMemory | null
  open: boolean
  onClose: () => void
  onSubmit: (values: UserMemoryInput | UserMemoryUpdateInput) => void
  submitting: boolean
}) {
  const [form] = Form.useForm()

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      type: memory?.type ?? 'fact',
      key: memory?.key ?? '',
      value: memory?.value ?? '',
      importance: memory?.importance ?? 0.5,
      source: memory?.source ?? '',
    })
  }, [form, memory, open])

  return (
    <Drawer
      title={memory ? `Edit ${memory.key}` : 'New memory'}
      open={open}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button type="primary" loading={submitting} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="type" label="Type" rules={[{ required: true, message: 'Required' }]}>
          <Select options={memoryTypeOptions} />
        </Form.Item>
        <Form.Item name="key" label="Key" rules={[{ required: true, message: 'Required' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="value" label="Value">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item name="importance" label="Importance">
          <InputNumber min={0} max={1} step={0.1} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="source" label="Source">
          <Input />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
