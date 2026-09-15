import { useEffect, useMemo, useState } from 'react'
import { ConfigCard, CustomSelect, Field, SoftButton, StatusPill, type SelectOption } from '../knowledge/KnowledgePrimitives'
import { linkCapability, unlinkCapability } from './multimodalApi'
import { CapabilityIcon, SourceIcon } from './MultimodalIcons'
import type { CapabilityName, CapabilityStatus } from './multimodalTypes'

type Props = {
  capability: Extract<CapabilityName, 'image' | 'audio'>
  title: string
  description: string
  configured?: boolean
  status: CapabilityStatus | null
  onChanged: () => Promise<void>
}

const CUSTOM_SOURCE = '__custom__'

export function CapabilitySourceCard({ capability, title, description, configured, status, onChanged }: Props) {
  const [source, setSource] = useState(CUSTOM_SOURCE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSource(status?.linked_provider_id || CUSTOM_SOURCE)
  }, [status?.linked_provider_id])

  const options: SelectOption[] = useMemo(() => {
    const candidateOptions = (status?.candidates ?? []).map((candidate) => ({
      value: candidate.id,
      label: candidate.name,
      description: providerDescription(candidate.provider, capability),
      icon: <SourceIcon provider={candidate.provider} />
    }))
    return [
      ...candidateOptions,
      {
        value: CUSTOM_SOURCE,
        label: 'Environment key',
        description: capability === 'image' ? 'OPENAI_API_KEY or GOOGLE_API_KEY' : 'OPENAI_API_KEY',
        icon: <SourceIcon provider="custom" />
      }
    ]
  }, [capability, status?.candidates])

  async function handleSourceChange(value: string) {
    setSource(value)
    setSaving(true)
    setError(null)
    try {
      if (value === CUSTOM_SOURCE) {
        await unlinkCapability(capability)
      } else {
        await linkCapability(capability, value)
      }
      await onChanged()
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Failed to update capability source.')
    } finally {
      setSaving(false)
    }
  }

  const linked = source !== CUSTOM_SOURCE
  const badgeTone = configured ? 'ok' : linked ? 'warn' : 'muted'

  return (
    <ConfigCard
      title={title}
      description={description}
      status={<StatusPill tone={badgeTone}>{configured ? 'Configured' : linked ? 'Linked' : 'Fallback'}</StatusPill>}
      action={<CapabilityIcon name={capability} />}
    >
      <div className="grid gap-4">
        <Field label="Source">
          <CustomSelect value={source} options={options} onChange={(value) => void handleSourceChange(value)} />
        </Field>

        <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2.5">
          <div className="text-[13px] font-semibold text-[var(--text-primary)]">
            {linked ? status?.linked_name || 'Linked provider' : 'Environment fallback'}
          </div>
          <div className="mt-1 text-[12px] leading-[var(--leading-copy)] text-[var(--text-muted)]">
            {linked
              ? 'SeshatOS reuses the API key already saved in Providers.'
              : capability === 'image'
                ? 'The backend will use OPENAI_API_KEY or GOOGLE_API_KEY when available.'
                : 'The backend will use OPENAI_API_KEY for cloud transcription and speech.'}
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end">
          <SoftButton type="button" tone={saving ? 'primary' : 'success'} disabled>
            {saving ? 'Saving...' : 'Source synced'}
          </SoftButton>
        </div>
      </div>
    </ConfigCard>
  )
}

function providerDescription(provider: string, capability: CapabilityName) {
  if (capability === 'audio') return 'Audio-capable provider'
  if (provider === 'openai') return 'Images API'
  if (provider === 'gemini') return 'Gemini image generation'
  return 'Configured provider'
}
