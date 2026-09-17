import { useEffect } from 'react'
import { useTaskStore } from '@renderer/stores/tasks'
import type { ToolUseBlock } from '../../../lib/chatTypes'
import type { TaskItem, TaskItemStatus } from './taskState'

export function TaskLiveView({ sessionId, tool }: { sessionId?: string; tool: ToolUseBlock }) {
  const ingestTool = useTaskStore((state) => state.ingestTool)
  const session = useTaskStore((state) => sessionId ? state.sessions[sessionId] : undefined)

  useEffect(() => {
    if (sessionId) ingestTool(sessionId, tool)
  }, [ingestTool, sessionId, tool])

  const items = session?.items ?? []
  const background = session?.background ?? []
  const completed = items.filter((item) => item.status === 'completed').length
  const progress = items.length ? Math.round((completed / items.length) * 100) : 0

  if (!items.length && !background.length) {
    return (
      <div className="flex min-h-16 items-center gap-3 px-1 text-[12px] text-[var(--text-muted)]">
        <span className="size-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent-primary)]" />
        {tool._status === 'running' || tool._status === 'pending' ? 'Preparing task list' : 'No tracked tasks'}
      </div>
    )
  }

  return (
    <div className="min-w-0">
      {items.length > 0 && (
        <>
          <div className="mb-2 flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <div className="h-full rounded-full bg-[var(--accent-primary)] transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </div>
            <span className="shrink-0 text-[10px] font-semibold text-[var(--text-muted)]">{completed} of {items.length} completed</span>
          </div>
          <div className="divide-y divide-[var(--border-soft)]">
            {items.map((item) => <TaskRow key={item.id} item={item} />)}
          </div>
        </>
      )}
      {background.length > 0 && (
        <div className={items.length ? 'mt-3 border-t border-[var(--border-soft)] pt-3' : ''}>
          <div className="mb-1.5 text-[10px] font-semibold uppercase text-[var(--text-muted)]">Background</div>
          {background.map((item) => (
            <div key={item.id} className="flex min-h-8 items-center gap-2 text-[11px]">
              <StatusMark status={item.status === 'completed' ? 'completed' : item.status === 'failed' ? 'failed' : 'in_progress'} />
              <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">{item.command}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{item.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TaskRow({ item }: { item: TaskItem }) {
  const activeLabel = item.status === 'in_progress' && item.activeForm ? item.activeForm : item.subject
  return (
    <div className="flex min-h-10 items-start gap-2.5 py-2">
      <StatusMark status={item.status} />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[12px] font-medium ${item.status === 'completed' ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-primary)]'}`}>
          {activeLabel}
        </div>
        {item.description && item.status === 'in_progress' && <div className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{item.description}</div>}
      </div>
      {item.owner && <span className="max-w-28 truncate text-[10px] text-[var(--text-muted)]">{item.owner}</span>}
    </div>
  )
}

function StatusMark({ status }: { status: TaskItemStatus }) {
  if (status === 'completed') {
    return (
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-[var(--accent-primary)] text-white">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m2 5 2 2 4-4" />
        </svg>
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-[var(--accent-danger)] text-[var(--accent-danger)]">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <path d="m2 2 5 5M7 2 2 7" />
        </svg>
      </span>
    )
  }
  if (status === 'in_progress') {
    return <span className="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent-primary)]" />
  }
  return <span className="mt-0.5 size-4 shrink-0 rounded-full border border-[var(--border-strong)]" />
}
