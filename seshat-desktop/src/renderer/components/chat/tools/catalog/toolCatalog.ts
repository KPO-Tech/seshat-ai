import type { ToolUseBlock } from '../../lib/chatTypes'
import { humanizeToolName } from './toolPresentation'

export type ToolCategory = 'read' | 'search' | 'data' | 'memory' | 'mcp' | 'media' | 'automation' | 'other'

export type ToolCatalogEntry = {
  label: string
  category?: ToolCategory
  silent?: boolean
  groupable?: boolean
  hidden?: boolean
  body?: 'generic' | 'json' | 'prose' | 'web_search' | 'web_fetch' | 'rag' | 'mcp' | 'ask_user' | 'plan' | 'memory' | 'automation'
  snippet?: (tool: ToolUseBlock) => string
}

const registry: Record<string, ToolCatalogEntry> = {
  read: fileReadEntry('Read'),
  read_file: fileReadEntry('Read'),
  file_read: fileReadEntry('Read'),
  list_directory: { label: 'List Directory', category: 'read', silent: true, snippet: (tool) => str(tool, 'path') },
  glob: { label: 'Glob', category: 'search', silent: true, snippet: (tool) => str(tool, 'pattern') },
  grep: { label: 'Grep', category: 'search', silent: true, snippet: (tool) => str(tool, 'pattern') },

  web_search: { label: 'Web Search', category: 'search', groupable: false, body: 'web_search', snippet: (tool) => str(tool, 'query') },
  web_fetch: { label: 'Web Fetch', category: 'search', groupable: false, body: 'web_fetch', snippet: (tool) => hostOrValue(str(tool, 'url')) },
  read_url: { label: 'Web Fetch', category: 'search', groupable: false, body: 'web_fetch', snippet: (tool) => hostOrValue(str(tool, 'url')) },
  read_document_url: { label: 'Web Fetch', category: 'search', groupable: false, body: 'web_fetch', snippet: (tool) => hostOrValue(str(tool, 'url')) },

  rag_search: { label: 'Knowledge Search', category: 'search', body: 'rag', snippet: (tool) => str(tool, 'query') },
  rag_ingest: { label: 'Knowledge Ingest', category: 'data', silent: true, snippet: (tool) => str(tool, 'corpus_id') },

  ask_user_question: { label: 'Ask User', groupable: false, body: 'ask_user', snippet: askUserSnippet },
  enter_plan_mode: { label: 'Plan Mode', hidden: true, silent: true },
  exit_plan_mode: { label: 'Exit Plan Mode', hidden: true, silent: true },
  enter_pair_programming_mode: { label: 'Pair Programming', hidden: true, silent: true },
  exit_pair_programming_mode: { label: 'Exit Pair Programming', hidden: true, silent: true },
  submit_plan: { label: 'Submit Plan', category: 'data', silent: true, groupable: false, body: 'plan', snippet: submitPlanSnippet },
  tool_search: { label: 'Tool Search', category: 'search', silent: true, snippet: (tool) => str(tool, 'query') },
  skill: { label: 'Skill', category: 'data', silent: true, snippet: (tool) => str(tool, 'skill') },
  config: { label: 'Config', category: 'data', silent: true, snippet: (tool) => str(tool, 'key') },
  brief: { label: 'Brief', category: 'data', silent: true },

  task_create: { label: 'Create Task', category: 'automation', groupable: false, snippet: taskSnippet },
  task_update: { label: 'Update Task', category: 'automation', groupable: false, snippet: taskSnippet },
  task_list: { label: 'Task List', category: 'automation', groupable: false },
  task_get: { label: 'Task Details', category: 'automation', groupable: false, snippet: idSnippet },
  task_stop: { label: 'Stop Task', category: 'automation', groupable: false, snippet: idSnippet },
  task_output: { label: 'Task Output', category: 'automation', groupable: false, snippet: idSnippet },
  agent: { label: 'Agent', category: 'automation', groupable: false, snippet: agentSnippet },
  spawn_agent: { label: 'Sub-agent', category: 'automation', groupable: false, snippet: agentSnippet },
  wait_agent: { label: 'Wait for Agent', category: 'automation', silent: true, snippet: agentIdSnippet },
  list_agents: { label: 'List Agents', category: 'automation', silent: true },
  close_agent: { label: 'Close Agent', category: 'automation', silent: true, snippet: agentIdSnippet },
  send_agent_message: { label: 'Message Agent', category: 'automation', silent: true, snippet: agentIdSnippet },
  resume_agent: { label: 'Resume Agent', category: 'automation', groupable: false, snippet: agentIdSnippet },

  mcp: { label: 'MCP', category: 'mcp', body: 'mcp', snippet: mcpSnippet },
  mcp_list_resources: { label: 'MCP Resources', category: 'mcp', silent: true },
  mcp_read_resource: { label: 'MCP Read', category: 'mcp', silent: true, snippet: (tool) => str(tool, 'uri') || str(tool, 'resource') },

  memory_create_entities: { label: 'Create Memory Entities', category: 'memory', silent: true, body: 'memory' },
  memory_add_observations: { label: 'Add Memory Observations', category: 'memory', silent: true, body: 'memory' },
  memory_search_nodes: { label: 'Search Memory', category: 'memory', body: 'memory', snippet: (tool) => str(tool, 'query') },
  memory_open_nodes: { label: 'Open Memory Nodes', category: 'memory', body: 'memory' },

  schedule_job: { label: 'Schedule Job', category: 'automation', body: 'automation', snippet: (tool) => str(tool, 'name') },
  list_jobs: { label: 'List Jobs', category: 'automation', body: 'automation' },
  update_job: { label: 'Update Job', category: 'automation', body: 'automation' },
  run_job_now: { label: 'Run Job', category: 'automation', body: 'automation' },
  delete_job: { label: 'Delete Job', category: 'automation', silent: true, body: 'automation', snippet: idSnippet },
  pause_job: { label: 'Pause Job', category: 'automation', silent: true, body: 'automation', snippet: idSnippet },
  resume_job: { label: 'Resume Job', category: 'automation', silent: true, body: 'automation', snippet: idSnippet },

  calculator: { label: 'Calculator', category: 'data', body: 'prose', snippet: (tool) => str(tool, 'expression') },
  unit_convert: { label: 'Unit Convert', category: 'data', body: 'prose' },
  statistics: { label: 'Statistics', category: 'data', body: 'prose' },
  financial_calc: { label: 'Financial Calc', category: 'data', body: 'prose' },

  generate_image: { label: 'Generate Image', category: 'media', groupable: false, body: 'prose' },
  text_to_speech: { label: 'Text To Speech', category: 'media', groupable: false, body: 'prose' },
  speech_to_text: { label: 'Speech To Text', category: 'media', groupable: false, body: 'prose' },

  hn_stories: { label: 'HN Stories', category: 'search', body: 'prose' },
  hn_item: { label: 'HN Item', category: 'search', body: 'prose' },
  hn_search: { label: 'HN Search', category: 'search', body: 'prose', snippet: (tool) => str(tool, 'query') },
  devto_feed: { label: 'Dev.to Feed', category: 'search', body: 'prose' },
  devto_article: { label: 'Dev.to Article', category: 'search', body: 'prose' },
  devto_publish: { label: 'Publish to Dev.to', category: 'data', silent: true, snippet: (tool) => str(tool, 'title') },

  notebook_read: notebookEntry('Read Notebook'),
  notebook_execute: notebookEntry('Execute Notebook'),
  notebook_run: notebookEntry('Run Notebook Cell'),
  notebook_kernel: notebookEntry('Notebook Kernel')
}

export function toolEntry(name: string): ToolCatalogEntry {
  if (name.startsWith('mcp__')) {
    return { label: mcpDynamicLabel(name), category: 'mcp', body: 'mcp', snippet: mcpSnippet }
  }
  return registry[name] ?? { label: humanizeToolName(name), category: 'other', body: 'generic' }
}

export function isSilentTool(name: string) {
  return Boolean(toolEntry(name).silent)
}

export function isHiddenTool(name: string) {
  return Boolean(toolEntry(name).hidden)
}

export function isGroupableTool(name: string) {
  return toolEntry(name).groupable ?? true
}

export function toolLabel(name: string) {
  return toolEntry(name).label
}

export function catalogSnippet(tool: ToolUseBlock) {
  return toolEntry(tool.name).snippet?.(tool) || ''
}

export function toolCategory(name: string): ToolCategory {
  return toolEntry(name).category ?? 'other'
}

function fileReadEntry(label: string): ToolCatalogEntry {
  return { label, category: 'read', silent: true, snippet: (tool) => basename(str(tool, 'file_path') || str(tool, 'path')) }
}

function notebookEntry(label: string): ToolCatalogEntry {
  return { label, category: 'data', body: 'prose', snippet: (tool) => basename(str(tool, 'notebook_path') || str(tool, 'path')) }
}

function str(tool: ToolUseBlock, key: string): string {
  const value = tool.input[key]
  return typeof value === 'string' ? value : ''
}

function basename(value: string): string {
  return value.split(/[/\\]/).filter(Boolean).pop() ?? value
}

function hostOrValue(value: string): string {
  if (!value) return ''
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

function idSnippet(tool: ToolUseBlock): string {
  return str(tool, 'job_id') || str(tool, 'id') || str(tool, 'task_id') || str(tool, 'taskId')
}

function taskSnippet(tool: ToolUseBlock): string {
  return str(tool, 'subject') || str(tool, 'activeForm') || str(tool, 'status') || idSnippet(tool)
}

function agentSnippet(tool: ToolUseBlock): string {
  return str(tool, 'task') || str(tool, 'prompt') || str(tool, 'role')
}

function agentIdSnippet(tool: ToolUseBlock): string {
  return str(tool, 'agent_id') || str(tool, 'agentId')
}

function askUserSnippet(tool: ToolUseBlock): string {
  if (tool._prompt?.message) return tool._prompt.message
  const question = str(tool, 'question')
  if (question) return question
  const questions = tool.input.questions
  if (!Array.isArray(questions) || questions.length === 0) return ''
  const first = questions[0]
  return first && typeof first === 'object' && 'question' in first && typeof first.question === 'string' ? first.question : ''
}

function submitPlanSnippet(tool: ToolUseBlock): string {
  return str(tool, 'slug').replace(/-/g, ' ') || str(tool, 'filename')
}

function mcpSnippet(tool: ToolUseBlock): string {
  const parsed = parseMcpName(tool.name, tool.input)
  return parsed.tool || str(tool, 'tool')
}

function mcpDynamicLabel(name: string): string {
  const parsed = parseMcpName(name, {})
  const readable = humanizeToolName(parsed.tool || name)
  return parsed.server ? `${parsed.server}: ${readable}` : readable
}

export function parseMcpName(name: string, input: Record<string, unknown>): { server: string; tool: string } {
  const raw = name.startsWith('mcp__')
    ? name
    : typeof input.tool === 'string' && input.tool.startsWith('mcp__')
      ? input.tool
      : ''

  if (!raw) {
    return {
      server: typeof input.server === 'string' ? input.server : '',
      tool: typeof input.tool === 'string' ? input.tool : ''
    }
  }

  const rest = raw.slice('mcp__'.length)
  const splitAt = rest.indexOf('__')
  if (splitAt < 0) return { server: '', tool: rest }
  return { server: rest.slice(0, splitAt), tool: rest.slice(splitAt + 2) }
}
