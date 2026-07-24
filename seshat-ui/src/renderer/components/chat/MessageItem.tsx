import { memo } from 'react'
import { Copy, Down } from '@icon-park/react'
import { NexusLogo } from '@/components/NexusLogo'
import { MarkdownView } from '@/components/MarkdownView'
import { useUIStore } from '@/stores/ui'
import { ToolBlock } from './ToolBlock'
import { PermissionCard } from './PermissionCard'
import { AgentCardsRow } from './AgentToolView'
import { TaskListWidget } from './TaskListWidget'
import { QuietToolGroup } from './QuietToolGroup'
import { isGroupable, breaksGroup } from './tool-block/quietGroupPhrase'
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
    if (block.type === 'tool_use') {
      if (MODE_SYSTEM_TOOLS.has(block.name)) return false
      if (block.name === 'task_list') return false
      return true
    }
    return false
  })
}

// ThinkingBlock isolates its own Zustand subscription so toggling one thinking
// block does NOT trigger re-renders in sibling MessageItems.
function ThinkingBlock({ thinkingId, thinking }: { thinkingId: string; thinking: string }) {
  const expanded = useUIStore((s) => s.thinkingExpansion[thinkingId] ?? false)
  const setThinkingExpansion = useUIStore((s) => s.setThinkingExpansion)
  return (
    <div className="msg-thinking">
      <button
        className="msg-thinking-toggle"
        type="button"
        onClick={() => setThinkingExpansion(thinkingId, !expanded)}
        aria-expanded={expanded}
      >
        <span className={`msg-thinking-chevron${expanded ? ' open' : ''}`}>
          <Down size={10} />
        </span>
        <span className="msg-thinking-label">Thinking</span>
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

const TASK_TOOLS = new Set(['task_create', 'task_update', 'task_list'])
const AGENT_TOOLS = new Set(['agent', 'spawn_agent'])

type RenderItem =
  | { kind: 'block'; block: Message['content'][number]; index: number }
  | { kind: 'agent-group'; tools: ToolUseBlock[] }
  | { kind: 'task-group'; tools: ToolUseBlock[] }
  | { kind: 'quiet-group'; tools: ToolUseBlock[] }

function groupBlocks(blocks: Message['content']): RenderItem[] {
  // Collect all task tools from the message for the widget
  const taskTools = blocks.filter(
    (b): b is ToolUseBlock => b.type === 'tool_use' && TASK_TOOLS.has(b.name)
  )
  let taskWidgetPlaced = false

  const items: RenderItem[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]

    // Skip task tools — rendered collectively as task-group at first occurrence
    if (block.type === 'tool_use' && TASK_TOOLS.has(block.name)) {
      if (!taskWidgetPlaced && taskTools.length > 0) {
        items.push({ kind: 'task-group', tools: taskTools })
        taskWidgetPlaced = true
      }
      i++
      continue
    }

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
      while (
        j < blocks.length &&
        blocks[j].type === 'tool_use' &&
        isGroupable((blocks[j] as ToolUseBlock).name) &&
        !breaksGroup(blocks[j] as ToolUseBlock)
      ) {
        group.push(blocks[j] as ToolUseBlock)
        j++
      }
      items.push({ kind: 'quiet-group', tools: group })
      i = j
      continue
    }

    items.push({ kind: 'block', block, index: i })
    i++
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
          <NexusLogo size={16} />
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

          if (item.kind === 'task-group') {
            return (
              <TaskListWidget
                key={`${message.id ?? 'msg'}-tasks-${i}`}
                tools={item.tools}
              />
            )
          }

          if (item.kind === 'quiet-group') {
            return (
              <QuietToolGroup
                key={item.tools[0]?.id || `${message.id ?? 'msg'}-quiet-${i}`}
                tools={item.tools}
                sessionId={sessionId}
                onSubmitPrompt={onSubmitToolPrompt}
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
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.msg-row.user .msg-content {
  align-items: flex-end;
  max-width: 72%;
}

.msg-bubble {
  font-size: 13px;
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
  padding: 7px 11px;
  border-radius: 14px 14px 3px 14px;
  border: 1px solid var(--color-border-subtle);
}

.msg-tool-result {
  color: var(--color-text-secondary);
}

.msg-thinking {
  margin: 0 0 4px;
}

.msg-thinking-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  padding: 2px 0;
  cursor: pointer;
  color: var(--color-text-muted);
}

.msg-thinking-toggle:hover {
  color: var(--color-text-secondary);
}

.msg-thinking-label {
  font-size: 10px;
  color: inherit;
  font-style: italic;
}

.msg-thinking-chevron {
  display: inline-flex;
  color: inherit;
  opacity: 0.7;
  transition: transform 0.15s ease;
}

.msg-thinking-chevron.open {
  transform: rotate(180deg);
}

.msg-thinking-body {
  margin-top: 6px;
  padding-left: 8px;
  border-left: 2px solid rgba(239, 124, 47, 0.22);
  font-size: 11px;
  font-style: italic;
  color: var(--color-text-muted);
  line-height: 1.65;
}

.msg-footer {
  display: flex;
  align-items: center;
  gap: 9px;
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
  border-radius: 3px;
}

.msg-action-btn:hover {
  background: var(--color-hover);
  color: var(--color-text-secondary);
}
`
