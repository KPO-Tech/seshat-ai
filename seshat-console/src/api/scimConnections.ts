import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type ScimConnection = components['schemas']['ScimConnection']
export type ScimConnectionWithToken = components['schemas']['ScimConnectionWithToken']
export type ScimConnectionInput = components['schemas']['ScimConnectionInput']
export type ScimConnectionUpdateInput = components['schemas']['ScimConnectionUpdateInput']
export type ScimSyncEvent = components['schemas']['ScimSyncEvent']

const CONNECTION_KEY = 'scim-connection'
const EVENTS_KEY = 'scim-connection-events'

// A singleton per organization, like useWebSearchOrgPolicy - not a list.
// `connection` is null (not a 404) when the organization hasn't configured
// SCIM yet, which is the normal, expected state for most organizations.
export function useScimConnection(organizationId: string | undefined) {
  return useQuery({
    queryKey: [CONNECTION_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/scim-connections', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data.connection ?? null
    },
  })
}

export function useCreateScimConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ScimConnectionInput) => {
      const { data, error } = await api.POST('/api/v1/scim-connections', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CONNECTION_KEY] }),
  })
}

export function useUpdateScimConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ organizationId, body }: { organizationId: string; body: ScimConnectionUpdateInput }) => {
      const { data, error } = await api.PUT('/api/v1/scim-connections', {
        params: { query: { organization_id: organizationId } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CONNECTION_KEY] }),
  })
}

export function useDeleteScimConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await api.DELETE('/api/v1/scim-connections', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CONNECTION_KEY] }),
  })
}

// Returns the new raw token - the one and only time it's readable again.
// The caller must show it to the admin immediately (a copyable "reveal
// once" box), the same UX as an Invitation or Device registration token.
export function useRotateScimConnectionToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { data, error } = await api.POST('/api/v1/scim-connections/rotate-token', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [CONNECTION_KEY] }),
  })
}

// The "recent activity" feed - most recent first, backing the same health
// signal as connection.last_sync_at/last_sync_success (see
// useScimConnection). Polled lightly (short staleTime) so the badge and
// feed on ScimSettingsPage stay reasonably fresh without a websocket.
export function useScimSyncEvents(organizationId: string | undefined, limit = 20) {
  return useQuery({
    queryKey: [EVENTS_KEY, organizationId, limit],
    enabled: Boolean(organizationId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/scim-connections/events', {
        params: { query: { organization_id: organizationId, limit } },
      })
      if (error) throw error
      return data
    },
  })
}
