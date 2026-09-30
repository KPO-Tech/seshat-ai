import { create } from 'zustand'
import type { components } from '@/api/schema'

type User = components['schemas']['User']
type Organization = components['schemas']['Organization']
type Membership = components['schemas']['Membership']

const TOKEN_STORAGE_KEY = 'seshat-console:token'

interface AuthState {
  token: string | null
  user: User | null
  organizations: Organization[]
  memberships: Membership[]
  setSession: (session: {
    token: string
    user: User
    organizations: Organization[]
    memberships: Membership[]
  }) => void
  /**
   * Persists just the bearer token, leaving user/organizations/memberships
   * unset - used by SSOCallbackPage, which only ever receives a raw token
   * from the OIDC/SAML redirect. ProtectedRoute's own useCurrentPrincipal
   * call (already run unconditionally whenever a token exists) hydrates
   * the rest via /auth/me, exactly the same bootstrapping a page refresh
   * after a normal login already relies on.
   */
  setToken: (token: string) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_STORAGE_KEY),
  user: null,
  organizations: [],
  memberships: [],
  setSession: ({ token, user, organizations, memberships }) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
    set({ token, user, organizations, memberships })
  },
  setToken: (token) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
    set({ token })
  },
  clear: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    set({ token: null, user: null, organizations: [], memberships: [] })
  },
}))
