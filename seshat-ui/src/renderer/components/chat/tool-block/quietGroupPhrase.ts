import type { ToolStatus, ToolUseBlock } from '@/api/types'
import { toolLabel } from './helpers'

// Tools deliberately kept OUT of the light single-line/quiet-group treatment
// — everything else gets it by default. These are the families the user
// explicitly said need their own dedicated treatment later, not this pass:
// interactive prompts, web search/fetch ("browser"), and rich-media
// generators (an image/audio player doesn't fit a plain text line). agent/
// spawn_agent is excluded too, but structurally — MessageItem.groupBlocks()
// routes it to AgentCardsRow BEFORE this check ever runs, so it doesn't need
// listing here.
const NOT_GROUPABLE = new Set([
  'ask_user_question',
  'web_search', 'web_fetch', 'read_document_url', 'read_url',
  'generate_image', 'text_to_speech', 'speech_to_text',
])

export function isGroupable(name: string): boolean {
  return !NOT_GROUPABLE.has(name)
}

// Tools with no user-visible input/output worth showing — rendered as a
// terse status line (SilentToolView) instead of a full body, whether they
// end up solo (ToolBlock) or inside a run (QuietGroupItem). Kept as one
// shared set so both call sites can never disagree on which tools qualify.
export const SILENT_TOOLS = new Set([
  // file tools with no user-visible output
  'read', 'file_read', 'read_file', 'list_directory',
  // task plumbing — the actual task list with live status lives in the
  // Agent Monitor panel (auto-opened on task_create - see Conversation.tsx),
  // not inline in the chat
  'task_create', 'task_update', 'task_list',
  'task_get', 'task_stop', 'task_output',
  // internal discovery & control
  'tool_search', 'skill', 'config', 'brief',
  // LSP / code assist
  'lsp', 'code_complete',
  // RAG ingest (search has its own view)
  'rag_ingest',
  // MCP
  'mcp_list_resources', 'mcp_read_resource',
  // background task / agent management
  'monitor', 'wait_agent', 'list_agents', 'close_agent', 'resume_agent',
  // worktree lifecycle
  'enter_worktree', 'exit_worktree',
  // goal tracking
  'create_goal', 'get_goal', 'update_goal',
  // doc generation (no preview needed)
  'docx',
  // messaging
  'mailbox_send', 'mailbox_broadcast', 'send_agent_message',
  // plan mode — the resulting document has its own dedicated review UI
  // (PlanArtifactCard/PlanEditorPanel), so the tool call itself needs no
  // input/output shown here
  'submit_plan',
])

export function isSilentTool(name: string): boolean {
  return SILENT_TOOLS.has(name)
}

export function toolStatus(tool: ToolUseBlock): ToolStatus {
  return tool._status ?? (tool._result ? (tool._result.isError ? 'failed' : 'completed') : 'running')
}

// A run only breaks on an awaiting-approval tool — that one needs its own
// PermissionCard, which can't live inside a collapsed group. A failed tool
// stays IN the run: it's still shown adjacent to its neighbors in one
// shared foldable block, same as a successful one — QuietGroupItem's own
// per-item line already surfaces the failure (a red ✗, expandable to the
// error text) without needing to break out into a separate top-level card.
export function breaksGroup(tool: ToolUseBlock): boolean {
  return toolStatus(tool) === 'awaiting_approval'
}

type Category = 'read' | 'search' | 'edit' | 'write' | 'bash' | 'other'

export function isEditTool(name: string): boolean {
  return name === 'edit' || name === 'file_edit' || name === 'edit_file'
}

export function isWriteTool(name: string): boolean {
  return name === 'write' || name === 'file_write' || name === 'write_file'
}

function categoryFor(name: string): Category {
  if (name === 'read' || name === 'file_read' || name === 'read_file') return 'read'
  if (name === 'glob' || name === 'grep') return 'search'
  if (name === 'edit' || name === 'file_edit' || name === 'edit_file') return 'edit'
  if (name === 'write' || name === 'file_write' || name === 'write_file') return 'write'
  if (name === 'bash') return 'bash'
  return 'other'
}

function clauseFor(category: Category, count: number): string {
  switch (category) {
    case 'read': return count === 1 ? 'Read a file' : `Read ${count} files`
    case 'search': return count === 1 ? 'Searched' : `Searched ${count} times`
    case 'edit': return count === 1 ? 'Edited a file' : `Edited ${count} files`
    case 'write': return count === 1 ? 'Wrote a file' : `Wrote ${count} files`
    case 'bash': return count === 1 ? 'Ran a command' : `Ran ${count} commands`
    case 'other': return count === 1 ? 'Ran a tool' : `Ran ${count} tools`
  }
}

function basename(fp: string): string {
  return fp.split('/').filter(Boolean).pop() ?? fp
}

function editStats(tool: ToolUseBlock): { added: number; removed: number } | null {
  const meta = tool._result?.metadata
  if (meta && typeof meta.lines_added === 'number' && typeof meta.lines_removed === 'number') {
    return { added: meta.lines_added as number, removed: meta.lines_removed as number }
  }
  return null
}

// Heuristic for "does tool._message read like a real backend-authored
// sentence" (e.g. "Found full AcceptInvitation implementation") vs. a bare
// echoed value (a file path, a short pattern) that shouldn't stand in for
// the templated label.
function looksLikeSentence(message: string): boolean {
  const trimmed = message.trim()
  return trimmed.length >= 12 && trimmed.includes(' ')
}

const MAX_CLAUSES = 4

// Builds the collapsed group line's label from an ordered run of tool_use
// blocks. Single-item and multi-item runs go through the same function —
// a lone edit is just the length-1 case.
export function summarizeQuietGroup(tools: ToolUseBlock[]): string {
  if (tools.length === 0) return ''

  if (tools.length === 1) {
    const tool = tools[0]
    const category = categoryFor(tool.name)

    if (category === 'edit' || category === 'write') {
      const filePath = typeof tool.input.file_path === 'string' ? (tool.input.file_path as string) : ''
      const stats = editStats(tool)
      const verb = category === 'edit' ? 'Edited' : 'Wrote'
      if (filePath && stats) return `${verb} ${basename(filePath)} +${stats.added} -${stats.removed}`
      if (filePath) return `${verb} ${basename(filePath)}`
      return clauseFor(category, 1)
    }

    if (tool._message && looksLikeSentence(tool._message)) {
      return tool._message
    }
    // "other" bucket covers every tool without a dedicated verb (rag_search,
    // apply_patch, MCP tools, ...) — its own name is more useful standalone
    // than a generic "Ran a tool".
    if (category === 'other') return toolLabel(tool.name)
    return clauseFor(category, 1)
  }

  const order: Category[] = []
  const counts = new Map<Category, number>()
  for (const tool of tools) {
    const category = categoryFor(tool.name)
    if (!counts.has(category)) order.push(category)
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  const clauses = order.slice(0, MAX_CLAUSES).map((c) => clauseFor(c, counts.get(c) ?? 0))
  const label = clauses.join(', ')
  return order.length > MAX_CLAUSES ? `${label}, …` : label
}
