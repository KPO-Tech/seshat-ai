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
    <div className="msg-thinking">
      <button
        className={`msg-thinking-toggle${expanded ? ' open' : ''}`}
        type="button"
        onClick={() => setThinkingExpansion(thinkingId, !expanded)}
        aria-expanded={expanded}
      >
        <span className={`msg-thinking-chevron${expanded ? ' open' : ''}`}>
          <Down size={10} />
        </span>
        <span className="msg-thinking-icon">
          <Time size={12} />
        </span>
        <span className="msg-thinking-label">Thinking</span>
      </button>
      {expanded && (
        <div className="msg-thinking-body">
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

function LiveActivityBlock({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="msg-live-activity" aria-live="polite">
      <NexusLogo size={16} className="msg-live-activity-logo" />
      <span className="msg-live-activity-text" key={`${label}-${detail ?? ''}`}>
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
    <div className="msg-live-activity msg-completion-flash" aria-live="polite">
      <CheckOne size={16} theme="filled" className="msg-completion-flash-icon" />
      <span className="msg-live-activity-text">Done</span>
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
    <div className={`msg-row ${isUser ? 'user' : 'assistant'}${compact ? ' compact' : ''}`}>
      <div className="msg-content">
        {attachments.length > 0 && (
          <div className="msg-attachments">
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
              return (
                <div key={file.id} className={`msg-attachment msg-attachment--${isImage ? 'image' : file.category ?? 'other'}`}>
                  {previewURL ? (
                    <button className="msg-attachment-thumb" type="button" onClick={onOpen} aria-label={tooltip}>
                      <img src={previewURL} alt={file.filename} />
                    </button>
                  ) : textPreview ? (
                    <button className="msg-attachment-thumb msg-attachment-thumb--text" type="button" onClick={onOpen}>
                      <span className="msg-attachment-text-preview">{textPreview}</span>
                    </button>
                  ) : (
                    <button className="msg-attachment-file" type="button" onClick={onOpen} aria-label={tooltip || file.filename}>
                      <AttachmentTypeIcon filename={file.filename} />
                    </button>
                  )}
                  {extLabel && <span className="msg-attachment-thumb-badge">{extLabel}</span>}
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
            const statusClass = isUser && message.status === 'sending' ? ' msg-bubble--sending' : isUser && message.status === 'error' ? ' msg-bubble--failed' : ''
            return (
              <div key={`${message.id ?? 'msg'}-text-${item.index}`} className={`msg-bubble${isUser ? '' : ' msg-bubble--plain'}${statusClass}`}>
                <MarkdownView sessionId={sessionId}>{block.text}</MarkdownView>
                {isUser && message.status === 'error' && (
                  <button
                    type="button"
                    className="msg-retry-btn"
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
          <div className="msg-footer">
            <button
              className="msg-action-btn"
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

export const MESSAGE_ITEM_CSS = `
.msg-row {
  display: flex;
  gap: 12px;
  width: 100%;
  align-items: flex-start;
  margin-top: 22px;
}

.msg-row:first-child {
  margin-top: 0;
}

.msg-row.compact {
  margin-top: 8px;
}

.msg-row.user {
  flex-direction: row-reverse;
}

.msg-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.msg-row.user .msg-content {
  align-items: flex-end;
  max-width: 85%;
}

.msg-bubble {
  font-size: 14px;
  line-height: 1.62;
  color: var(--color-text);
}

.msg-bubble--plain {
  background: transparent;
  padding: 0;
  border: none;
  border-radius: 0;
}

.msg-row.user .msg-bubble {
  background: var(--color-surface);
  padding: 7px 11px;
  border-radius: 12px 12px 4px 12px;
  border: 1px solid var(--color-border-subtle);
}

.msg-bubble--sending {
  opacity: 0.55;
}

.msg-bubble--failed {
  border-color: var(--color-error);
}

.msg-retry-btn {
  display: block;
  margin-top: 6px;
  padding: 0;
  background: none;
  border: none;
  color: var(--color-error);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}

.msg-retry-btn:hover {
  text-decoration: underline;
}

.msg-attachments {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  justify-content: flex-end;
  gap: 8px;
  max-width: 100%;
  padding: 5px 2px;
}

.msg-attachment {
  position: relative;
  flex-shrink: 0;
  width: 48px;
  height: 48px;
}

.msg-attachment--image .msg-attachment-thumb,
.msg-attachment--image .msg-attachment-file {
  border-color: color-mix(in srgb, var(--color-primary) 34%, transparent);
}

.msg-attachment--documents .msg-attachment-thumb,
.msg-attachment--documents .msg-attachment-file {
  border-color: color-mix(in srgb, var(--color-success) 32%, transparent);
}

.msg-attachment-thumb,
.msg-attachment-file {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border-subtle);
  background: var(--color-bg);
  color: var(--color-text-secondary);
  overflow: hidden;
  cursor: pointer;
  padding: 0;
}

.msg-attachment-file {
  display: flex;
  align-items: center;
  justify-content: center;
}

.msg-attachment-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.msg-attachment-thumb--text {
  padding: 4px 5px;
  text-align: left;
}

.msg-attachment-text-preview {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 7;
  overflow: hidden;
  font-family: var(--font-mono, monospace);
  font-size: 6px;
  line-height: 1.3;
  color: var(--color-text-muted);
  white-space: pre-wrap;
  word-break: break-word;
}

.msg-attachment-thumb-badge {
  position: absolute;
  left: 3px;
  bottom: 3px;
  background: rgba(0, 0, 0, 0.72);
  color: white;
  border-radius: var(--radius-xs);
  padding: 1px var(--space-2);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.02em;
  pointer-events: none;
}

.msg-tool-result {
  color: var(--color-text-secondary);
}

.msg-thinking {
  margin: 0;
}

.msg-thinking-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  background: color-mix(in srgb, var(--color-surface-elevated) 58%, var(--color-bg));
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  padding: 7px 10px;
  cursor: pointer;
  color: var(--color-text-secondary);
  text-align: left;
}

.msg-thinking-toggle:hover {
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-surface-elevated) 74%, var(--color-bg));
  border-color: color-mix(in srgb, var(--color-accent) 20%, var(--color-border-subtle));
}

.msg-thinking-toggle.open {
  border-radius: 6px 6px 0 0;
}

.msg-thinking-label {
  font-size: 12px;
  color: inherit;
  font-style: normal;
  font-weight: 650;
}

.msg-thinking-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

.msg-thinking-chevron {
  display: inline-flex;
  color: inherit;
  opacity: 0.55;
  transition: transform 0.15s ease;
  margin-left: auto;
  order: 3;
}

.msg-thinking-chevron.open {
  transform: rotate(180deg);
}

.msg-thinking-body {
  margin-top: 0;
  padding: 9px 12px 10px 39px;
  border: 1px solid var(--color-border-subtle);
  border-top: none;
  border-radius: 0 0 6px 6px;
  background: color-mix(in srgb, var(--color-bg) 72%, white);
  font-size: 11px;
  font-style: normal;
  color: var(--color-text-muted);
  line-height: 1.55;
}

/* Neutralizes the model's own markdown structure (bold lead-ins, headings,
   blockquotes - reasoning-summary providers like Codex format their summary
   this way) back down to the same small/muted look as the rest of
   the thinking body, instead of a nested heading/blockquote fighting for
   attention with its own border and full-brightness text. */
.tb-thinking-md h1, .tb-thinking-md h2, .tb-thinking-md h3 {
  margin: 0 0 var(--space-2);
  font-size: inherit;
  font-weight: 600;
  color: inherit;
}

.tb-thinking-md strong { font-weight: 600; }

.tb-thinking-md blockquote {
  margin: var(--space-2) 0;
  padding-left: var(--space-4);
  border-left: 2px solid var(--color-border-subtle);
  color: inherit;
}

.tb-thinking-md p { margin: 0 0 var(--space-3); }
.tb-thinking-md p:last-child { margin-bottom: 0; }

.msg-live-activity {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 2px 0 0;
  color: var(--color-text-secondary);
  min-width: 0;
}

.msg-live-activity-logo {
  flex-shrink: 0;
  animation: msg-live-activity-pulse 1.8s ease-in-out infinite;
}

@keyframes msg-live-activity-pulse {
  0%, 100% { opacity: 0.5; transform: scale(0.88); }
  50%      { opacity: 1;   transform: scale(1); }
}

.msg-live-activity-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  color: inherit;
  animation: msg-live-activity-fade 0.25s ease;
}

.msg-completion-flash {
  color: var(--color-success);
  animation: msg-live-activity-fade 0.25s ease;
}

.msg-completion-flash-icon {
  flex-shrink: 0;
}

@keyframes msg-live-activity-fade {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 1; transform: translateY(0); }
}

.msg-footer {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: var(--space-1);
  opacity: 0;
  transition: opacity 0.2s;
}

.msg-row:hover .msg-footer {
  opacity: 1;
}

.msg-row.user .msg-footer {
  flex-direction: row-reverse;
}

.msg-action-btn {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: var(--space-1);
  display: flex;
  align-items: center;
  border-radius: var(--radius-xs);
}

.msg-action-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-secondary);
}
`
