import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'

type SystemStatus = { mode: 'standalone' | 'connected' }

// Shared behavior behind the Settings/Feedback/Admin entry every app places
// in its own nav footer (Sidebar, AutomationPage's rail, KnowledgePage's
// product nav, ...) - each host owns its own trigger/dropdown markup and
// open/close state (since the visual language differs per app), but the
// "where does each item go, and is Admin actually reachable" logic is one
// shared answer, not one copy per app.
export function useSettingsMenu() {
  const navigate = useNavigate()
  const roles = useAuthStore((s) => s.roles)
  const isAdmin = roles.includes('admin')
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.get<SystemStatus>('/system/status')
      .then((status) => { if (!cancelled) setConnected(status.mode === 'connected') })
      .catch(() => { if (!cancelled) setConnected(false) })
    return () => { cancelled = true }
  }, [])

  function go(kind: 'settings' | 'feedback' | 'admin') {
    if (kind === 'settings') {
      navigate('/settings')
      return
    }
    if (kind === 'admin') {
      if (isAdmin) navigate('/admin')
      return
    }
    window.location.href = 'mailto:feedback@seshat.local?subject=SeshatOS%20feedback'
  }

  return { isAdmin, connected, go }
}
