import type { ReactNode } from 'react'
import type { SelectorOption } from '@renderer/components/ui/SelectorPill'
import type { ChatAttachment } from '@renderer/components/chat/attachments/attachmentTypes'

export type ChatInputProps = {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop?: () => void
  placeholder?: string
  maxHeight?: number
  isStreaming?: boolean
  statusText?: string
  showInlineStatus?: boolean
  selectedCorpusId?: string | null
  onCorpusChange?: (id: string | null) => void
  projectPath?: string
  onProjectChange?: (path: string) => void
  attachments?: ChatAttachment[]
  onAttachFiles?: (files: FileList) => void | Promise<void>
  onRemoveAttachment?: (id: string) => void
  isUploadingAttachments?: boolean
  attachmentError?: string | null
  // Relocated here from ChatTopBar - Provider/Model live next to where the
  // user actually types. Everything else (mode, permission, agent monitor)
  // stays in ChatTopBar's top-right cluster.
  providerLabel?: string
  modelLabel?: string
  modelIcon?: ReactNode
  onProviderClick?: () => void
  onModelClick?: () => void
  providerOptions?: SelectorOption[]
  modelOptions?: SelectorOption[]
  selectedProviderId?: string | null
  selectedModelId?: string | null
  onProviderSelect?: (id: string) => void
  onModelSelect?: (id: string) => void
  providerDisabled?: boolean
  modelDisabled?: boolean
  modelError?: string | null
  onModelRetry?: () => void
}
