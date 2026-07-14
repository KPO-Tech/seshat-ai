import { Alert, message, Space } from 'antd'
import { PageHeader } from '@/components/PageHeader'
import { useScopedOrganizationId } from '@/hooks/useOrganizationScope'
import { EmbedderSettingForm } from '@/components/EmbedderSettingForm'
import {
  useEmbedderSetting,
  useSetEmbedderSetting,
  useDeleteEmbedderSetting,
  type EmbedderSettingInput,
} from '@/api/embedderSettings'
import { getErrorMessage } from '@/api/errors'

export function EmbedderSettingsPage() {
  const organizationId = useScopedOrganizationId()
  const { data: setting, isLoading } = useEmbedderSetting(organizationId ?? undefined)
  const setSetting = useSetEmbedderSetting()
  const deleteSetting = useDeleteEmbedderSetting()

  if (!organizationId) return null

  return (
    <div>
      <PageHeader
        title="Embedder Settings"
        description="The embedder this organization uses for RAG ingestion and search. Falls back to this platform's default organization's embedder when not set."
        actions={undefined}
      />

      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            title="Why this can only ever be one embedder"
            description="A corpus's vectors are all produced by whichever embedder was active at ingest time. Switching embedders after documents exist would silently mix incompatible vector dimensions in the same corpus. Re-ingest affected files if you need to change providers."
          />
          <EmbedderSettingForm
            setting={setting}
            loading={isLoading}
            saving={setSetting.isPending}
            deleting={deleteSetting.isPending}
            emptyDescription="No embedder configured for this organization yet. It will fall back to this platform's default organization's embedder, if one is configured."
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
    </div>
  )
}
