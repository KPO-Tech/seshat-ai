import type { ToolStatus, ToolUseBlock } from '@/api/types'

export type ToolBlockProps = {
  tool: ToolUseBlock
  sessionId?: string
  autoExpand?: boolean
  onApprove?: (toolUseId: string) => void
  onDeny?: (toolUseId: string) => void
  onSubmitPrompt?: (promptId: string, value: unknown) => void
}

export type ToolViewProps = {
  tool: ToolUseBlock
  result: ToolUseBlock['_result']
  status: ToolStatus
  sessionId?: string
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
  // Set for a synthetic question built from a raw confirm-type prompt (no
  // structured `questions` input) - Yes/No render as normal options, but
  // the submitted value must be the boolean the confirm prompt expects, not
  // the literal label text.
  kind?: 'confirm'
}

export type WebSearchHit = {
  title: string
  url: string
  snippet?: string
}
