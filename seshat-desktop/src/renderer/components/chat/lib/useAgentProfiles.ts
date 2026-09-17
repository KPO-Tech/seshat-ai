import { useEffect, useMemo, useState } from 'react'
import { fetchAgents } from '@renderer/components/config/agents/agentsApi'
import type { AgentSource } from '@renderer/components/config/agents/agentTypes'

export type AgentProfileChoice = {
  slug: string
  name: string
  whenToUse?: string
  icon?: string
  source: AgentSource
}

// Drives the "Seshat" workflow selector in ChatWorkspace's header: which
// configured agent profile (system prompt/model/tools, from /agents) the
// next turn runs as. Selecting one sends its slug as agent_slug on the
// query - see seshat-backend's queryRequest.AgentSlug. An empty slug means
// "no override" (the session's own default agent).
export function useAgentProfiles() {
  const [choices, setChoices] = useState<AgentProfileChoice[]>([])
  const [selectedSlug, setSelectedSlug] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchAgents()
      .then((agents) => {
        if (cancelled) return
        setChoices(
          agents
            .filter((agent) => agent.enabled)
            .map((agent) => ({ slug: agent.slug, name: agent.name, whenToUse: agent.when_to_use, icon: agent.icon, source: agent.source }))
        )
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load agents.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const selected = useMemo(() => choices.find((choice) => choice.slug === selectedSlug) ?? null, [choices, selectedSlug])

  return { choices, selected, selectedSlug, loading, error, setSelectedSlug }
}
