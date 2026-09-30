import { useMutation } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type NetworkDiagnosticsResult = components['schemas']['NetworkDiagnosticsResult']
export type NetworkDiagnosticResult = components['schemas']['NetworkDiagnosticResult']
export type NetworkDiagnosticStep = components['schemas']['NetworkDiagnosticStep']

// A mutation, not a query: running the diagnostic triggers real outbound
// network calls (see internal/server/netdiag), so it should only ever
// happen on an explicit "Run diagnostics" click - never on mount, refetch,
// or window refocus like a normal query would.
export function useRunNetworkDiagnostics() {
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { data, error } = await api.GET('/api/v1/network-diagnostics', {
        params: { query: { organization_id: organizationId } },
      })
      if (error) throw error
      return data
    },
  })
}
