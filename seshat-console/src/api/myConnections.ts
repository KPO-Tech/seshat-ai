import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { ConnectorAccount } from '@/api/connectors'

const MY_ACCOUNTS_KEY = 'my-connector-accounts'

// Self-service counterpart to useConnectorAccountsList (src/api/connectors.ts)
// - scoped to the caller's own agent_action-purposed accounts, reachable by
// any org member. See connectors.Service.ListMyAccounts's doc comment.
export function useMyConnectorAccountsList(organizationId: string | undefined) {
  return useQuery({
    queryKey: [MY_ACCOUNTS_KEY, organizationId],
    enabled: Boolean(organizationId),
    refetchInterval: 5000, // pick up the OAuth callback's result without a dedicated poll loop
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/connectors/my-accounts', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return (data.connector_accounts ?? []) as ConnectorAccount[]
    },
  })
}

export function useDeleteMyConnectorAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.DELETE('/api/v1/connectors/my-accounts/{accountID}', {
        params: { path: { accountID: id } },
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MY_ACCOUNTS_KEY] }),
  })
}
