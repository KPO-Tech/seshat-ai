import { create } from 'zustand'
import type { AuthSession, User } from '@renderer/api/types'

type AuthState = {
  token: string | null
  user: User | null
  roles: string[]
  isAuthenticated: boolean
  restoring: boolean
  setRestoring: (restoring: boolean) => void
  setSession: (session: AuthSession, token?: string | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  user: null,
  roles: [],
  isAuthenticated: false,
  restoring: true,
  setRestoring: (restoring) => set({ restoring }),
  setSession: (session, token = null) => set({
    token,
    user: session.user,
    roles: session.roles ?? [],
    isAuthenticated: session.isAuthenticated,
    restoring: false
  }),
  logout: () => {
    if (typeof window !== 'undefined' && window.nexus?.auth) {
      void window.nexus.auth.clearSession().catch(() => {
        // best-effort
      })
    }
    set({ token: null, user: null, roles: [], isAuthenticated: false, restoring: false })
  }
}))
