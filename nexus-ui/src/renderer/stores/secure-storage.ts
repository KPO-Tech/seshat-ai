import type { PersistStorage } from 'zustand/middleware'

// secureStorage is a Zustand PersistStorage adapter that routes through
// Electron's safeStorage (OS keychain) when available, with a transparent
// localStorage fallback for non-Electron environments (browser dev mode).
export const secureStorage: PersistStorage<unknown> = {
  getItem: async (name: string) => {
    if (typeof window !== 'undefined' && window.nexus?.secureStore) {
      const raw = await window.nexus.secureStore.get(name)
      if (raw == null) return null
      try {
        return JSON.parse(raw)
      } catch {
        return null
      }
    }
    // Browser fallback
    const raw = localStorage.getItem(name)
    if (raw == null) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  },

  setItem: async (name: string, value: unknown) => {
    const serialized = JSON.stringify(value)
    if (typeof window !== 'undefined' && window.nexus?.secureStore) {
      await window.nexus.secureStore.set(name, serialized)
      return
    }
    localStorage.setItem(name, serialized)
  },

  removeItem: async (name: string) => {
    if (typeof window !== 'undefined' && window.nexus?.secureStore) {
      await window.nexus.secureStore.delete(name)
      return
    }
    localStorage.removeItem(name)
  },
}
