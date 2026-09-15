import { deleteSecret, getSecret, setSecret } from './ipc/secure-store'

export type EnvVarGroup = 'gmail' | 'prospecting' | 'automation' | 'multimodal'

export type EnvVarDef = {
  key: string
  label: string
  description: string
  group: EnvVarGroup
  groupLabel: string
  helpUrl?: string
  hidden?: boolean
}

export const ENV_VAR_CATALOG: EnvVarDef[] = [
  {
    key: 'GOOGLE_OAUTH_CLIENT_ID',
    label: 'Client ID',
    description: 'Google OAuth desktop client used by Gmail, Drive, and Google workspace connectors.',
    group: 'gmail',
    groupLabel: 'Google OAuth',
    helpUrl: 'https://console.cloud.google.com/apis/credentials'
  },
  {
    key: 'GOOGLE_OAUTH_CLIENT_SECRET',
    label: 'Client Secret',
    description: 'Secret paired with the Google OAuth desktop client.',
    group: 'gmail',
    groupLabel: 'Google OAuth',
    helpUrl: 'https://console.cloud.google.com/apis/credentials'
  },
  {
    key: 'GOOGLE_PLACES_API_KEY',
    label: 'Places API Key',
    description: 'Optional key for prospecting and local business discovery.',
    group: 'prospecting',
    groupLabel: 'Prospecting',
    helpUrl: 'https://console.cloud.google.com/apis/credentials'
  },
  {
    key: 'AUTOMATION_API_KEY',
    label: 'Automation API Key',
    description: 'Optional service credential for scheduled or external automation runs.',
    group: 'automation',
    groupLabel: 'Automation'
  },
  {
    key: 'OPENAI_API_KEY',
    label: 'OpenAI API Key',
    description: 'Fallback credential for image, audio, or media features when not linked to a provider.',
    group: 'multimodal',
    groupLabel: 'Multimodal',
    hidden: true
  },
  {
    key: 'GOOGLE_API_KEY',
    label: 'Gemini API Key',
    description: 'Fallback credential for Gemini media features when not linked to a provider.',
    group: 'multimodal',
    groupLabel: 'Multimodal',
    hidden: true
  }
]

const STORE_PREFIX = 'env:'

function assertKnownKey(key: string): void {
  if (!ENV_VAR_CATALOG.some((def) => def.key === key)) throw new Error(`Unknown environment variable: ${key}`)
}

export async function listEnvVarStatus(): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = {}
  for (const def of ENV_VAR_CATALOG) status[def.key] = (await getSecret(STORE_PREFIX + def.key)) != null
  return status
}

export async function setEnvVar(key: string, value: string): Promise<void> {
  assertKnownKey(key)
  const trimmed = value.trim()
  if (!trimmed) {
    await deleteSecret(STORE_PREFIX + key)
    return
  }
  await setSecret(STORE_PREFIX + key, trimmed)
}

export async function deleteEnvVar(key: string): Promise<void> {
  assertKnownKey(key)
  await deleteSecret(STORE_PREFIX + key)
}
