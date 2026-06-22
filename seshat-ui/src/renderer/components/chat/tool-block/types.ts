import type { ToolStatus, ToolUseBlock } from '@/api/types'

export type ToolBlockProps = {
  tool: ToolUseBlock
  onApprove?: (toolUseId: string) => void
  onDeny?: (toolUseId: string) => void
  onSubmitPrompt?: (promptId: string, value: unknown) => void
}

export type ToolViewProps = {
  tool: ToolUseBlock
  result: ToolUseBlock['_result']
  status: ToolStatus
}

export type AskUserOption = {
  label: string
  description?: string
  preview?: string
}

export type AskUserQuestion = {
  header: string
  question: string
  options: AskUserOption[]
  multiSelect: boolean
}

export type WebSearchHit = {
  title: string
  url: string
}
