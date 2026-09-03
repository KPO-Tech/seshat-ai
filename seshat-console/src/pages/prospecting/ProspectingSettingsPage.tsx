import { useEffect, useState } from 'react'
import { Button, Drawer, Form, Input, InputNumber, Space, Tag, Typography, message } from 'antd'
import { CompassOutlined, EditOutlined } from '@ant-design/icons'
import {
  useProspectingSettings,
  useSetProspectingSettings,
  type ProspectingSettings,
  type ProspectingSettingsInput,
} from '@/api/prospecting'
import { getErrorMessage } from '@/api/errors'
import { PageHeader } from '@/components/PageHeader'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { palette } from '@/theme/tokens'

export function ProspectingSettingsPage() {
  const organizationId = useScopedOrganizationId()
  const [editing, setEditing] = useState(false)
  const { data: settings, isLoading } = useProspectingSettings(organizationId ?? undefined)
  const setSettings = useSetProspectingSettings()

  if (!organizationId || isLoading) return null

  const isConfigured = Boolean(settings)

  return (
    <div>
      <PageHeader description="Google Places credentials for this organization's business-discovery sweeps." />

      <div
        style={{
          border: `1px solid ${palette.border}`,
          borderRadius: 12,
          background: palette.surface,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <Space size={14} align="start">
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: palette.accentSoft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CompassOutlined style={{ color: palette.accent, fontSize: 18 }} />
          </div>
          <div>
            <Typography.Text strong>Google Places</Typography.Text>
            <Typography.Text style={{ display: 'block', fontSize: 12, color: palette.inkTertiary }}>
              {isConfigured ? `Daily cap: ${settings!.daily_cap} calls` : 'No API key set for this organization'}
            </Typography.Text>
          </div>
        </Space>
        <Space size={10}>
          <Tag color={isConfigured ? 'green' : 'default'} style={{ margin: 0 }}>
            {isConfigured ? 'Connected' : 'Not configured'}
          </Tag>
          {isConfigured ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)} aria-label="Edit Prospecting credential" />
          ) : (
            <Button size="small" type="primary" onClick={() => setEditing(true)}>
              Configure
            </Button>
          )}
        </Space>
      </div>

      <ProspectingSettingsFormDrawer
        settings={settings ?? null}
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={(values) => {
          if (!organizationId) return
          setSettings.mutate(
            { organizationId, body: values },
            {
              onSuccess: () => {
                message.success('Prospecting settings saved')
                setEditing(false)
              },
              onError: (error) => message.error(getErrorMessage(error)),
            },
          )
        }}
        submitting={setSettings.isPending}
      />
    </div>
  )
}

function ProspectingSettingsFormDrawer({
  settings,
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  settings: ProspectingSettings | null
  open: boolean
  onClose: () => void
  onSubmit: (values: ProspectingSettingsInput) => void
  submitting: boolean
}) {
  const [form] = Form.useForm<ProspectingSettingsInput>()
  const isEdit = settings !== null

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({ daily_cap: settings?.daily_cap ?? 100 })
  }, [open, settings, form])

  return (
    <Drawer
      title={isEdit ? 'Edit Prospecting settings' : 'Configure Prospecting'}
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
        <Form.Item
          name="api_key"
          label="Google Places API key"
          extra={isEdit ? 'Leave blank to keep the existing key.' : 'Strict bring-your-own-key. There is no platform default.'}
          rules={[{ required: !isEdit, message: 'Required' }]}
        >
          <Input.Password autoComplete="new-password" placeholder={isEdit ? '••••••••' : undefined} />
        </Form.Item>
        <Form.Item
          name="daily_cap"
          label="Daily call cap"
          extra="Maximum real Google Places API calls per day, across every sweep in this organization."
        >
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Drawer>
  )
}
