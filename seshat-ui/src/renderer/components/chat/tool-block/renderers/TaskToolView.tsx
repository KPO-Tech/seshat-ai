import { CodeBox, Section } from '../common'
import type { ToolViewProps } from '../types'

export function TaskToolView({ tool, result }: ToolViewProps) {
  if (tool.name === 'task_create') {
    const subject = typeof tool.input.subject === 'string' ? tool.input.subject : 'Untitled task'
    const description = typeof tool.input.description === 'string' ? tool.input.description : ''
    const activeForm = typeof tool.input.activeForm === 'string' ? tool.input.activeForm : ''

    return (
      <>
        <Section label="Task">
          <div className="tb-task-card">
            <span className="tb-task-title">{subject}</span>
            {description && <span className="tb-task-detail">{description}</span>}
            {activeForm && <span className="tb-task-meta">Active: {activeForm}</span>}
          </div>
        </Section>
        {result?.content && (
          <Section label="Result">
            <div className="tb-note">{result.content}</div>
          </Section>
        )}
      </>
    )
  }

  if (tool.name === 'task_update') {
    const taskId = typeof tool.input.taskId === 'string' ? tool.input.taskId : ''
    const nextStatus = typeof tool.input.status === 'string' ? tool.input.status : ''
    const subject = typeof tool.input.subject === 'string' ? tool.input.subject : ''
    const description = typeof tool.input.description === 'string' ? tool.input.description : ''
    const activeForm = typeof tool.input.activeForm === 'string' ? tool.input.activeForm : ''

    return (
      <>
        <Section label="Update">
          <div className="tb-task-card">
            <span className="tb-task-title">{subject || (taskId ? `Task #${taskId}` : 'Task update')}</span>
            {nextStatus && <span className="tb-task-meta">Status: {nextStatus}</span>}
            {description && <span className="tb-task-detail">{description}</span>}
            {activeForm && <span className="tb-task-meta">Active: {activeForm}</span>}
          </div>
        </Section>
        {result?.content && (
          <Section label="Result">
            <div className="tb-note">{result.content}</div>
          </Section>
        )}
      </>
    )
  }

  if (tool.name === 'task_list' && result?.content) {
    return (
      <Section label="Tasks">
        <CodeBox content={result.content} copyable />
      </Section>
    )
  }

  return (
    <>
      <Section label="Input">
        <CodeBox content={JSON.stringify(tool.input, null, 2)} />
      </Section>
      {result?.content && (
        <Section label="Output">
          <CodeBox content={result.content} copyable />
        </Section>
      )}
    </>
  )
}
