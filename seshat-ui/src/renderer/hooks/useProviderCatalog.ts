import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { ProviderCatalogEntry } from '@/api/types'

// Module-level cache, not a Zustand store: unlike ProviderSetting (per-user
// state that changes as the user connects/edits providers), this catalog is
// deployment-wide and only changes when seshat-backend itself is upgraded -
// fetch it once per app session and share it across every consumer.
let cached: ProviderCatalogEntry[] | null = null
let inFlight: Promise<ProviderCatalogEntry[]> | null = null

async function loadCatalog(): Promise<ProviderCatalogEntry[]> {
  if (cached) return cached
  if (!inFlight) {
    inFlight = api
      .get<{ providers: ProviderCatalogEntry[]; count: number }>('/models')
      .then((data) => {
        cached = data?.providers ?? []
        return cached
      })
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

export function useProviderCatalog() {
  const [catalog, setCatalog] = useState<ProviderCatalogEntry[]>(cached ?? [])
  const [loading, setLoading] = useState(cached === null)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated || cached) return
    let cancelled = false
    setLoading(true)
    loadCatalog()
      .then((providers) => {
        if (!cancelled) setCatalog(providers)
      })
      .catch(() => {
        // silently handle, same convention as useProviders
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  return { catalog, loading }
}

export function getProviderCatalogEntry(catalog: ProviderCatalogEntry[], provider: string): ProviderCatalogEntry | undefined {
  return catalog.find((entry) => entry.name === provider)
}
