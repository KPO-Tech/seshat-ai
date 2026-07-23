import {
  Terminal, Globe, FileTextOne, Robot, Browser, PlugOne,
  MindMapping, Notebook, Calculator, Comment, Calendar,
} from '@icon-park/react'
import type { ToolStatus, ToolUseBlock } from '@/api/types'
import type { AskUserOption, AskUserQuestion, WebSearchHit } from './types'

export function toolIcon(name: string) {
  if (name === 'bash') return <Terminal size={11} />
  if (name === 'ask_user_question') return <FileTextOne size={11} />
  if (['task_create', 'task_update', 'task_list'].includes(name)) return <FileTextOne size={11} />
  if (name === 'web_search' || name === 'web_fetch') return <Globe size={11} />
  if (name.startsWith('browser_')) return <Browser size={11} />
  if (name.startsWith('mcp__') || name === 'mcp') return <PlugOne size={11} />
  if (name === 'agent') return <Robot size={11} />
  if (name.startsWith('memory_')) return <MindMapping size={11} />
  if (name.startsWith('notebook_')) return <Notebook size={11} />
  if (['calculator', 'statistics', 'unit_convert', 'financial_calc'].includes(name)) return <Calculator size={11} />
  if (name.startsWith('hn_') || name.startsWith('devto_')) return <Comment size={11} />
  if (['schedule_job', 'list_jobs'].includes(name)) return <Calendar size={11} />
  if (['glob', 'grep', 'read', 'write', 'edit', 'file_read', 'file_write', 'file_edit'].includes(name)) {
    return <FileTextOne size={11} />
  }
  return <Terminal size={11} />
}

export function toolLabel(name: string): string {
  // Dynamic MCP tool names ("mcp__github__search_issues") mangle into "mcp
  // github search issues" under the generic underscore→space fallback below —
  // split server from tool explicitly so the label stays readable.
  if (name.startsWith('mcp__')) {
    const rest = name.slice('mcp__'.length)
    const sepIndex = rest.indexOf('__')
    const server = sepIndex >= 0 ? rest.slice(0, sepIndex) : ''
    const toolPart = sepIndex >= 0 ? rest.slice(sepIndex + 2) : rest
    const readableTool = toolPart.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    return server ? `${server}: ${readableTool}` : readableTool
  }

  const labels: Record<string, string> = {
    bash: 'Bash',
    ask_user_question: 'Ask User Question',
    task_create: 'Task Create',
    task_update: 'Task Update',
    task_list: 'Task List',
    web_search: 'Web Search',
    web_fetch: 'Web Fetch',
    mcp: 'MCP',
    agent: 'Agent',
    glob: 'Glob',
    grep: 'Grep',
    file_read: 'Read File',
    file_write: 'Write File',
    file_edit: 'Edit File',
    read: 'Read',
    write: 'Write',
    edit: 'Edit',
  }
  return labels[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export function headerSummary(tool: ToolUseBlock, status: ToolStatus): string {
  const commandLike = inputSnippet(tool)
  if (tool.name === 'bash' && commandLike) {
    return commandLike
  }
  if ((status === 'running' || status === 'awaiting_approval') && tool._message) {
    return tool._message
  }
  if (tool.name === 'task_create') {
    return typeof tool.input.subject === 'string' ? compact(tool.input.subject, 56) : ''
  }
  if (tool.name === 'task_update') {
    const statusText = typeof tool.input.status === 'string' ? tool.input.status : ''
    const subject = typeof tool.input.subject === 'string' ? tool.input.subject : ''
    if (subject) return compact(subject, 56)
    if (statusText) return `status → ${statusText}`
  }
  if (tool.name === 'task_list') {
    const listType = typeof tool.input.listType === 'string' ? tool.input.listType : 'background'
    const statusText = typeof tool.input.status === 'string' ? tool.input.status : 'running'
    return `${listType} · ${statusText}`
  }
  return commandLike
}

export function fallbackApprovalDescription(tool: ToolUseBlock): string {
  if (tool.name === 'bash') {
    const command = typeof tool.input.command === 'string' ? tool.input.command : ''
    if (command.trim()) return `This will execute a local shell command: ${command}`
  }
  return 'This tool requires explicit approval before it can run.'
}

export function statusLabel(status: ToolStatus): string {
  return {
    pending: 'Pending',
    running: 'Running',
    awaiting_approval: 'Awaiting Approval',
    completed: 'Completed',
    failed: 'Failed',
  }[status]
}

export function fmtDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function parseBashResult(result?: ToolUseBlock['_result']) {
  if (!result) return null
  const metadata = result.metadata ?? {}
  const stdout = typeof metadata.stdout === 'string' ? metadata.stdout : null
  const stderr = typeof metadata.stderr === 'string' ? metadata.stderr : null
  const exitCode = typeof metadata.exit_code === 'number' ? metadata.exit_code : null

  if (stdout !== null || stderr !== null || exitCode !== null) {
    return {
      exitCode,
      stdout,
      stderr,
    }
  }

  const content = result.content
  const exitMatch = content.match(/Exit code:\s*(\d+)/)
  const stdoutMatch = content.match(/\nOutput:\n([\s\S]*?)(?=\nErrors:|$)/)
  const stderrMatch = content.match(/\nErrors:\n([\s\S]*)$/)

  return {
    exitCode: exitMatch ? parseInt(exitMatch[1]) : null,
    stdout: stdoutMatch ? stdoutMatch[1].trimEnd() : null,
    stderr: stderrMatch ? (stderrMatch[1].trimEnd() || null) : null,
  }
}

export function parseAskUserQuestions(input: Record<string, unknown>): AskUserQuestion[] {
  const rawQuestions = input.questions
  if (!Array.isArray(rawQuestions)) return []

  const questions: AskUserQuestion[] = []

  for (const entry of rawQuestions) {
    if (!entry || typeof entry !== 'object') continue
    const question = entry as Record<string, unknown>
    if (typeof question.question !== 'string') continue

    const options: AskUserOption[] = []
    if (Array.isArray(question.options)) {
      for (const option of question.options) {
        if (!option || typeof option !== 'object') continue
        const item = option as Record<string, unknown>
        if (typeof item.label !== 'string') continue
        options.push({
          label: item.label,
          description: typeof item.description === 'string' ? item.description : undefined,
          preview: typeof item.preview === 'string' ? item.preview : undefined,
        })
      }
    }

    questions.push({
      header: typeof question.header === 'string' ? question.header : '',
      question: question.question,
      options,
      multiSelect: Boolean(question.multiSelect),
    })
  }

  return questions
}

export function parseAskUserAnswers(content?: string): Map<string, string> {
  const answers = new Map<string, string>()
  if (!content) return answers

  const matches = content.matchAll(/Q:\s*(.+?)\nA:\s*([\s\S]*?)(?=\n(?:Preview:|Notes:|Q:)|$)/g)
  for (const match of matches) {
    const question = match[1]?.trim()
    const answer = match[2]?.trim()
    if (question && answer) {
      answers.set(question, answer)
    }
  }
  return answers
}

export function splitSelectedAnswer(answer: string): string[] {
  return answer
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseWebSearchHits(content?: string): WebSearchHit[] {
  if (!content) return []
  const lines = content.split('\n')
  const hits: WebSearchHit[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const titleMatch = lines[index]?.match(/^\d+\.\s+(.+)$/)
    const urlLine = lines[index + 1]?.trim()
    if (!titleMatch || !urlLine || !/^https?:\/\//i.test(urlLine)) continue

    hits.push({
      title: titleMatch[1].trim(),
      url: urlLine,
    })
  }

  return hits
}

export function inputSnippetForSilent(tool: ToolUseBlock): string {
  const inp = tool.input
  const str = (k: string) => (typeof inp[k] === 'string' ? (inp[k] as string) : '')
  const basename = (fp: string) => fp ? (fp.split('/').filter(Boolean).pop() ?? fp) : ''

  switch (tool.name) {
    case 'read': case 'file_read': case 'read_file':
      return basename(str('file_path'))
    case 'glob': {
      const pattern = str('pattern')
      const path = basename(str('path'))
      return [pattern, path].filter(Boolean).join(' in ') || ''
    }
    case 'task_get': case 'task_stop': case 'task_output':
      return str('taskId') || str('task_id') || str('id')
    case 'tool_search':
      return compact(str('query'), 40)
    case 'lsp':
      return str('method')
    case 'code_complete':
      return basename(str('file_path'))
    case 'rag_ingest':
      return str('corpus_id')
    case 'mcp_read_resource':
      return compact(str('uri') || str('resource'), 40)
    case 'skill':
      return str('name') || str('skill_name')
    case 'config':
      return str('key')
    case 'monitor':
      return compact(str('command') || str('pid'), 40)
    case 'wait_agent': case 'close_agent': case 'resume_agent': case 'send_agent_message':
      return str('agent_id') || str('agentId')
    case 'enter_worktree':
      return str('directory') || str('branch')
    case 'create_goal': case 'update_goal':
      return compact(str('title'), 40)
    case 'get_goal':
      return str('goal_id')
    case 'docx':
      return basename(str('filename') || str('path'))
    case 'mailbox_send':
      return str('recipient') || str('to')
    case 'mailbox_broadcast':
      return str('topic')
    default:
      return ''
  }
}

function inputSnippet(tool: ToolUseBlock): string {
  if (tool.name === 'ask_user_question') {
    const questions = parseAskUserQuestions(tool.input)
    const firstQuestion = questions[0]?.question ?? ''
    const compact = firstQuestion.replace(/\n/g, ' ').trim()
    return compact.length > 56 ? `${compact.slice(0, 56)}…` : compact
  }
  if (tool.name === 'web_search') {
    const query = typeof tool.input.query === 'string' ? tool.input.query : ''
    const compact = query.replace(/\n/g, ' ').trim()
    return compact.length > 56 ? `${compact.slice(0, 56)}…` : compact
  }
  if (['edit', 'file_edit', 'write', 'file_write', 'read', 'file_read'].includes(tool.name)) {
    const fp = typeof tool.input.file_path === 'string' ? tool.input.file_path : ''
    return fp ? (fp.split('/').filter(Boolean).pop() ?? fp) : ''
  }
  if (tool.name === 'glob') {
    return typeof tool.input.pattern === 'string' ? compact(tool.input.pattern, 48) : ''
  }
  if (tool.name === 'grep') {
    return typeof tool.input.pattern === 'string' ? compact(tool.input.pattern, 48) : ''
  }
  if (tool.name === 'web_fetch') {
    const url = typeof tool.input.url === 'string' ? tool.input.url : ''
    try { return new URL(url).hostname } catch { return compact(url, 48) }
  }
  if (tool.name.startsWith('browser_')) {
    const url = typeof tool.input.url === 'string' ? tool.input.url : ''
    if (url) { try { return new URL(url).hostname } catch { return compact(url, 48) } }
    const elementId = typeof tool.input.element_id === 'string' ? tool.input.element_id : ''
    if (elementId) return elementId
    const key = typeof tool.input.key === 'string' ? tool.input.key : ''
    if (key) return key
    const pageId = typeof tool.input.page_id === 'string' ? tool.input.page_id : ''
    return pageId
  }
  const first = Object.values(tool.input)[0]
  if (typeof first !== 'string') return ''
  return compact(first, 42)
}

function compact(value: string, max: number): string {
  const normalized = value.replace(/\n/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized
}
