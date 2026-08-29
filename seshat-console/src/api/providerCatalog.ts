import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type ProviderCatalogEntry = components['schemas']['ProviderCatalogEntry']
export type ProviderCatalogModel = components['schemas']['ProviderCatalogModel']

const CATALOG_KEY = 'provider-catalog'

// Which providers/models the connected seshat SDK build supports - resolved
// live from the SDK's own registry (seshat-server's GET /provider-catalog)
// rather than a copy hardcoded here. This is deployment-wide, not
// organization-scoped, and only changes when the server itself is upgraded,
// so it's fetched once and kept fresh for a long time rather than
// per-organization query keys like every other settings hook in this
// directory.
export function useProviderCatalog() {
  return useQuery({
    queryKey: [CATALOG_KEY],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/provider-catalog')
      if (error) throw error
      return data.providers ?? []
    },
  })
}

export function getProviderLabel(catalog: ProviderCatalogEntry[] | undefined, provider: string | undefined | null) {
  if (!provider) return 'Provider'
  return catalog?.find((entry) => entry.name === provider)?.display_name ?? provider
}

export interface ProviderModelOption {
  id: string
  label: string
  description?: string
}

export function getProviderModels(
  catalog: ProviderCatalogEntry[] | undefined,
  provider: string | undefined | null,
  defaultModel?: string | null,
): ProviderModelOption[] {
  const providerKey = provider?.toLowerCase() ?? ''
  const entry = catalog?.find((candidate) => candidate.name === providerKey)
  const items: ProviderModelOption[] = (entry?.models ?? []).map((model) => ({
    id: model.id!,
    label: model.id!,
    description: model.description,
  }))
  const normalizedDefault = defaultModel?.trim()
  if (normalizedDefault && !items.some((item) => item.id === normalizedDefault)) {
    items.unshift({ id: normalizedDefault, label: normalizedDefault, description: 'Configured default model.' })
  }
  return items
}
