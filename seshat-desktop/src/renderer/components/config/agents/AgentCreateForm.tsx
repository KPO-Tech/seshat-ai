import { useState } from 'react'
import { ConfigCard, Field, SoftButton, TextInput } from '../knowledge/KnowledgePrimitives'
import type { AgentCreatePayload } from './agentTypes'

export function AgentCreateForm({ saving, onCancel, onSubmit }: {
  saving: boolean
  onCancel: () => void
  onSubmit: (payload: AgentCreatePayload) => void
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [whenToUse, setWhenToUse] = useState('')
  const [prompt, setPrompt] = useState('')
  const computedSlug = slug.trim() || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  return (
    <ConfigCard
      title="New agent"
      description="Create a lightweight local profile. Full prompt editing will move into the dedicated agent workspace later."
      action={<SoftButton onClick={onCancel}>Cancel</SoftButton>}
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Research companion" />
          </Field>
          <Field label="Slug">
            <TextInput value={slug} onChange={(event) => setSlug(event.target.value)} placeholder={computedSlug || 'research-companion'} />
          </Field>
        </div>
        <Field label="When to use">
          <TextInput value={whenToUse} onChange={(event) => setWhenToUse(event.target.value)} placeholder="Use for source-backed research and synthesis." />
        </Field>
        <Field label="System prompt">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            className="min-w-0 resize-none rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent-primary)]"
            placeholder="Describe the agent behavior, boundaries, and tone."
          />
        </Field>
        <div className="flex justify-end">
          <SoftButton
            tone="primary"
            disabled={saving || !name.trim() || !computedSlug || !prompt.trim()}
            onClick={() => onSubmit({ slug: computedSlug, name: name.trim(), when_to_use: whenToUse.trim(), system_prompt: prompt.trim(), enabled: true, icon: `lorelei:${computedSlug}` })}
          >
            {saving ? 'Creating...' : 'Create agent'}
          </SoftButton>
        </div>
      </div>
    </ConfigCard>
  )
}
