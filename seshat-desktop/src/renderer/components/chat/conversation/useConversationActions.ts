import { useCallback } from 'react'
import type { ChatSession } from '@renderer/stores/session'
import { buildRightPanelId, type RightPanelKind, type RightPanelPayload } from '@renderer/stores/ui'
import { deleteSession } from '@renderer/lib/deleteSession'
import { conversationFileName, serializeConversationMarkdown } from '@renderer/lib/conversationExport'

type OpenRightPanel = (panel: RightPanelPayload) => void
type CloseRightPanel = (id: string) => void

type UseConversationActionsArgs = {
  sessionId?: string
  session?: ChatSession
  monitorOpen: boolean
  browserOpen: boolean
  openRightPanel: OpenRightPanel
  closeRightPanel: CloseRightPanel
  navigateHome: () => void
}

function rightPanelId(kind: RightPanelKind, sessionId?: string): string {
  return buildRightPanelId({ kind, sessionId })
}

export function useConversationActions({
  sessionId,
  session,
  monitorOpen,
  browserOpen,
  openRightPanel,
  closeRightPanel,
  navigateHome,
}: UseConversationActionsArgs) {
  const toggleMonitor = useCallback(() => {
    if (monitorOpen) {
      closeRightPanel(rightPanelId('agent', sessionId))
    } else {
      openRightPanel({ kind: 'agent', title: 'Agent Monitor', sessionId })
    }
  }, [closeRightPanel, monitorOpen, openRightPanel, sessionId])

  const toggleBrowser = useCallback(() => {
    if (browserOpen) {
      closeRightPanel(rightPanelId('browser', sessionId))
    } else {
      openRightPanel({ kind: 'browser', title: 'Browser', sessionId })
    }
  }, [browserOpen, closeRightPanel, openRightPanel, sessionId])

  const handleDelete = useCallback(async () => {
    if (!sessionId) return
    await deleteSession(sessionId).catch(() => {})
    navigateHome()
  }, [navigateHome, sessionId])

  const handleExport = useCallback(async () => {
    if (!session) return
    const markdown = serializeConversationMarkdown(session)
    await window.nexus?.saveFile?.(conversationFileName(session), markdown).catch(() => {})
  }, [session])

  const handleShare = useCallback(async () => {
    if (!session) return
    const markdown = serializeConversationMarkdown(session)
    await navigator.clipboard.writeText(markdown).catch(() => {})
  }, [session])

  return {
    toggleMonitor,
    toggleBrowser,
    handleDelete,
    handleExport,
    handleShare,
  }
}
