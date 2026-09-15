import { useEffect, useState } from 'react'
import { AppShell } from '@renderer/components/layout/AppShell'
import { Login } from '@renderer/pages/Login'
import { Register } from '@renderer/pages/Register'
import { useAuth } from '@renderer/hooks/useAuth'

export function App() {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const { user, isAuthenticated, restoring, restoreSession, logout } = useAuth()

  useEffect(() => {
    void restoreSession()
  }, [])

  if (restoring) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--surface-root)] text-[var(--text-primary)]">
        <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
          <span className="size-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent-primary)]" />
          Restoring session
        </div>
      </main>
    )
  }

  if (!isAuthenticated) {
    return authMode === 'login'
      ? <Login onRegisterClick={() => setAuthMode('register')} />
      : <Register onLoginClick={() => setAuthMode('login')} />
  }

  return <AppShell user={user!} onLogout={() => void logout()} />
}
