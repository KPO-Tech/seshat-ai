import type { Agent, CreateAgentBody } from '@/api/types'

export const PERMISSION_OPTIONS = [
  { value: '', label: 'Default' },
  { value: 'onRequest', label: 'On Request' },
  { value: 'auto', label: 'Auto' },
  { value: 'acceptEdits', label: 'Accept Edits' },
  { value: 'bypass', label: 'Bypass' },
  { value: 'never', label: 'Never' },
]

export type AgentForm = {
  slug: string
  name: string
  icon: string
  when_to_use: string
  system_prompt: string
  model: string
  tools_mode: 'all' | 'custom'
  tools_custom: string
  disallowed_tools: string
  max_turns: number
  permission_mode: string
  enabled: boolean
}

export const BLANK_AGENT_FORM: AgentForm = {
  slug: '',
  name: '',
  icon: '',
  when_to_use: '',
  system_prompt: '',
  model: '',
  tools_mode: 'all',
  tools_custom: '',
  disallowed_tools: '',
  max_turns: 50,
  permission_mode: '',
  enabled: true,
}

export function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function agentToForm(agent: Agent): AgentForm {
  const hasCustomTools = Array.isArray(agent.tools) && agent.tools.length > 0 &&
    !(agent.tools.length === 1 && agent.tools[0] === '*')

  return {
    slug: agent.slug,
    name: agent.name || agent.slug,
    icon: agent.icon ?? '',
    when_to_use: agent.when_to_use || '',
    system_prompt: agent.system_prompt || '',
    model: agent.model || '',
    tools_mode: hasCustomTools ? 'custom' : 'all',
    tools_custom: hasCustomTools ? (agent.tools ?? []).join(', ') : '',
    disallowed_tools: (agent.disallowed_tools ?? []).join(', '),
    max_turns: agent.max_turns || 50,
    permission_mode: agent.permission_mode || '',
    enabled: agent.enabled ?? true,
  }
}

export function formToBody(form: AgentForm): CreateAgentBody {
  const tools = form.tools_mode === 'all'
    ? undefined
    : form.tools_custom.split(',').map((tool) => tool.trim()).filter(Boolean)
  const disallowed = form.disallowed_tools.split(',').map((tool) => tool.trim()).filter(Boolean)

  return {
    slug: form.slug,
    name: form.name.trim() || form.slug,
    icon: form.icon,
    when_to_use: form.when_to_use.trim() || undefined,
    system_prompt: form.system_prompt.trim() || undefined,
    model: form.model.trim() || undefined,
    tools: tools && tools.length > 0 ? tools : undefined,
    disallowed_tools: disallowed.length > 0 ? disallowed : undefined,
    max_turns: form.max_turns || 50,
    permission_mode: form.permission_mode || undefined,
    enabled: form.enabled,
  }
}
