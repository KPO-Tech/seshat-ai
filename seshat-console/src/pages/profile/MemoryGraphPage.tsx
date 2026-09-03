import { useMemo, useState } from 'react'
import { Alert, Button, Card, Empty, Form, Input, InputNumber, List, Space, Tag, Typography, message } from 'antd'
import { NodeIndexOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import {
  useSearchMyMemoryNodes,
  useGetMyMemoryContext,
  useOpenMyMemoryNodes,
  useUpsertMyMemoryEntities,
  useAddMyMemoryObservations,
} from '@/api/memoryGraph'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'

export function MemoryGraphPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [openNames, setOpenNames] = useState('')
  const [contextQuery, setContextQuery] = useState('')
  const [maxTokens, setMaxTokens] = useState<number | undefined>(400)
  const [entityForm] = Form.useForm()
  const [observationForm] = Form.useForm()

  const search = useSearchMyMemoryNodes(searchQuery)
  const context = useGetMyMemoryContext(contextQuery, maxTokens)
  const openNodes = useOpenMyMemoryNodes()
  const upsertEntities = useUpsertMyMemoryEntities()
  const addObservations = useAddMyMemoryObservations()

  const graph = useMemo(() => openNodes.data ?? search.data, [openNodes.data, search.data])

  return (
    <div>
      <PageHeader
        description="Your personal entity graph and long-term relationship memory. This data stays user-scoped and is never shared as an org or platform default."
      />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginBottom: 24 }}>
        <Card title="Search graph">
          <Space.Compact style={{ width: '100%' }}>
            <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search entities or observations" />
            <Button type="primary" icon={<SearchOutlined />} onClick={() => search.refetch()} disabled={!searchQuery.trim()} loading={search.isFetching}>
              Search
            </Button>
          </Space.Compact>
        </Card>

        <Card title="Open by entity names">
          <Space.Compact style={{ width: '100%' }}>
            <Input value={openNames} onChange={(event) => setOpenNames(event.target.value)} placeholder="Alice, Acme, Paris" />
            <Button
              onClick={() =>
                openNodes.mutate(splitLinesOrCommas(openNames), {
                  onError: (error) => message.error(getErrorMessage(error)),
                })
              }
              disabled={splitLinesOrCommas(openNames).length === 0}
              loading={openNodes.isPending}
            >
              Open
            </Button>
          </Space.Compact>
        </Card>

        <Card title="Build context block">
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <Input value={contextQuery} onChange={(event) => setContextQuery(event.target.value)} placeholder="What are my current research priorities?" />
            <InputNumber min={50} max={4000} step={50} value={maxTokens} onChange={(value) => setMaxTokens(value ?? undefined)} style={{ width: '100%' }} />
            <Button onClick={() => context.refetch()} disabled={!contextQuery.trim()} loading={context.isFetching}>
              Refresh context
            </Button>
            <Input.TextArea rows={6} readOnly value={context.data?.context ?? ''} placeholder="Formatted memory context will appear here." />
          </Space>
        </Card>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginBottom: 24 }}>
        <Card title="Add entity">
          <Form
            form={entityForm}
            layout="vertical"
            initialValues={{ entity_type: 'entity', observations_text: '' }}
            onFinish={(values) =>
              upsertEntities.mutate(
                [{ name: values.name, entity_type: values.entity_type, observations: splitLinesOrCommas(values.observations_text) }],
                {
                  onSuccess: () => {
                    message.success('Entity upserted')
                    entityForm.resetFields()
                  },
                  onError: (error) => message.error(getErrorMessage(error)),
                },
              )
            }
          >
            <Form.Item name="name" label="Entity name" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="Alice" />
            </Form.Item>
            <Form.Item name="entity_type" label="Entity type">
              <Input placeholder="person" />
            </Form.Item>
            <Form.Item name="observations_text" label="Initial observations" extra="One observation per line.">
              <Input.TextArea rows={4} placeholder="Works at Acme\nPrefers concise responses" />
            </Form.Item>
            <Button type="primary" icon={<PlusOutlined />} htmlType="submit" loading={upsertEntities.isPending}>
              Save entity
            </Button>
          </Form>
        </Card>

        <Card title="Add observations">
          <Form
            form={observationForm}
            layout="vertical"
            onFinish={(values) =>
              addObservations.mutate(
                [{ entity_name: values.entity_name, contents: splitLinesOrCommas(values.contents_text) }],
                {
                  onSuccess: () => {
                    message.success('Observations added')
                    observationForm.resetFields()
                  },
                  onError: (error) => message.error(getErrorMessage(error)),
                },
              )
            }
          >
            <Form.Item name="entity_name" label="Entity name" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="Alice" />
            </Form.Item>
            <Form.Item name="contents_text" label="Observations" rules={[{ required: true, message: 'Required' }]} extra="One observation per line.">
              <Input.TextArea rows={4} placeholder="Started leading the infra project" />
            </Form.Item>
            <Button htmlType="submit" loading={addObservations.isPending}>
              Add observations
            </Button>
          </Form>
        </Card>
      </div>

      {(search.error || openNodes.error || context.error) && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 20 }}
          title="Some memory graph operations failed"
          description={getErrorMessage(search.error || openNodes.error || context.error)}
        />
      )}

      <Card title="Current graph view">
        {graph?.entities?.length || graph?.relations?.length ? (
          <Space orientation="vertical" size={20} style={{ width: '100%' }}>
            <div>
              <Typography.Title level={5}>Entities</Typography.Title>
              <List
                dataSource={graph.entities ?? []}
                renderItem={(entity) => (
                  <List.Item>
                    <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                      <Space wrap>
                        <Tag icon={<NodeIndexOutlined />}>{entity.entity_type || 'entity'}</Tag>
                        <Typography.Text strong>{entity.name}</Typography.Text>
                      </Space>
                      {(entity.observations ?? []).length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {(entity.observations ?? []).map((observation) => (
                            <li key={observation}>{observation}</li>
                          ))}
                        </ul>
                      ) : (
                        <Typography.Text type="secondary">No observations</Typography.Text>
                      )}
                    </Space>
                  </List.Item>
                )}
              />
            </div>
            <div>
              <Typography.Title level={5}>Relations</Typography.Title>
              <List
                dataSource={graph.relations ?? []}
                locale={{ emptyText: 'No relations in this view' }}
                renderItem={(relation) => (
                  <List.Item>
                    <Space wrap>
                      <Typography.Text strong>{relation.from}</Typography.Text>
                      <Tag>{relation.relation_type}</Tag>
                      <Typography.Text strong>{relation.to}</Typography.Text>
                    </Space>
                  </List.Item>
                )}
              />
            </div>
          </Space>
        ) : (
          <Empty description="No graph loaded yet" />
        )}
      </Card>
    </div>
  )
}

function splitLinesOrCommas(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}
