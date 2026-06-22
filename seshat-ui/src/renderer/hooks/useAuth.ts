import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import type { LoginRequest, LoginResponse } from '@/api/types'

export function useAuth() {
  const store = useAuthStore()

  async function login(credentials: LoginRequest) {
    if (window.nexus?.auth) {
      const session = await window.nexus.auth.login(credentials)
      store.setSession(session)
      return session.user
    }

    const res = await api.post<LoginResponse>('/auth/login', credentials)
    store.setSession({ user: res.user, roles: res.roles ?? [], isAuthenticated: true }, res.token)
    return res.user
  }

  async function logout() {
    try {
      if (window.nexus?.auth) {
        await window.nexus.auth.logout()
      } else {
        await api.post('/auth/logout')
      }
    } catch {
      // best-effort
    } finally {
      store.logout()
    }
  }

  return {
    user: store.user,
    isAuthenticated: store.isAuthenticated,
    login,
    logout,
  }
}
