import { useEffect } from 'react'
import { useParams } from 'react-router'
import { Button, Card, Form, Input, InputNumber, Popconfirm, Select, Space, Typography, message } from 'antd'
import { DeleteOutlined, SaveOutlined } from '@ant-design/icons'
import {
  useDeleteOrganizationPreferences,
  useOrganizationPreferences,
  useSetOrganizationPreferences,
} from '@/api/organizationPreferences'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { permissionModeOptions } from '@/lib/runtimeOptions'

// Org-scoped defaults for the subset of personal Preferences fields that
// make sense at an organization level (no preferred_name/profession/about,
// see OrganizationPreferences' doc comment on the backend). A member's own
// personal preference always wins over these when they've set one. An org
// with nothing of its own falls back to the platform-default organization's
// values, if any and shared, both resolved transparently server-side.
export function OrganizationPreferencesPage() {
  const { organizationId } = useParams<{ organizationId: string }>()
  const [form] = Form.useForm()
  const { data, isLoading } = useOrganizationPreferences(organizationId)
  const setPreferences = useSetOrganizationPreferences()
  const deletePreferences = useDeleteOrganizationPreferences()

  useEffect(() => {
    form.setFieldsValue({
      working_style: data?.working_style ?? '',
      response_style: data?.response_style ?? '',
      extra_context: data?.extra_context ?? '',
      interactive_permission_mode: data?.interactive_permission_mode ?? '',
      automation_permission_mode: data?.automation_permission_mode ?? '',
      max_sub_agent_depth: data?.max_sub_agent_depth ?? 0,
    })
  }, [data, form])

  return (
    <div>
      <PageHeader
        description="Defaults members inherit until they set their own."
      />

      <Card loading={isLoading}>
        {!data && !isLoading && (
          <Typography.Paragraph type="secondary">
            Not configured yet. Members fall back to the platform default, if any.
          </Typography.Paragraph>
        )}
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            organizationId &&
            setPreferences.mutate(
              { organizationId, body: values },
              {
                onSuccess: () => message.success('Organization preferences updated'),
                onError: (error) => message.error(getErrorMessage(error)),
              },
            )
          }
        >
          <Form.Item name="working_style" label="Working style">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="response_style" label="Response style">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="extra_context" label="Extra context">
            <Input.TextArea rows={4} placeholder="Anything about this organization every member's agent should know" />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }} align="start">
            <Form.Item name="interactive_permission_mode" label="Interactive permission mode" style={{ flex: 1 }}>
              <Select allowClear options={permissionModeOptions.filter((option) => option.value)} />
            </Form.Item>
            <Form.Item name="automation_permission_mode" label="Automation permission mode" style={{ flex: 1 }}>
              <Select allowClear options={permissionModeOptions.filter((option) => option.value)} />
            </Form.Item>
          </Space>
          <Form.Item name="max_sub_agent_depth" label="Max sub-agent depth">
            <InputNumber min={0} max={5} style={{ width: '100%' }} />
          </Form.Item>
          <Space>
            <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={setPreferences.isPending}>
              Save
            </Button>
            {data && (
              <Popconfirm
                title="Clear this organization's preferences?"
                description="Members will fall back to the platform default, if any, instead."
                onConfirm={() =>
                  organizationId &&
                  deletePreferences.mutate(organizationId, {
                    onSuccess: () => message.success('Organization preferences cleared'),
                    onError: (error) => message.error(getErrorMessage(error)),
                  })
                }
              >
                <Button danger icon={<DeleteOutlined />} loading={deletePreferences.isPending}>
                  Clear
                </Button>
              </Popconfirm>
            )}
          </Space>
        </Form>
      </Card>
    </div>
  )
}
