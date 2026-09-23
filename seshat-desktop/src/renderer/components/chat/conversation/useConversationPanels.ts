import { useEffect, useRef } from 'react'
import type { PlanDocument } from '@renderer/api/types'
import type { AgentState, StreamingBlock } from '@renderer/stores/session'
import type { RightPanelPayload } from '@renderer/stores/ui'

type UseConversationPanelsArgs = {
  sessionId?: string
  agentState: AgentState
  streaming: StreamingBlock[]
  monitorOpen: boolean
  browserOpen: boolean
  isPlanPending: boolean
  pendingPlan?: PlanDocument
  openRightPanel: (panel: RightPanelPayload) => void
}

export function useConversationPanels({
  sessionId,
  agentState,
  streaming,
  monitorOpen,
  browserOpen,
  isPlanPending,
  pendingPlan,
  openRightPanel,
}: UseConversationPanelsArgs) {
  const browserToolNavigationRef = useRef<string | null>(null)

  // Keep the agent workspace visible while concrete tool work is happening.
  useEffect(() => {
    if (!sessionId || !agentState.activeTool || monitorOpen || browserOpen) return
    openRightPanel({ kind: 'agent', title: 'Agent Workspace', sessionId })
  }, [agentState.activeTool, browserOpen, monitorOpen, openRightPanel, sessionId])

  useEffect(() => {
    const tool = agentState.activeTool
    if (!tool?.toolName.startsWith('browser_')) return
    if (!monitorOpen && !browserOpen) openRightPanel({ kind: 'agent', title: 'Agent Workspace', sessionId })
    if (tool.toolName !== 'browser_open' && tool.toolName !== 'browser_navigate') return
    const toolBlock = [...streaming].reverse().find((block) => (
      block.type === 'tool_use' &&
      block.name === tool.toolName
    ))
    const input = toolBlock?.type === 'tool_use'
      ? toolBlock.input as Record<string, unknown> | undefined
      : undefined
    const target = typeof input?.url === 'string'
      ? input.url
      : typeof input?.target === 'string'
        ? input.target
        : null
    const navKey = target ? `${tool.toolName}:${target}` : null
    if (target && browserToolNavigationRef.current !== navKey) {
      browserToolNavigationRef.current = navKey
      void window.nexus?.browser?.openUrl(target, 'builtin', sessionId).catch(() => undefined)
    }
  }, [agentState.activeTool, browserOpen, monitorOpen, openRightPanel, sessionId, streaming])

  // Auto-open the plan review panel when the agent calls exit_plan_mode
  // without a structured PlanDocument.
  useEffect(() => {
    if (!sessionId || !isPlanPending || pendingPlan) return
    openRightPanel({ kind: 'plan', title: 'Implementation Plan', sessionId })
  }, [isPlanPending, openRightPanel, pendingPlan, sessionId])

  // Same auto-open for the structured/document-backed path - keyed on the
  // plan's own id so a brand new plan (a fresh submit_plan call, or a
  // revision after feedback) re-surfaces the panel even if it was closed or
  // showing something else, matching the raw-plan behavior above.
  useEffect(() => {
    if (!sessionId || !pendingPlan) return
    openRightPanel({ kind: 'plan', title: 'Implementation Plan', sessionId, planId: pendingPlan.id })
  }, [openRightPanel, pendingPlan?.id, sessionId])
}
