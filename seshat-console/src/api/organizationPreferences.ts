import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type OrganizationPreferences = components['schemas']['OrganizationPreferences']
export type OrganizationPreferencesInput = components['schemas']['OrganizationPreferencesInput']

const ORG_KEY = 'organization-preferences'

// A singleton per organization - see OrganizationPreferences' doc comment
// on the backend. A 404 just means "not configured yet, this org relies on
// the platform default (if any)", not an error to surface loudly. Every
// member's own GET /api/v1/users/me/preferences already reflects the
// resolved effective value (personal, else this org's, else the platform
// default's) - this hook is only for the org-admin-facing editor, which
// needs to see this organization's OWN value, unmerged.

export function useOrganizationPreferences(organizationId: string | undefined) {
  return useQuery({
    queryKey: [ORG_KEY, organizationId],
    enabled: Boolean(organizationId),
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/v1/organization-preferences', {
        params: { query: { organization_id: organizationId! } },
      })
      if (response.status === 404) return null
      if (error) throw error
      return data ?? null
    },
  })
}

export function useSetOrganizationPreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ organizationId, body }: { organizationId: string; body: OrganizationPreferencesInput }) => {
      const { data, error } = await api.PUT('/api/v1/organization-preferences', {
        body: { ...body, organization_id: organizationId },
      })
      if (error) throw error
      return data
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [ORG_KEY, variables.organizationId] })
    },
  })
}

export function useDeleteOrganizationPreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await api.DELETE('/api/v1/organization-preferences', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
    },
    onSuccess: (_data, organizationId) => queryClient.invalidateQueries({ queryKey: [ORG_KEY, organizationId] }),
  })
}
