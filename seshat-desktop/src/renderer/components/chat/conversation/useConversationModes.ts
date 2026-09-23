import { useCallback } from 'react'
import { api } from '@renderer/api/client'
import { useSessionStore, type ChatSession } from '@renderer/stores/session'
import type { UIPermissionMode } from '@renderer/stores/ui'

type UseConversationModesArgs = {
  sessionId?: string
  setPermissionMode: (mode: UIPermissionMode) => void
  updateSession: (id: string, patch: Partial<ChatSession>) => void
}

export function useConversationModes({
  sessionId,
  setPermissionMode,
  updateSession,
}: UseConversationModesArgs) {
  const handlePermissionModeSelect = useCallback((mode: UIPermissionMode) => {
    setPermissionMode(mode)
    if (sessionId) {
      void api.patch(`/sessions/${sessionId}`, { permission_mode: mode }).catch(() => {})
    }
  }, [sessionId, setPermissionMode])

  const handleExecutionModeSelect = useCallback((mode: 'execute' | 'plan') => {
    if (!sessionId) return
    useSessionStore.getState().updateAgentState(sessionId, { executionMode: mode })
    void api.patch(`/sessions/${sessionId}`, { execution_mode: mode }).catch(() => {})
  }, [sessionId])

  const handleProjectChange = useCallback((path: string) => {
    if (!sessionId) return
    updateSession(sessionId, { projectPath: path })
    void api.patch(`/sessions/${sessionId}`, { project_path: path }).catch(() => {})
  }, [sessionId, updateSession])

  return {
    handlePermissionModeSelect,
    handleExecutionModeSelect,
    handleProjectChange,
  }
}
