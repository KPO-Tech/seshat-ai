import { memo } from 'react'
import { Copy, Down } from '@icon-park/react'
import { NexusLogo } from '@/components/NexusLogo'
import { MarkdownView } from '@/components/MarkdownView'
import { useUIStore } from '@/stores/ui'
import { ToolBlock } from './ToolBlock'
import { AgentCardsRow } from './AgentToolView'
import type { Message, ToolUseBlock, ToolStatus } from '@/api/types'

// Mode-switching system tools are handled silently by the Agent Monitor panel.
// They never appear as chat tool blocks.
const MODE_SYSTEM_TOOLS = new Set([
  'enter_plan_mode',
  'exit_plan_mode',
  'enter_pair_programming_mode',
  'exit_pair_programming_mode',
])

// Messages that contain only tool_result blocks are synthetic turn-separator
// messages, not user-visible chat bubbles — skip them entirely.
function isToolResultOnly(msg: Message): boolean {
  return msg.role === 'user' && msg.content.length > 0 && msg.content.every(b => b.type === 'tool_result')
}

export function isRenderableMessage(message: Message): boolean {
  if (isToolResultOnly(message)) return false
  return message.content.some((block) => {
    if (block.type === 'text') return Boolean(block.text.trim())
    if (block.type === 'thinking') return Boolean(block.thinking.trim())
    if (block.type === 'tool_use') return !MODE_SYSTEM_TOOLS.has(block.name)
    return false
  })
}

// ThinkingBlock isolates its own Zustand subscription so toggling one thinking
// block does NOT trigger re-renders in sibling MessageItems.
function ThinkingBlock({ thinkingId, thinking }: { thinkingId: string; thinking: string }) {
  const expanded = useUIStore((s) => s.thinkingExpansion[thinkingId] ?? false)
  const setThinkingExpansion = useUIStore((s) => s.setThinkingExpansion)
  return (
    <div className="msg-bubble msg-bubble--plain msg-thinking">
      <button
        className="msg-thinking-toggle"
        type="button"
        onClick={() => setThinkingExpansion(thinkingId, !expanded)}
        aria-expanded={expanded}
      >
        <span className="msg-thinking-label">THINKING</span>
        <span className={`msg-thinking-chevron${expanded ? ' open' : ''}`}>
          <Down size={12} />
        </span>
      </button>
      {expanded && (
        <div className="msg-thinking-body">
          <MarkdownView>{thinking}</MarkdownView>
        </div>
      )}
    </div>
  )
}

type Props = {
  message: Message
  sessionId?: string
  showAvatar?: boolean
  compact?: boolean
  onApproveTool?: (toolUseId: string) => void
  onDenyTool?: (toolUseId: string) => void
  onSubmitToolPrompt?: (promptId: string, value: unknown) => void
}

// Group consecutive agent tool_use blocks so they can be rendered in a flex row.
// Returns an ordered list of render items: single blocks or agent-group arrays.
type RenderItem =
  | { kind: 'block'; block: Message['content'][number]; index: number }
  | { kind: 'agent-group'; tools: ToolUseBlock[] }

function groupBlocks(blocks: Message['content']): RenderItem[] {
  const items: RenderItem[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]
    if (block.type === 'tool_use' && block.name === 'agent') {
      const group: ToolUseBlock[] = [block]
      let j = i + 1
      while (j < blocks.length && blocks[j].type === 'tool_use' && (blocks[j] as ToolUseBlock).name === 'agent') {
        group.push(blocks[j] as ToolUseBlock)
        j++
      }
      items.push({ kind: 'agent-group', tools: group })
      i = j
    } else {
      items.push({ kind: 'block', block, index: i })
      i++
    }
  }
  return items
}

export const MessageItem = memo(function MessageItem({ message, sessionId, showAvatar = true, compact = false, onApproveTool, onDenyTool, onSubmitToolPrompt }: Props) {
  if (isToolResultOnly(message)) return null

  const isUser = message.role === 'user'
  const visibleBlocks = message.content.filter((block) => {
    if (block.type === 'text') return Boolean(block.text.trim())
    if (block.type === 'thinking') return Boolean(block.thinking.trim())
    if (block.type === 'tool_use') return !MODE_SYSTEM_TOOLS.has(block.name)
    return false
  })
  if (visibleBlocks.length === 0) return null

  const copyText = message.content
    .map((block) => {
      if (block.type === 'text') return block.text
      if (block.type === 'thinking') return block.thinking
      return ''
    })
    .filter(Boolean)
    .join('\n\n')

  const renderItems = groupBlocks(visibleBlocks)

  return (
    <div className={`msg-row ${isUser ? 'user' : 'assistant'}${compact ? ' compact' : ''}`}>
      {!isUser && showAvatar && (
        <div className="msg-agent-icon">
          <NexusLogo size={20} />
        </div>
      )}
      {!isUser && !showAvatar && <div className="msg-agent-spacer" aria-hidden="true" />}

      <div className="msg-content">
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

          const block = item.block
          if (block.type === 'text') {
            return (
              <div key={`${message.id ?? 'msg'}-text-${item.index}`} className={`msg-bubble${isUser ? '' : ' msg-bubble--plain'}`}>
                <MarkdownView>{block.text}</MarkdownView>
              </div>
            )
          }
          if (block.type === 'thinking') {
            const thinkingId = `${message.id ?? 'msg'}-thinking-${item.index}`
            return <ThinkingBlock key={thinkingId} thinkingId={thinkingId} thinking={block.thinking} />
          }
          if (block.type === 'tool_use') {
            return (
              <ToolBlock
                key={block.id || `${message.id ?? 'msg'}-tool-${item.index}`}
                tool={block}
                onApprove={onApproveTool}
                onDeny={onDenyTool}
                onSubmitPrompt={onSubmitToolPrompt}
              />
            )
          }
          if (block.type === 'tool_result') {
            return null
          }
          return null
        })}

        {copyText && (
          <div className="msg-footer">
            <button
              className="msg-action-btn"
              title="Copy"
              type="button"
              onClick={() => {
                if (copyText) void navigator.clipboard.writeText(copyText)
              }}
            >
              <Copy size={14} />
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
  gap: 16px;
  width: 100%;
  align-items: flex-start;
  margin-top: 20px;
}

.msg-row:first-child {
  margin-top: 0;
}

.msg-row.compact {
  margin-top: 6px;
}

.msg-row.user {
  flex-direction: row-reverse;
}

.msg-agent-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 4px;
}

.msg-agent-spacer {
  width: 28px;
  flex-shrink: 0;
}

.msg-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.msg-row.user .msg-content {
  align-items: flex-end;
  max-width: 72%;
}

.msg-bubble {
  font-size: 15px;
  line-height: 1.6;
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
  padding: 10px 16px;
  border-radius: 18px 18px 2px 18px;
  border: 1px solid var(--color-border-subtle);
}

.msg-thinking,
.msg-tool-result {
  color: var(--color-text-secondary);
}

.msg-thinking {
  border-left: 2px solid rgba(239, 124, 47, 0.22);
  padding-left: 14px;
  margin: 0 0 4px;
}

.msg-thinking-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
}

.msg-thinking-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-bottom: 0;
}

.msg-thinking-chevron {
  color: var(--color-text-muted);
  display: inline-flex;
  transition: transform 0.18s ease;
}

.msg-thinking-chevron.open {
  transform: rotate(180deg);
}

.msg-thinking-body {
  font-size: 14px;
  opacity: 0.88;
  margin-top: 6px;
}

.msg-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 2px;
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
  padding: 2px;
  display: flex;
  align-items: center;
  border-radius: 4px;
}

.msg-action-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-secondary);
}
`
