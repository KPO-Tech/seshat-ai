import { useEffect } from 'react'
import { Button, Card, Form, Input, InputNumber, Tag, Typography, message } from 'antd'
import { useProspectingSettings, useSetProspectingSettings, type ProspectingSettingsInput } from '@/api/prospecting'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'

export function ProspectingSettingsPage() {
  const organizationId = useScopedOrganizationId()
  const { data: settings, isLoading } = useProspectingSettings(organizationId ?? undefined)
  const setSettings = useSetProspectingSettings()
  const [form] = Form.useForm<ProspectingSettingsInput>()

  useEffect(() => {
    form.setFieldsValue({ daily_cap: settings?.daily_cap ?? 100 })
  }, [settings, form])

  return (
    <div>
      <PageHeader
        title="Prospecting settings"
        description="This organization's own Google Places API key for business-discovery sweeps. There is no platform default."
      />
      <Card size="small" loading={isLoading} style={{ maxWidth: 480 }}>
        <Form<ProspectingSettingsInput>
          form={form}
          layout="vertical"
          onFinish={(values) => {
            if (!organizationId) return
            setSettings.mutate(
              { organizationId, body: values },
              {
                onSuccess: () => {
                  message.success('Saved Prospecting settings')
                  form.setFieldValue('api_key', '')
                },
                onError: (error) => message.error(getErrorMessage(error)),
              },
            )
          }}
        >
          <Form.Item
            name="api_key"
            label="Google Places API key"
            extra={settings ? 'Leave blank to keep the existing key.' : 'Required to enable Prospecting for this organization.'}
            rules={[{ required: !settings, message: 'Required' }]}
          >
            <Input.Password autoComplete="new-password" placeholder={settings ? 'Unchanged' : undefined} />
          </Form.Item>
          <Form.Item name="daily_cap" label="Daily call cap" extra="Maximum real Google Places API calls per day, across every sweep in this organization.">
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={setSettings.isPending} disabled={!organizationId}>
            Save
          </Button>
          {settings && (
            <Tag color="success" style={{ marginLeft: 8 }}>
              Configured
            </Tag>
          )}
        </Form>
        {!settings && !isLoading && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            Not configured yet. Sweeps can't run until an API key is saved.
          </Typography.Paragraph>
        )}
      </Card>
    </div>
  )
}
