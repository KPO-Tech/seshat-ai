import type { ToolUseBlock } from '@/api/types'

const CSS = `
.tlw-root {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 8px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  background: var(--color-surface);
  width: 100%;
}

.tlw-header {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  margin-bottom: 2px;
}

.tlw-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 2px 0;
}

.tlw-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 2px;
}

.tlw-spinner {
  width: 11px;
  height: 11px;
  border: 1.5px solid rgba(239, 124, 47, 0.2);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: tlw-spin 0.85s linear infinite;
}

@keyframes tlw-spin {
  to { transform: rotate(360deg); }
}

.tlw-check {
  font-size: 11px;
  line-height: 1;
}

.tlw-check--pending { color: var(--color-text-muted); opacity: 0.5; }
.tlw-check--in_progress { color: var(--color-accent); }
.tlw-check--completed { color: var(--color-success); }
.tlw-check--failed { color: var(--color-error); }
.tlw-check--cancelled { color: var(--color-text-muted); opacity: 0.45; }

.tlw-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tlw-subject {
  font-size: 11px;
  line-height: 1.45;
  color: var(--color-text);
}

.tlw-subject--completed {
  text-decoration: line-through;
  color: var(--color-text-muted);
}

.tlw-subject--cancelled {
  text-decoration: line-through;
  opacity: 0.5;
  color: var(--color-text-muted);
}

.tlw-desc {
  font-size: 10px;
  color: var(--color-text-muted);
  line-height: 1.4;
}
`

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'

type TaskEntry = {
  blockId: string
  id: string | null
  subject: string
  description?: string
  status: TaskStatus
}

function tryParseTaskId(content?: string): string | null {
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    const id = parsed.id ?? parsed.task_id
    return typeof id === 'string' ? id : null
  } catch {
    return null
  }
}

function deriveTaskList(tools: ToolUseBlock[]): TaskEntry[] {
  const tasks: TaskEntry[] = []
  const byId = new Map<string, TaskEntry>()
  const bySubject = new Map<string, TaskEntry>()

  for (const tool of tools) {
    if (tool.name === 'task_create') {
      const subject = typeof tool.input.subject === 'string' ? tool.input.subject : 'Task'
      const description = typeof tool.input.description === 'string' ? tool.input.description : undefined
      const parsedId = tryParseTaskId(tool._result?.content)
      const entry: TaskEntry = {
        blockId: tool.id,
        id: parsedId ?? tool.id,
        subject,
        description,
        status: tool._result?.isError ? 'failed' : 'pending',
      }
      tasks.push(entry)
      if (entry.id) byId.set(entry.id, entry)
      bySubject.set(subject.toLowerCase(), entry)
    }

    if (tool.name === 'task_update') {
      const taskId = typeof tool.input.taskId === 'string' ? tool.input.taskId : null
      const subject = typeof tool.input.subject === 'string' ? tool.input.subject : null
      const nextStatus = typeof tool.input.status === 'string' ? tool.input.status as TaskStatus : null
      if (!nextStatus) continue

      let target = taskId ? byId.get(taskId) : undefined
      if (!target && subject) target = bySubject.get(subject.toLowerCase())

      if (target) {
        target.status = nextStatus
      }
    }
  }

  return tasks
}

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === 'in_progress') {
    return <span className="tlw-spinner" />
  }
  const icons: Record<TaskStatus, string> = {
    pending: '○',
    in_progress: '',
    completed: '✓',
    failed: '✗',
    cancelled: '○',
  }
  return (
    <span className={`tlw-check tlw-check--${status}`}>{icons[status]}</span>
  )
}

type Props = {
  tools: ToolUseBlock[]
}

export function TaskListWidget({ tools }: Props) {
  const tasks = deriveTaskList(tools)
  if (tasks.length === 0) return null

  return (
    <div className="tlw-root">
      <style>{CSS}</style>
      <div className="tlw-header">Tasks</div>
      {tasks.map((task) => (
        <div key={task.blockId} className="tlw-item">
          <div className="tlw-icon">
            <StatusIcon status={task.status} />
          </div>
          <div className="tlw-text">
            <span className={`tlw-subject tlw-subject--${task.status}`}>
              {task.subject}
            </span>
            {task.description && (
              <span className="tlw-desc">{task.description}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
