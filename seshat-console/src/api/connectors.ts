import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type ConnectorAccount = components['schemas']['ConnectorAccount']
export type ConnectorAccountInput = components['schemas']['ConnectorAccountInput']
export type ConnectorSyncJob = components['schemas']['ConnectorSyncJob']
export type ConnectorOAuthApp = components['schemas']['ConnectorOAuthApp']
export type ConnectorOAuthAppInput = components['schemas']['ConnectorOAuthAppInput']
export type BeginConnectorOAuthInput = components['schemas']['BeginConnectorOAuthInput']

const ACCOUNTS_KEY = 'connector-accounts'
const SYNC_JOBS_KEY = 'connector-sync-jobs'
const OAUTH_APPS_KEY = 'connector-oauth-apps'

export type OAuthConnectorKind = 'gdrive' | 'sharepoint'

export function useConnectorAccountsList(organizationId: string | undefined) {
  return useQuery({
    queryKey: [ACCOUNTS_KEY, organizationId],
    enabled: Boolean(organizationId),
    refetchInterval: 5000, // sync status/last_synced_at changes in the background
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/connectors/accounts', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data.connector_accounts ?? []
    },
  })
}

export function useCreateConnectorAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: ConnectorAccountInput) => {
      const { data, error } = await api.POST('/api/v1/connectors/accounts', { body })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ACCOUNTS_KEY] }),
  })
}

export function useDeleteConnectorAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/connectors/accounts/{accountID}', {
        params: { path: { accountID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ACCOUNTS_KEY] }),
  })
}

export function useTriggerConnectorSync() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (accountId: string) => {
      const { data, error } = await api.POST('/api/v1/connectors/accounts/{accountID}/sync', {
        params: { path: { accountID: accountId } },
      })
      if (error) throw error
      return data
    },
    onSuccess: (_data, accountId) => {
      queryClient.invalidateQueries({ queryKey: [ACCOUNTS_KEY] })
      queryClient.invalidateQueries({ queryKey: [SYNC_JOBS_KEY, accountId] })
    },
  })
}

export function useConnectorSyncJobs(accountId: string | undefined) {
  return useQuery({
    queryKey: [SYNC_JOBS_KEY, accountId],
    enabled: Boolean(accountId),
    refetchInterval: 3000, // sync runs in the background - poll for status changes
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/connectors/accounts/{accountID}/sync-jobs', {
        params: { path: { accountID: accountId! } },
      })
      if (error) throw error
      return data.sync_jobs ?? []
    },
  })
}

export function useOAuthAppsList(organizationId: string | undefined) {
  return useQuery({
    queryKey: [OAUTH_APPS_KEY, organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/connectors/oauth-apps', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data.oauth_apps ?? []
    },
  })
}

export function useRegisterOAuthApp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ kind, body }: { kind: OAuthConnectorKind; body: ConnectorOAuthAppInput }) => {
      const { data, error } = await api.PUT('/api/v1/connectors/oauth-apps/{kind}', {
        params: { path: { kind } },
        body,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [OAUTH_APPS_KEY] }),
  })
}

// Returns the URL to open in a new tab - the resulting ConnectorAccount is
// created by the OAuth callback once the user completes the provider's
// consent screen, not by this call, so callers should also invalidate
// ACCOUNTS_KEY after the popup closes (polling already does this via
// useConnectorAccountsList's refetchInterval).
export function useBeginConnectorOAuth() {
  return useMutation({
    mutationFn: async ({ kind, body }: { kind: OAuthConnectorKind; body: BeginConnectorOAuthInput }) => {
      const { data, error } = await api.POST('/api/v1/connectors/{kind}/oauth/start', {
        params: { path: { kind } },
        body,
      })
      if (error) throw error
      return data.authorization_url!
    },
  })
}
