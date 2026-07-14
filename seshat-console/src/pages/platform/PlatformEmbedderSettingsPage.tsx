import { Alert, message } from 'antd'
import { PageHeader } from '@/components/PageHeader'
import { EmbedderSettingForm } from '@/components/EmbedderSettingForm'
import {
  usePlatformEmbedderSetting,
  useSetPlatformEmbedderSetting,
  useDeletePlatformEmbedderSetting,
  type EmbedderSettingInput,
} from '@/api/embedderSettings'
import { getErrorMessage } from '@/api/errors'

export function PlatformEmbedderSettingsPage() {
  const { data: setting, isLoading } = usePlatformEmbedderSetting()
  const setSetting = useSetPlatformEmbedderSetting()
  const deleteSetting = useDeletePlatformEmbedderSetting()

  return (
    <div>
      <PageHeader
        title="Default Embedder"
        description="The platform-wide fallback embedder used for RAG ingestion and search. It is used by any organization that has not configured its own."
      />
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="How this fits together"
        description="Same hybrid model as the LLM default providers: an organization's own embedder always wins when configured. Otherwise, cloud-targeted ingestion and search fall back to what is set here."
      />
      <EmbedderSettingForm
        setting={setting}
        loading={isLoading}
        saving={setSetting.isPending}
        deleting={deleteSetting.isPending}
        emptyDescription="No platform default embedder configured yet."
        onSave={(values: EmbedderSettingInput) => {
          setSetting.mutate(values, {
            onSuccess: () => message.success('Platform embedder configuration saved'),
            onError: (error) => message.error(getErrorMessage(error)),
          })
        }}
        onDelete={() => {
          deleteSetting.mutate(undefined, {
            onSuccess: () => message.success('Platform embedder configuration removed'),
            onError: (error) => message.error(getErrorMessage(error)),
          })
        }}
      />
    </div>
  )
}
