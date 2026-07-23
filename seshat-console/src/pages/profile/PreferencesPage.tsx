import { useEffect } from 'react'
import { Button, Card, Form, Input, InputNumber, Select, Space, message } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { useMyPreferences, useUpdateMyPreferences } from '@/api/preferences'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { permissionModeOptions } from '@/lib/runtimeOptions'

export function PreferencesPage() {
  const [form] = Form.useForm()
  const { data, isLoading } = useMyPreferences()
  const updatePreferences = useUpdateMyPreferences()

  useEffect(() => {
    form.setFieldsValue({
      preferred_name: data?.preferred_name ?? '',
      profession: data?.profession ?? '',
      about: data?.about ?? '',
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
        title="Preferences"
        description="Personal defaults for how Seshat should interact with you. These settings are never promoted as platform or organization defaults."
        actions={
          <Button type="primary" icon={<SaveOutlined />} loading={updatePreferences.isPending} onClick={() => form.submit()}>
            Save
          </Button>
        }
      />

      <Card loading={isLoading}>
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) =>
            updatePreferences.mutate(values, {
              onSuccess: () => message.success('Preferences updated'),
              onError: (error) => message.error(getErrorMessage(error)),
            })
          }
        >
          <Form.Item name="preferred_name" label="Preferred name">
            <Input />
          </Form.Item>
          <Form.Item name="profession" label="Profession">
            <Input />
          </Form.Item>
          <Form.Item name="about" label="About you">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="working_style" label="Working style">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="response_style" label="Response style">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="extra_context" label="Extra context">
            <Input.TextArea rows={4} />
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
        </Form>
      </Card>
    </div>
  )
}
