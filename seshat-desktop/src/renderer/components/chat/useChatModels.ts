import { useEffect, useMemo, useState } from 'react'
import { fetchChatModelChoices, type ChatModelChoice } from './chatModels'

export function useChatModels(activeModelId?: string) {
  const [choices, setChoices] = useState<ChatModelChoice[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchChatModelChoices()
      .then((nextChoices) => {
        if (cancelled) return
        setChoices(nextChoices)
        setSelectedId((current) => current || preferredChoiceId(nextChoices, activeModelId))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load models.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [activeModelId])

  useEffect(() => {
    if (!activeModelId || choices.length === 0) return
    const activeChoice = choices.find((choice) => choice.modelId === activeModelId)
    if (activeChoice) setSelectedId(activeChoice.id)
  }, [activeModelId, choices])

  const selected = useMemo(
    () => choices.find((choice) => choice.id === selectedId) ?? choices.find((choice) => choice.selected) ?? choices[0] ?? null,
    [choices, selectedId]
  )

  return { choices, selected, selectedId: selected?.id ?? selectedId, loading, error, setSelectedId }
}

function preferredChoiceId(choices: ChatModelChoice[], activeModelId?: string) {
  return choices.find((choice) => activeModelId && choice.modelId === activeModelId)?.id
    ?? choices.find((choice) => choice.selected)?.id
    ?? choices[0]?.id
    ?? ''
}
