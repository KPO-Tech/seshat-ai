import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { BOOTSTRAP_STATUS_KEY } from '@/api/auth'
import type { components } from '@/api/schema'

type Organization = components['schemas']['Organization']
type OrganizationInput = components['schemas']['OrganizationInput']
type OrganizationSharedDomainsInput = components['schemas']['OrganizationSharedDomainsInput']

export interface ListParams {
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

const LIST_KEY = 'organizations'

export function useOrganizationsList(params: ListParams) {
  return useQuery({
    queryKey: [LIST_KEY, params],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/organizations', { params: { query: params } })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}

export function useCreateOrganization() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: OrganizationInput) => {
      const { data, error } = await api.POST('/api/v1/organizations', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LIST_KEY] })
      // useBootstrapStatus (api/auth.ts) is cached with staleTime: Infinity.
      // In single org_mode, creating the deployment's one organization here
      // must flip useOrganizationCreationLocked() to true immediately -
      // without this, the "New organization" button / create-organization
      // route would stay unlocked until a hard reload.
      queryClient.invalidateQueries({ queryKey: BOOTSTRAP_STATUS_KEY })
    },
  })
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: OrganizationInput }) => {
      const { data, error } = await api.PUT('/api/v1/organizations/{organizationID}', {
        params: { path: { organizationID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/organizations/{organizationID}', {
        params: { path: { organizationID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

// Superadmin-only actions, deliberately separate from useUpdateOrganization
// (which any org admin can call to edit their own org's profile fields) -
// these two flags are platform-wide administrative concerns, not part of
// that self-service form.
export function useSetOrganizationDefault() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, isDefault }: { id: string; isDefault: boolean }) => {
      const path = isDefault ? '/api/v1/organizations/{organizationID}/set-default' : '/api/v1/organizations/{organizationID}/unset-default'
      const { data, error } = await api.POST(path, { params: { path: { organizationID: id } } })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export function useSetOrganizationActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const path = isActive ? '/api/v1/organizations/{organizationID}/activate' : '/api/v1/organizations/{organizationID}/deactivate'
      const { data, error } = await api.POST(path, { params: { path: { organizationID: id } } })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

// Superadmin-only, same reasoning as useSetOrganizationDefault/Active above
// - only meaningful while the organization holds is_default, but editable
// independently of that toggle so an admin can prepare the sharing
// selection before (or after) actually flipping is_default on.
export function useSetOrganizationSharedDomains() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: OrganizationSharedDomainsInput }) => {
      const { data, error } = await api.PUT('/api/v1/organizations/{organizationID}/shared-domains', {
        params: { path: { organizationID: id } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [LIST_KEY] }),
  })
}

export type { Organization, OrganizationInput, OrganizationSharedDomainsInput }
