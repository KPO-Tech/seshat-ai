import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'

// Counts only need ListMeta.total, so limit=1 keeps these cheap — the
// server still computes a real COUNT(*) regardless of page size.
export function useOrganizationsCount() {
  return useQuery({
    queryKey: ['dashboard', 'organizations-count'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/organizations', { params: { query: { limit: 1 } } })
      if (error) throw error
      return data.total ?? 0
    },
  })
}

export function useUsersCount() {
  return useQuery({
    queryKey: ['dashboard', 'users-count'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/users', { params: { query: { limit: 1 } } })
      if (error) throw error
      return data.total ?? 0
    },
  })
}

export function useSessionsCount() {
  return useQuery({
    queryKey: ['dashboard', 'sessions-count'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/sessions', { params: { query: { limit: 1 } } })
      if (error) throw error
      return data.total ?? 0
    },
  })
}

export function useRecentAuditEvents(limit: number) {
  return useQuery({
    queryKey: ['dashboard', 'recent-audit-events', limit],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/audit-events', {
        params: { query: { limit, sort: 'created_at', order: 'desc' } },
      })
      if (error) throw error
      return data.audit_events ?? []
    },
  })
}
