import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type ScimConnection = components['schemas']['ScimConnection']
export type ScimConnectionWithToken = components['schemas']['ScimConnectionWithToken']
export type ScimConnectionInput = components['schemas']['ScimConnectionInput']
export type ScimConnectionUpdateInput = components['schemas']['ScimConnectionUpdateInput']

const CONNECTION_KEY = 'scim-connection'

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
