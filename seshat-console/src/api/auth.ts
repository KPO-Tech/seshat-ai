import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/store/auth'

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

export function useForgotPassword() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await api.POST('/api/v1/auth/forgot-password', { body: { email } })
      if (error) throw error
      return data
    },
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async (body: { token: string; new_password: string }) => {
      const { error } = await api.POST('/api/v1/auth/reset-password', { body })
      if (error) throw error
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: { current_password: string; new_password: string }) => {
      const { error } = await api.PUT('/api/v1/users/me/password', { body })
      if (error) throw error
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
