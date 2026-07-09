import { Alert, message, Space } from 'antd'
import { PageHeader } from '@/components/PageHeader'
import { OrganizationPicker } from '@/components/OrganizationPicker'
import { EmbedderSettingForm } from '@/components/EmbedderSettingForm'
import {
  useEmbedderSetting,
  useSetEmbedderSetting,
  useDeleteEmbedderSetting,
  type EmbedderSettingInput,
} from '@/api/embedderSettings'
import { useConsoleOrgStore } from '@/store/consoleOrg'
import { getErrorMessage } from '@/api/errors'

export function EmbedderSettingsPage() {
  const organizationId = useConsoleOrgStore((s) => s.organizationId)
  const { data: setting, isLoading } = useEmbedderSetting(organizationId ?? undefined)
  const setSetting = useSetEmbedderSetting()
  const deleteSetting = useDeleteEmbedderSetting()

  return (
    <div>
      <PageHeader
        title="Embedder Settings"
        description="The embedder this organization uses for RAG ingestion and search — falls back to the platform default when not set."
        actions={<OrganizationPicker />}
      />

      {!organizationId ? (
        <Alert type="info" showIcon title="Pick an organization above to view or edit its embedder configuration." />
      ) : (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            title="Why this can only ever be one embedder"
            description="A corpus's vectors are all produced by whichever embedder was active at ingest time — switching embedders after documents exist would silently mix incompatible vector dimensions in the same corpus. Re-ingest affected files if you do need to change providers."
          />
          <EmbedderSettingForm
            setting={setting}
            loading={isLoading}
            saving={setSetting.isPending}
            deleting={deleteSetting.isPending}
            emptyDescription="No embedder configured for this organization yet — it will fall back to the platform default, if one exists."
            onSave={(values: EmbedderSettingInput) => {
              setSetting.mutate(
                { organizationId, body: values },
                {
                  onSuccess: () => message.success('Embedder configuration saved'),
                  onError: (error) => message.error(getErrorMessage(error)),
                },
              )
            }}
            onDelete={() => {
              deleteSetting.mutate(organizationId, {
                onSuccess: () => message.success('Embedder configuration removed'),
                onError: (error) => message.error(getErrorMessage(error)),
              })
            }}
          />
        </Space>
      )}
    </div>
  )
}
