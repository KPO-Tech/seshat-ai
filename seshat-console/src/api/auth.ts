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

// BOOTSTRAP_STATUS_KEY is exported so useCreateOrganization (api/organizations.ts)
// can invalidate this exact cache entry after creating the deployment's
// (possibly only, in single org_mode) organization — see
// useOrganizationCreationLocked below.
export const BOOTSTRAP_STATUS_KEY = ['bootstrap-status']

/**
 * Whether this seshat-server has ever had a platform admin created — public,
 * unauthenticated, and safe to call before any session exists. Used to
 * decide whether to route a fresh visitor to /bootstrap instead of /login.
 */
export function useBootstrapStatus() {
  return useQuery({
    queryKey: BOOTSTRAP_STATUS_KEY,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/bootstrap/status')
      if (error) throw error
      return data
    },
    // Once a platform is initialized it never goes back — no point
    // refetching this on every focus/mount the way session-bound queries do.
    // has_organization CAN flip false -> true within that same lifetime
    // (single org_mode, before the deployment's one org is created yet) —
    // useCreateOrganization's onSuccess invalidates this key explicitly for
    // that case rather than shortening staleTime for everyone.
    staleTime: Infinity,
  })
}

/**
 * True once this deployment's single organization slot is taken — i.e.
 * org_mode is "single" and an organization already exists. Used to hide/
 * disable the two "create organization" UI surfaces (CreateOrganizationPage,
 * OrganizationsPage's "New organization") before the user hits a 409 from
 * the server, which remains the real enforcement point either way.
 */
export function useOrganizationCreationLocked() {
  const bootstrapStatus = useBootstrapStatus()
  return (
    bootstrapStatus.isSuccess &&
    bootstrapStatus.data?.org_mode === 'single' &&
    bootstrapStatus.data?.has_organization === true
  )
}

/**
 * One-time-only: creates the first platform admin and their organization
 * together. The server itself enforces "only when no users exist yet" —
 * this call fails once bootstrapped, same shape as every other guard in this
 * codebase (the client never re-implements a server-side invariant).
 */
export function useBootstrap() {
  const setSession = useAuthStore((s) => s.setSession)
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
    // Re-checked periodically (and on tab refocus), not just once per tab
    // lifetime: this session's roles/memberships can change server-side
    // (an admin demotes or removes this user) without anything in this tab
    // forcing a refetch otherwise. A stale local copy previously meant a
    // revoked user kept navigating a UI that looked fully functional until a
    // hard refresh — see the 2026-08-06 audit. A failed background refetch
    // here doesn't sign the user out on its own (network blips shouldn't);
    // a real 401 does, via api/client.ts's global response interceptor.
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await api.GET('/api/v1/auth/me')
      if (error) throw error
      return data
    },
  })
}
