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
  clear: () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    set({ token: null, user: null, organizations: [], memberships: [] })
  },
}))
