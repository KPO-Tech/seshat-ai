import { fetchProviderModels, fetchProviderSettings } from '@renderer/components/config/providers/providerApi'
import type { ProviderModel, ProviderSetting } from '@renderer/components/config/providers/providerTypes'

export type ChatModelChoice = {
  id: string
  providerSettingId: string
  provider: string
  providerName: string
  modelId: string
  label: string
  selected: boolean
}

export async function fetchChatModelChoices(): Promise<ChatModelChoice[]> {
  const settings = await fetchProviderSettings()
  const configured = settings.filter((setting) => setting.connection_status !== 'disabled')
  const entries = await Promise.all(configured.map(async (setting) => [setting, await fetchProviderModels(setting.id).catch(() => [])] as const))
  return entries.flatMap(([setting, models]) => choicesForProvider(setting, models))
}

function choicesForProvider(setting: ProviderSetting, models: ProviderModel[]): ChatModelChoice[] {
  const selectedModelId = setting.model_id || models.find((model) => model.is_default)?.model_id || models[0]?.model_id || ''

  if (models.length === 0 && selectedModelId) {
    return [choiceFromModel(setting, selectedModelId, selectedModelId, true)]
  }

  return models.map((model) => choiceFromModel(
    setting,
    model.model_id,
    model.display_name || model.model_id,
    model.model_id === selectedModelId
  ))
}

function choiceFromModel(setting: ProviderSetting, modelId: string, label: string, selected: boolean): ChatModelChoice {
  return {
    id: `${setting.id}:${modelId}`,
    providerSettingId: setting.id,
    provider: setting.provider,
    providerName: setting.name,
    modelId,
    label,
    selected
  }
}
