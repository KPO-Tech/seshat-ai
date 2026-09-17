import type { RuntimeTaskEvent, ToolUseBlock } from '../../../lib/chatTypes'

export type TaskItemStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export type TaskItem = {
  id: string
  subject: string
  description?: string
  activeForm?: string
  owner?: string
  status: TaskItemStatus
  sourceToolId?: string
}

export type BackgroundTaskItem = {
  id: string
  command: string
  status: string
}

export type TaskSessionState = {
  items: TaskItem[]
  background: BackgroundTaskItem[]
}

export const emptyTaskSession: TaskSessionState = { items: [], background: [] }

export function reduceTaskTool(current: TaskSessionState, tool: ToolUseBlock): TaskSessionState {
  if (!isTaskTool(tool.name)) return current
  let next = current
  const metadata = objectValue(tool._result?.metadata)

  if (tool.name === 'task_create') next = applyCreate(next, tool)
  if (tool.name === 'task_update') next = applyUpdate(next, tool)
  if (tool.name === 'task_list') next = applyList(next, objectValue(metadata.task_list ?? metadata.taskList))
  if (tool.name === 'task_get') next = applyGet(next, objectValue(metadata.task_get ?? metadata.taskGet))
  if (tool.name === 'task_stop') next = applyStop(next, objectValue(metadata.task_stop ?? metadata.taskStop))
  if (tool._task) next = applyRuntimeTask(next, tool._task, tool.id)

  return next
}

export function isTaskTool(name: string) {
  return ['task_create', 'task_update', 'task_list', 'task_get', 'task_stop', 'task_output'].includes(name.toLowerCase())
}

function applyCreate(state: TaskSessionState, tool: ToolUseBlock): TaskSessionState {
  const id = runtimeTaskId(tool._task) || resultTaskId(tool) || `tool:${tool.id}`
  const subject = text(tool._task?.subject) || text(tool.input.subject) || 'Untitled task'
  return {
    ...state,
    items: upsertTask(state.items, {
      id,
      subject,
      description: text(tool.input.description),
      activeForm: text(tool.input.activeForm) || text(tool.input.active_form),
      owner: text(tool.input.owner),
      status: normalizeStatus(tool._task?.status ?? tool.input.status),
      sourceToolId: tool.id
    })
  }
}

function applyUpdate(state: TaskSessionState, tool: ToolUseBlock): TaskSessionState {
  const id = runtimeTaskId(tool._task) || text(tool.input.task_id) || text(tool.input.taskId) || text(tool.input.id)
  if (!id) return state
  const action = text(tool._task?.action).toLowerCase()
  const status = text(tool._task?.status ?? tool.input.status).toLowerCase()
  if (action === 'delete' || status === 'deleted') return { ...state, items: state.items.filter((item) => item.id !== id) }
  const existing = state.items.find((item) => item.id === id)
  return {
    ...state,
    items: upsertTask(state.items, {
      id,
      subject: text(tool._task?.subject) || text(tool.input.subject) || existing?.subject || 'Untitled task',
      description: text(tool.input.description) || existing?.description,
      activeForm: text(tool.input.activeForm) || text(tool.input.active_form) || existing?.activeForm,
      owner: text(tool.input.owner) || existing?.owner,
      status: normalizeStatus(tool._task?.status ?? tool.input.status ?? existing?.status),
      sourceToolId: existing?.sourceToolId ?? tool.id
    })
  }
}

function applyList(state: TaskSessionState, metadata: Record<string, unknown>): TaskSessionState {
  const todoTasks = arrayValue(metadata.todoTasks ?? metadata.todo_tasks)
  const backgroundTasks = arrayValue(metadata.backgroundTasks ?? metadata.background_tasks)
  if (!todoTasks.length && !backgroundTasks.length && !('count' in metadata)) return state
  return {
    items: todoTasks.map(toTaskItem).filter((item): item is TaskItem => Boolean(item)),
    background: backgroundTasks.map(toBackgroundTask).filter((item): item is BackgroundTaskItem => Boolean(item))
  }
}

function applyGet(state: TaskSessionState, metadata: Record<string, unknown>): TaskSessionState {
  const todo = toTaskItem(objectValue(metadata.todo))
  const background = toBackgroundTask(objectValue(metadata.background))
  return {
    items: todo ? upsertTask(state.items, todo) : state.items,
    background: background ? upsertBackground(state.background, background) : state.background
  }
}

function applyStop(state: TaskSessionState, metadata: Record<string, unknown>): TaskSessionState {
  const taskId = text(metadata.taskId) || text(metadata.task_id)
  const todo = objectValue(metadata.todo)
  const todoId = text(todo.id) || taskId
  if (todoId) return { ...state, items: state.items.filter((item) => item.id !== todoId) }
  if (!taskId) return state
  return {
    ...state,
    background: state.background.map((item) => item.id === taskId ? { ...item, status: 'stopped' } : item)
  }
}

function applyRuntimeTask(state: TaskSessionState, event: RuntimeTaskEvent, sourceToolId: string): TaskSessionState {
  const id = runtimeTaskId(event)
  if (!id) return state
  const action = text(event.action).toLowerCase()
  if (action === 'delete') return { ...state, items: state.items.filter((item) => item.id !== id && item.sourceToolId !== sourceToolId) }
  const existing = state.items.find((item) => item.id === id || item.sourceToolId === sourceToolId)
  return {
    ...state,
    items: upsertTask(state.items, {
      id,
      subject: text(event.subject) || existing?.subject || 'Untitled task',
      description: existing?.description,
      activeForm: existing?.activeForm,
      owner: existing?.owner,
      status: normalizeStatus(event.status ?? existing?.status),
      sourceToolId
    })
  }
}

function upsertTask(items: TaskItem[], next: TaskItem) {
  const index = items.findIndex((item) => item.id === next.id || Boolean(next.sourceToolId && item.sourceToolId === next.sourceToolId))
  if (index < 0) return [...items, next]
  const copy = [...items]
  copy[index] = { ...items[index], ...next }
  return copy
}

function upsertBackground(items: BackgroundTaskItem[], next: BackgroundTaskItem) {
  return [...items.filter((item) => item.id !== next.id), next]
}

function toTaskItem(value: unknown): TaskItem | null {
  const item = objectValue(value)
  const id = text(item.id)
  if (!id) return null
  return {
    id,
    subject: text(item.subject) || 'Untitled task',
    description: text(item.description),
    activeForm: text(item.activeForm) || text(item.active_form),
    owner: text(item.owner),
    status: normalizeStatus(item.status)
  }
}

function toBackgroundTask(value: unknown): BackgroundTaskItem | null {
  const item = objectValue(value)
  const id = text(item.id)
  if (!id) return null
  return { id, command: text(item.command) || 'Background task', status: text(item.status) || 'pending' }
}

function normalizeStatus(value: unknown): TaskItemStatus {
  const status = text(value).toLowerCase()
  if (status === 'in_progress' || status === 'in-progress' || status === 'running') return 'in_progress'
  if (status === 'completed' || status === 'done' || status === 'success') return 'completed'
  if (status === 'failed' || status === 'error' || status === 'cancelled') return 'failed'
  return 'pending'
}

function resultTaskId(tool: ToolUseBlock) {
  const match = tool._result?.content?.match(/Task\s+#([^\s]+)\s+created successfully/i)
  return match?.[1] ?? ''
}

function runtimeTaskId(event?: RuntimeTaskEvent) {
  return text(event?.task_id) || text(event?.taskId)
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
