import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type Sweep = components['schemas']['Sweep']
export type SweepAreaInput = components['schemas']['SweepAreaInput']
export type Business = components['schemas']['Business']
export type ProspectingSettings = components['schemas']['ProspectingSettings']
export type ProspectingSettingsInput = components['schemas']['ProspectingSettingsInput']

const SETTINGS_KEY = 'prospecting-settings'
const BUSINESSES_KEY = 'prospecting-businesses'
const SWEEPS_KEY = 'prospecting-sweeps'

export function useSweepsList(organizationId: string | undefined) {
  return useQuery({
    queryKey: [SWEEPS_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/prospecting/sweeps', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return { sweeps: (data.sweeps ?? []) as Sweep[], total: data.total ?? 0 }
    },
  })
}

// Starts a new sweep, or continues one (pass sweep_id).
export function useSweepArea() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: SweepAreaInput) => {
      const { data, error } = await api.POST('/api/v1/prospecting/sweeps', { body })
      if (error) throw error
      return data as Sweep
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SWEEPS_KEY] }),
  })
}

export interface SweepBusinessesFilters {
  minScore?: number
  hasPhone?: boolean
  sector?: string
  limit?: number
  offset?: number
}

export function useSweepBusinesses(sweepId: string | undefined, filters: SweepBusinessesFilters = {}) {
  return useQuery({
    queryKey: [BUSINESSES_KEY, sweepId, filters],
    enabled: Boolean(sweepId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/prospecting/sweeps/{sweepID}/businesses', {
        params: {
          path: { sweepID: sweepId! },
          query: {
            min_score: filters.minScore,
            has_phone: filters.hasPhone,
            sector: filters.sector,
            limit: filters.limit,
            offset: filters.offset,
          },
        },
      })
      if (error) throw error
      return { businesses: (data.businesses ?? []) as Business[], total: data.total ?? 0 }
    },
  })
}

export function useProspectingSettings(organizationId: string | undefined) {
  return useQuery({
    queryKey: [SETTINGS_KEY, organizationId],
    enabled: Boolean(organizationId),
    retry: false, // 404 just means "not configured yet" - not a transient failure to retry
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/prospecting/settings', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) {
        if (response?.status === 404) return null
        throw error
      }
      return data as ProspectingSettings
    },
  })
}

export function useSetProspectingSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ organizationId, body }: { organizationId: string; body: ProspectingSettingsInput }) => {
      const { data, error } = await api.PUT('/api/v1/prospecting/settings', {
        params: { query: { organization_id: organizationId } },
        body,
      })
      if (error) throw error
      return data as ProspectingSettings
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [SETTINGS_KEY] }),
  })
}
