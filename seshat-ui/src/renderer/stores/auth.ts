import { create } from 'zustand'
import { useSessionStore } from '@/stores/session'
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

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: null,
  user: null,
  roles: [],
  isAuthenticated: false,
  setSession: (session, token = null) => {
    // A different account's data must never carry over into this session —
    // wipe whatever the previous account (or a stale pre-login fetch) left
    // in the session store before the new account's own data loads in.
    // See useSessionStore.resetAll for why this can't wait for a full app
    // restart to happen naturally.
    const previousUserId = get().user?.id
    if (previousUserId !== session.user.id) {
      useSessionStore.getState().resetAll()
    }
    set({
      token,
      user: session.user,
      roles: session.roles ?? [],
      isAuthenticated: session.isAuthenticated,
    })
  },
  updateUser: (user) => set((state) => ({ ...state, user })),
  logout: () => {
    if (typeof window !== 'undefined' && window.nexus?.auth) {
      void window.nexus.auth.clearSession().catch(() => {
        // noop
      })
    }
    useSessionStore.getState().resetAll()
    set({ token: null, user: null, roles: [], isAuthenticated: false })
  },
}))
