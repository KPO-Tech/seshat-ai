import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/store/auth'

export function useBootstrapStatus() {
  return useQuery({
    queryKey: ['bootstrap-status'],
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/bootstrap/status')
      if (error) throw error
      return data
    },
  })
}

export function useBootstrapPlatform() {
  const setSession = useAuthStore((s) => s.setSession)
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      email: string
      password: string
      display_name: string
      organization_name: string
      organization_slug: string
    }) => {
      const { data, error } = await api.POST('/api/v1/auth/bootstrap', { body })
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      if (data.token && data.user) {
        setSession({
          token: data.token,
          user: data.user,
          organizations: data.organizations ?? [],
          memberships: data.memberships ?? [],
        })
      }
      // BootstrapGate reads this query to decide whether to redirect to
      // /bootstrap - without updating it here, a successful bootstrap still
      // looks like "not initialized" until something else refetches it, and
      // the very next navigation gets bounced straight back to /bootstrap.
      queryClient.setQueryData(['bootstrap-status'], { initialized: true })
    },
  })
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: async (body: { email: string; password: string }) => {
      const { data, error } = await api.POST('/api/v1/auth/login', { body })
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      if (data.token && data.user) {
        setSession({
          token: data.token,
          user: data.user,
          organizations: data.organizations ?? [],
          memberships: data.memberships ?? [],
        })
      }
    },
  })
}

export function useRegister() {
  const setSession = useAuthStore((s) => s.setSession)
  return useMutation({
    mutationFn: async (body: { email: string; password: string; display_name: string }) => {
      const { data, error } = await api.POST('/api/v1/auth/register', { body })
      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      if (data.token && data.user) {
        setSession({
          token: data.token,
          user: data.user,
          organizations: data.organizations ?? [],
          memberships: data.memberships ?? [],
        })
      }
    },
  })
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear)
  return useMutation({
    mutationFn: async () => {
      const { error } = await api.POST('/api/v1/auth/logout')
      if (error) throw error
    },
    onSettled: () => clear(),
  })
}

export function useCurrentPrincipal(enabled: boolean) {
  return useQuery({
    queryKey: ['current-principal'],
    enabled,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/auth/me')
      if (error) throw error
      return data
    },
  })
}
