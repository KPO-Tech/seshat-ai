import { create } from 'zustand'
import type { User } from '@/api/types'

type SessionSnapshot = {
  user: User
  roles: string[]
  isAuthenticated: boolean
}

type AuthState = {
  token: string | null
  user: User | null
  roles: string[]
  isAuthenticated: boolean
  setSession: (session: SessionSnapshot, token?: string | null) => void
  updateUser: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  user: null,
  roles: [],
  isAuthenticated: false,
  setSession: (session, token = null) => set({
    token,
    user: session.user,
    roles: session.roles ?? [],
    isAuthenticated: session.isAuthenticated,
  }),
  updateUser: (user) => set((state) => ({ ...state, user })),
  logout: () => {
    if (typeof window !== 'undefined' && window.nexus?.auth) {
      void window.nexus.auth.clearSession().catch(() => {
        // noop
      })
    }
    set({ token: null, user: null, roles: [], isAuthenticated: false })
  },
}))
