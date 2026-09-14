import { memo, useEffect, useRef, useState } from 'react'
import { Copy, Down, Time, CheckOne } from '@icon-park/react'
import { MarkdownView } from '@/components/MarkdownView'
import { AttachmentTypeIcon } from '@/components/AttachmentTypeIcon'
import { NexusLogo } from '@/components/NexusLogo'
import { api } from '@/api/client'
import { extractOfficeThumbnail } from '@/lib/officeThumbnail'
import { useUIStore } from '@/stores/ui'
import { ToolBlock } from './ToolBlock'
import { PermissionCard } from './PermissionCard'
import { AgentCardsRow } from './AgentToolView'
import { QuietToolGroup } from './QuietToolGroup'
import { breaksGroup } from './tool-block/quietGroupPhrase'
import { isGroupable } from './tool-block/toolDisplay'
import type { Message, ToolUseBlock, ToolStatus } from '@/api/types'
import type { MessageAttachment, StreamingBlock } from '@/stores/session'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// Base look for an attachment tile's clickable surface - border color is
// layered on separately per category (image/documents/other), see
// attachmentBorderClass below.
const ATTACHMENT_THUMB_CSS = 'block h-full w-full cursor-pointer overflow-hidden rounded-app-md border bg-app-bg p-0 text-app-text-secondary'

function attachmentBorderClass(category: string): string {
  if (category === 'image') return 'border-[color-mix(in_srgb,var(--color-primary)_34%,transparent)]'
  if (category === 'documents') return 'border-[color-mix(in_srgb,var(--color-success)_32%,transparent)]'
  return 'border-app-border-subtle'
}

// Tools that never appear as chat tool blocks - each has its own dedicated
// surface elsewhere so an inline line here would just be a redundant second
// copy of the same information:
// - mode-switching tools: silent, handled by the Agent Monitor panel
// - task_create/task_update/task_list: the live task list with per-item
//   status already lives in the Agent Monitor panel (auto-opened on
//   task_create - see Conversation.tsx), which is a far more useful view
//   than a growing wall of "Create Task"/"Update Task" lines for every
//   single item
const HIDDEN_TOOLS = new Set([
  'enter_plan_mode',
  'exit_plan_mode',
  'enter_pair_programming_mode',
  'exit_pair_programming_mode',
  'task_create',
  'task_update',
  'task_list',
])

// Messages that contain only tool_result blocks are synthetic turn-separator
// messages, not user-visible chat bubbles — skip them entirely.
function isToolResultOnly(msg: Message): boolean {
  return msg.role === 'user' && msg.content.length > 0 && msg.content.every(b => b.type === 'tool_result')
}

function messageAttachments(message: Message): MessageAttachment[] {
  const value = message.metadata?.attachments
  if (!Array.isArray(value)) return []
  return value.filter((item): item is MessageAttachment => {
    if (!item || typeof item !== 'object') return false
    const candidate = item as Partial<MessageAttachment>
    return typeof candidate.id === 'string' && typeof candidate.filename === 'string'
  })
}

function formatAttachmentSize(size?: number): string | null {
  if (!size || size <= 0) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

// Genuinely Markdown - safe to interpret headings/lists/etc.
const MD_EXTENSIONS = new Set(['md', 'markdown'])
// Plain text that happens to share the "preview raw bytes directly" fetch
// path with Markdown files, but isn't Markdown - rendering these through
// MarkdownView would misinterpret incidental "#"/"-" characters as syntax.
const PLAIN_TEXT_EXTENSIONS = new Set(['txt', 'csv', 'tsv', 'json', 'yaml', 'yml', 'log'])
const TEXT_PREVIEW_EXTENSIONS = new Set([...MD_EXTENSIONS, ...PLAIN_TEXT_EXTENSIONS])
// Files the backend docling-converts to markdown at upload time (see
// doclingExtensions in seshat-backend/internal/files/types.go) - preview that
// conversion instead of the original (unreadable as raw bytes) binary.
const MARKDOWN_PREVIEW_EXTENSIONS = new Set(['docx', 'pptx', 'xlsx', 'html', 'htm', 'tex'])

function textPreviewKind(filename: string): 'direct' | 'markdown' | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (TEXT_PREVIEW_EXTENSIONS.has(ext)) return 'direct'
  if (MARKDOWN_PREVIEW_EXTENSIONS.has(ext)) return 'markdown'
  return null
}

function isPlainTextFilename(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return PLAIN_TEXT_EXTENSIONS.has(ext)
}

async function fetchTextPreview(fileId: string, kind: 'direct' | 'markdown'): Promise<string> {
  const dataUrl = await api.getFileDataURL(`/files/${fileId}/${kind === 'direct' ? 'content' : 'markdown'}`)
  // Decode the base64 payload directly rather than fetch(dataUrl) - the
  // renderer's CSP connect-src doesn't (and shouldn't need to) allow data:,
  // and this avoids a pointless extra network-stack round-trip anyway.
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}

export function isRenderableMessage(message: Message): boolean {
  if (isToolResultOnly(message)) return false
  if (messageAttachments(message).length > 0) return true
  return message.content.some((block) => {
    if (block.type === 'text') return Boolean(block.text.trim())
    if (block.type === 'thinking') return Boolean(block.thinking.trim())
    if (block.type === 'tool_use') return !HIDDEN_TOOLS.has(block.name)
    return false
  })
}

// ThinkingBlock isolates its own Zustand subscription so toggling one thinking
// block does NOT trigger re-renders in sibling MessageItems.
function ThinkingBlock({
  thinkingId,
  thinking,
  sessionId,
  revealThinking = false,
}: {
  thinkingId: string
  thinking: string
  sessionId?: string
  revealThinking?: boolean
}) {
  const storedExpansion = useUIStore((s) => s.thinkingExpansion[thinkingId])
  const expanded = storedExpansion ?? revealThinking
  const setThinkingExpansion = useUIStore((s) => s.setThinkingExpansion)
  return (
    <div>
      <button
        className={cx(
          'flex min-h-10 w-full cursor-pointer items-center gap-2 border border-app-border-subtle bg-[color-mix(in_srgb,var(--color-surface-elevated)_58%,var(--color-bg))] px-2.5 py-[7px] text-left text-app-text-secondary transition-colors duration-150 hover:border-[color-mix(in_srgb,var(--color-accent)_20%,var(--color-border-subtle))] hover:bg-[color-mix(in_srgb,var(--color-surface-elevated)_74%,var(--color-bg))] hover:text-app-text',
          expanded ? 'rounded-t-md' : 'rounded-md',
        )}
        type="button"
        onClick={() => setThinkingExpansion(thinkingId, !expanded)}
        aria-expanded={expanded}
      >
        <span className={cx('order-3 ml-auto inline-flex opacity-55 transition-transform duration-150', expanded && 'rotate-180')}>
          <Down size={10} />
        </span>
        <span className="inline-flex items-center justify-center text-app-text-muted">
          <Time size={12} />
        </span>
        <span className="text-[12px] font-[650] not-italic text-inherit">Thinking</span>
      </button>
      {expanded && (
        <div className="rounded-b-md border border-t-0 border-app-border-subtle bg-[color-mix(in_srgb,var(--color-bg)_72%,white)] pb-[10px] pl-[39px] pr-3 pt-[9px] text-[11px] not-italic leading-[1.55] text-app-text-muted">
          {/* Reasoning-model summaries (Codex/gpt-5's own reasoning_summary
              text) come back with the model's own markdown structure - a
              bold lead-in line, sometimes a blockquote - which otherwise
              renders at full heading/blockquote weight and blows up what's
              supposed to be a small, muted, italic aside into something
              that looks like its own card. tb-thinking-md neutralizes that
              formatting back down to the same subdued style regardless of
              what markdown the model used. */}
          <MarkdownView className="tb-thinking-md" sessionId={sessionId}>{thinking}</MarkdownView>
        </div>
      )}
    </div>
  )
}

type Props = {
  message: Message
  sessionId?: string
  compact?: boolean
  revealThinking?: boolean
  autoExpandTools?: boolean
  liveActivity?: {
    label: string
    detail?: string
  }
  justCompleted?: boolean
  onApproveTool?: (toolUseId: string, remember?: boolean) => void
  onDenyTool?: (toolUseId: string) => void
  onSubmitToolPrompt?: (promptId: string, value: unknown) => void
  onRetryMessage?: (text: string) => void
}

const AGENT_TOOLS = new Set(['agent', 'spawn_agent'])

export type QuietGroupItem =
  | { kind: 'tool'; tool: ToolUseBlock }
  | { kind: 'thinking'; thinkingId: string; thinking: string }

export type RenderItem =
  | { kind: 'block'; block: Message['content'][number] | StreamingBlock; index: number }
  | { kind: 'agent-group'; tools: ToolUseBlock[] }
  | { kind: 'quiet-group'; items: QuietGroupItem[] }

// A tool_use block from either a persisted Message's content (ContentBlock)
// or the live streaming state (StreamingBlock) - structurally identical
// where it matters (id/name/input/_status/_result/...) so the same grouping
// logic (and the same QuietToolGroup timeline) works for both a finished
// message and a sub-agent's still-streaming activity feed (see
// SubagentPanel.tsx, the other caller of groupBlocks).
type GroupableBlock = Message['content'][number] | StreamingBlock

// messageId is only used to build the same `${messageId}-thinking-${index}`
// id a top-level ThinkingBlock would use for this position, so expansion
// state stays keyed consistently whether a thinking block ends up folded
// into a group or rendered standalone.
export function groupBlocks(blocks: GroupableBlock[], messageId: string): RenderItem[] {
  const items: RenderItem[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]

    if (block.type === 'tool_use' && AGENT_TOOLS.has(block.name)) {
      const group: ToolUseBlock[] = [block]
      let j = i + 1
      while (
        j < blocks.length &&
        blocks[j].type === 'tool_use' &&
        AGENT_TOOLS.has((blocks[j] as ToolUseBlock).name)
      ) {
        group.push(blocks[j] as ToolUseBlock)
        j++
      }
      items.push({ kind: 'agent-group', tools: group })
      i = j
      continue
    }

    if (
      block.type === 'tool_use' &&
      isGroupable(block.name) &&
      !breaksGroup(block)
    ) {
      const group: ToolUseBlock[] = [block]
      let j = i + 1
      while (true) {
        // A `thinking` block sitting between two groupable tool calls is
        // silent reasoning, not a message to the user - it doesn't end the
        // run any more than the tool calls themselves do. Skip over a run
        // of them (there can be more than one) to see if another groupable
        // tool follows; if not, leave j where it was and let them render as
        // normal standalone ThinkingBlocks after the group.
        let k = j
        while (k < blocks.length && blocks[k].type === 'thinking') k++
        if (
          k < blocks.length &&
          blocks[k].type === 'tool_use' &&
          isGroupable((blocks[k] as ToolUseBlock).name) &&
          !breaksGroup(blocks[k] as ToolUseBlock)
        ) {
          group.push(blocks[k] as ToolUseBlock)
          j = k + 1
          continue
        }
        break
      }
      // A lone tool (nothing simultaneous next to it - just text before or
      // after) gets the full standalone card via the normal 'block' path
      // below, not the collapsed quiet-group summary line. Grouping is only
      // useful once there are 2+ tools running back-to-back with no text
      // separating them.
      if (group.length > 1) {
        const groupItems: QuietGroupItem[] = []
        for (let idx = i; idx < j; idx++) {
          const b = blocks[idx]
          if (b.type === 'tool_use') groupItems.push({ kind: 'tool', tool: b })
          else if (b.type === 'thinking') {
            groupItems.push({ kind: 'thinking', thinkingId: `${messageId}-thinking-${idx}`, thinking: b.thinking })
          }
        }
        items.push({ kind: 'quiet-group', items: groupItems })
        i = j
        continue
      }
    }

    items.push({ kind: 'block', block, index: i })
    i++
  }
  return items
}


function isPDFAttachment(file: MessageAttachment): boolean {
  return file.filename.toLowerCase().endsWith('.pdf') || file.content_type === 'application/pdf'
}

// Rendered natively in-browser via docx-preview/exceljs/pptx-preview in the
// default preview mode.
function isDocxAttachment(file: MessageAttachment): boolean {
  return file.filename.toLowerCase().endsWith('.docx')
}

function isXlsxAttachment(file: MessageAttachment): boolean {
  return file.filename.toLowerCase().endsWith('.xlsx')
}

function isPptxAttachment(file: MessageAttachment): boolean {
  return file.filename.toLowerCase().endsWith('.pptx')
}

// DOCX/PPTX/XLSX are all OOXML zip packages that may carry a real embedded
// thumbnail (docProps/thumbnail.*) - see lib/officeThumbnail.ts. Attempting
// extraction on files that don't have one (e.g. agent-generated documents)
// just resolves to null and falls through to the icon fallback below.
function isOfficeZipAttachment(file: MessageAttachment): boolean {
  const ext = file.filename.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'docx' || ext === 'pptx' || ext === 'xlsx'
}

async function fetchOfficeThumbnail(fileId: string): Promise<string | null> {
  const dataUrl = await api.getFileDataURL(`/files/${fileId}/content`)
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return extractOfficeThumbnail(bytes.buffer)
}

const LIVE_ACTIVITY_ROOT_CSS = 'mt-0.5 inline-flex min-w-0 items-center gap-[7px] text-app-text-secondary'
const LIVE_ACTIVITY_TEXT_CSS = 'min-w-0 truncate text-[12px] font-medium text-inherit [animation:msg-live-activity-fade_0.25s_ease]'

function LiveActivityBlock({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className={LIVE_ACTIVITY_ROOT_CSS} aria-live="polite">
      <NexusLogo size={16} className="shrink-0 [animation:msg-live-activity-pulse_1.8s_ease-in-out_infinite]" />
      <span className={LIVE_ACTIVITY_TEXT_CSS} key={`${label}-${detail ?? ''}`}>
        {label}{detail ? ` - ${detail}` : '...'}
      </span>
    </div>
  )
}

// Occupies the LiveActivityBlock's slot for a moment after a turn finishes -
// otherwise "done" is communicated purely by that line vanishing, with no
// acknowledgment the turn actually completed. Its parent clears justCompleted
// after ~1.5s (see Conversation.tsx), so this never needs its own timer.
function CompletionFlash() {
  return (
    <div className={cx(LIVE_ACTIVITY_ROOT_CSS, 'text-app-success [animation:msg-live-activity-fade_0.25s_ease]')} aria-live="polite">
      <CheckOne size={16} theme="filled" className="shrink-0" />
      <span className={LIVE_ACTIVITY_TEXT_CSS}>Done</span>
    </div>
  )
}

export const MessageItem = memo(function MessageItem({ message, sessionId, compact = false, revealThinking = false, autoExpandTools = false, liveActivity, justCompleted = false, onApproveTool, onDenyTool, onSubmitToolPrompt, onRetryMessage }: Props) {
  const isUser = message.role === 'user'
  const attachments = messageAttachments(message)
  const openLightbox = useUIStore((s) => s.openLightbox)
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  // Image attachments carry a client-only blob:/data: URL created at attach
  // time (see Conversation.tsx/Home.tsx's handleAttachFiles) - it stops
  // resolving the moment that renderer process exits, so after a full app
  // restart preview_url is undefined for every image in a reloaded
  // conversation even though the original file bytes are still safely on the
  // server. Rehydrate a fresh data: URL from the file-content endpoint in
  // that case instead of falling back to the generic file icon.
  const hydratingRef = useRef<Set<string>>(new Set())
  const [hydratedPreviews, setHydratedPreviews] = useState<Record<string, string>>({})
  useEffect(() => {
    for (const file of attachments) {
      const isImage = file.category === 'images' || file.content_type?.startsWith('image/')
      const hasPreview = Boolean(file.page_preview_urls?.length || file.preview_url || hydratedPreviews[file.id])
      if (!isImage || hasPreview || hydratingRef.current.has(file.id)) continue
      hydratingRef.current.add(file.id)
      void api.getFileDataURL(`/files/${file.id}/content`)
        .then(dataUrl => setHydratedPreviews(prev => ({ ...prev, [file.id]: dataUrl })))
        .catch(() => {
          // Best-effort - leave the generic file-icon fallback in place.
        })
    }
  })

  // DOCX/PPTX/XLSX often carry a real embedded thumbnail (see
  // lib/officeThumbnail.ts) - try extracting one instead of settling for
  // the icon fallback straight away. Written into the same hydratedPreviews
  // map the image rehydration above uses (both are just "a displayable URL
  // for this file id"), so the render logic below needs no extra branch.
  useEffect(() => {
    for (const file of attachments) {
      const hasPreview = Boolean(file.page_preview_urls?.length || file.preview_url || hydratedPreviews[file.id])
      if (!isOfficeZipAttachment(file) || hasPreview || hydratingRef.current.has(file.id)) continue
      hydratingRef.current.add(file.id)
      void fetchOfficeThumbnail(file.id)
        .then(url => {
          if (url) setHydratedPreviews(prev => ({ ...prev, [file.id]: url }))
        })
        .catch(() => {
          // Best-effort - leave the icon fallback in place.
        })
    }
  })

  // Text preview for types with no image render (MD/TXT/CSV/... - their own
  // content; DOCX/PPTX/XLSX/HTML/TEX - the docling markdown conversion the
  // backend already generated at upload time). A 404 (no conversion
  // available) just leaves the extension-badge fallback in place.
  const textPreviewFetchedRef = useRef<Set<string>>(new Set())
  const [textPreviews, setTextPreviews] = useState<Record<string, string>>({})
  useEffect(() => {
    for (const file of attachments) {
      const kind = textPreviewKind(file.filename)
      if (!kind || textPreviewFetchedRef.current.has(file.id)) continue
      textPreviewFetchedRef.current.add(file.id)
      void fetchTextPreview(file.id, kind)
        .then(text => setTextPreviews(prev => ({ ...prev, [file.id]: text })))
        .catch(() => {})
    }
  })
  if (isToolResultOnly(message)) return null
  const visibleBlocks = message.content.filter((block) => {
    if (block.type === 'text') return Boolean(block.text.trim())
    if (block.type === 'thinking') return Boolean(block.thinking.trim())
    if (block.type === 'tool_use') return !HIDDEN_TOOLS.has(block.name)
    return false
  })
  if (visibleBlocks.length === 0 && attachments.length === 0 && !liveActivity && !justCompleted) return null
  const hasVisibleTool = visibleBlocks.some((block) => block.type === 'tool_use')

  const copyText = message.content
    .map((block) => {
      if (block.type === 'text') return block.text
      return ''
    })
    .filter(Boolean)
    .join('\n\n')

  const renderItems = groupBlocks(visibleBlocks, message.id ?? 'msg')

  return (
    <div
      className={cx(
        'group flex w-full items-start gap-3 first:mt-0',
        compact ? 'mt-2' : 'mt-[22px]',
        isUser && 'flex-row-reverse',
      )}
    >
      <style>{THINKING_MARKDOWN_CSS}</style>
      <div className={cx('flex min-w-0 flex-1 flex-col gap-1.5', isUser && 'max-w-[85%] items-end')}>
        {attachments.length > 0 && (
          <div className="flex max-w-full flex-nowrap gap-2 overflow-x-auto justify-end px-0.5 py-[5px]">
            {attachments.map((file) => {
              const isImage = file.category === 'images' || file.content_type?.startsWith('image/')
              const previewURL = file.page_preview_urls?.[0] ?? file.preview_url ?? hydratedPreviews[file.id]
              const textPreview = !previewURL ? textPreviews[file.id] : undefined
              const sizeLabel = formatAttachmentSize(file.size)
              const extLabel = file.filename.split('.').pop()?.toUpperCase() ?? ''
              const tooltip = [file.filename, sizeLabel].filter(Boolean).join(' - ')
              const isPDF = isPDFAttachment(file)
              const isDocx = isDocxAttachment(file)
              const isXlsx = isXlsxAttachment(file)
              const isPptx = isPptxAttachment(file)
              function onOpen() {
                if (isImage && previewURL) {
                  openLightbox({ url: previewURL, filename: file.filename })
                } else if (isPDF) {
                  openRightPanel({ kind: 'pdf', title: file.filename, documentFileId: file.id })
                } else if (isDocx) {
                  openRightPanel({ kind: 'docx', title: file.filename, documentFileId: file.id })
                } else if (isXlsx) {
                  openRightPanel({ kind: 'xlsx', title: file.filename, documentFileId: file.id })
                } else if (isPptx) {
                  openRightPanel({ kind: 'pptx', title: file.filename, documentFileId: file.id, markdown: textPreview })
                } else if (textPreview) {
                  openRightPanel({
                    kind: 'markdown',
                    title: file.filename,
                    markdown: textPreview,
                    documentFileId: file.id,
                    plainText: isPlainTextFilename(file.filename),
                  })
                } else if (file.local_path) {
                  void window.nexus?.openPath?.(file.local_path)
                }
              }
              const category = isImage ? 'image' : file.category ?? 'other'
              const borderClass = attachmentBorderClass(category)
              return (
                <div key={file.id} className="relative size-12 shrink-0">
                  {previewURL ? (
                    <button className={cx(ATTACHMENT_THUMB_CSS, borderClass)} type="button" onClick={onOpen} aria-label={tooltip}>
                      <img className="block h-full w-full object-cover" src={previewURL} alt={file.filename} />
                    </button>
                  ) : textPreview ? (
                    <button className={cx(ATTACHMENT_THUMB_CSS, borderClass, 'px-[5px] py-1 text-left')} type="button" onClick={onOpen}>
                      <span className="line-clamp-[7] overflow-hidden whitespace-pre-wrap break-words font-mono text-[6px] leading-[1.3] text-app-text-muted">{textPreview}</span>
                    </button>
                  ) : (
                    <button className={cx(ATTACHMENT_THUMB_CSS, borderClass, 'flex items-center justify-center')} type="button" onClick={onOpen} aria-label={tooltip || file.filename}>
                      <AttachmentTypeIcon filename={file.filename} />
                    </button>
                  )}
                  {extLabel && (
                    <span className="pointer-events-none absolute bottom-[3px] left-[3px] rounded-app-xs bg-[rgba(0,0,0,0.72)] px-1 py-px text-[8px] font-extrabold tracking-[0.02em] text-white">{extLabel}</span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {renderItems.map((item, i) => {
          if (item.kind === 'agent-group') {
            return (
              <AgentCardsRow
                key={`${message.id ?? 'msg'}-agents-${i}`}
                tools={item.tools}
                sessionId={sessionId ?? ''}
                getStatus={(tool) => {
                  const status = tool._status
                  return (status ?? (tool._result ? (tool._result.isError ? 'failed' : 'completed') : 'running')) as ToolStatus
                }}
              />
            )
          }

          if (item.kind === 'quiet-group') {
            const firstToolId = item.items.find((it) => it.kind === 'tool')?.tool.id
            return (
              <QuietToolGroup
                key={firstToolId || `${message.id ?? 'msg'}-quiet-${i}`}
                items={item.items}
                sessionId={sessionId}
                revealThinking={revealThinking}
                autoExpandTools={autoExpandTools}
                onSubmitPrompt={onSubmitToolPrompt}
              />
            )
          }

          const block = item.block
          if (block.type === 'text') {
            return (
              <div
                key={`${message.id ?? 'msg'}-text-${item.index}`}
                className={cx(
                  'text-[14px] leading-[1.62] text-app-text',
                  isUser
                    ? 'rounded-[12px_12px_4px_12px] border border-app-border-subtle bg-app-surface px-[11px] py-[7px]'
                    : 'rounded-none border-0 bg-transparent p-0',
                  isUser && message.status === 'sending' && 'opacity-55',
                  isUser && message.status === 'error' && 'border-app-error',
                )}
              >
                <MarkdownView sessionId={sessionId}>{block.text}</MarkdownView>
                {isUser && message.status === 'error' && (
                  <button
                    type="button"
                    className="mt-1.5 block cursor-pointer border-0 bg-none p-0 text-left text-[12px] font-medium text-app-error hover:underline"
                    onClick={() => onRetryMessage?.(block.text)}
                  >
                    Failed to send · Retry
                  </button>
                )}
              </div>
            )
          }
          if (block.type === 'thinking') {
            const thinkingId = `${message.id ?? 'msg'}-thinking-${item.index}`
            return <ThinkingBlock key={thinkingId} thinkingId={thinkingId} thinking={block.thinking} sessionId={sessionId} revealThinking={revealThinking} />
          }
          if (block.type === 'tool_use') {
            const key = block.id || `${message.id ?? 'msg'}-tool-${item.index}`
            if (block._status === 'awaiting_approval') {
              return (
                <PermissionCard
                  key={key}
                  tool={block}
                  onApprove={onApproveTool}
                  onDeny={onDenyTool}
                />
              )
            }
            return (
              <ToolBlock
                key={key}
                tool={block}
                sessionId={sessionId}
                autoExpand={autoExpandTools}
                onSubmitPrompt={onSubmitToolPrompt}
              />
            )
          }
          if (block.type === 'tool_result') {
            return null
          }
          return null
        })}

        {liveActivity && <LiveActivityBlock label={liveActivity.label} detail={liveActivity.detail} />}
        {!liveActivity && justCompleted && <CompletionFlash />}

        {copyText && !hasVisibleTool && (
          <div className={cx('mt-0.5 flex items-center gap-[7px] opacity-0 transition-opacity duration-200 group-hover:opacity-100', isUser && 'flex-row-reverse')}>
            <button
              className="flex cursor-pointer items-center rounded-app-xs border-0 bg-transparent p-0.5 text-app-text-muted hover:bg-[var(--color-hover)] hover:text-app-text-secondary"
              aria-label="Copy"
              type="button"
              onClick={() => {
                if (copyText) void navigator.clipboard.writeText(copyText)
              }}
            >
              <Copy size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

// Same neutralizing rules as QuietToolGroup.tsx's ThinkingGroupItem -
// duplicated (not shared) since either component can be the only one
// mounted on a given page, and a plain <style> tag's rules are global the
// moment either copy lands in the DOM.
const THINKING_MARKDOWN_CSS = `
.tb-thinking-md h1, .tb-thinking-md h2, .tb-thinking-md h3 {
  margin: 0 0 4px;
  font-size: inherit;
  font-weight: 600;
  color: inherit;
}

.tb-thinking-md strong { font-weight: 600; }

.tb-thinking-md blockquote {
  margin: 4px 0;
  padding-left: 8px;
  border-left: 2px solid var(--color-border-subtle);
  color: inherit;
}

.tb-thinking-md p { margin: 0 0 6px; }
.tb-thinking-md p:last-child { margin-bottom: 0; }
`
