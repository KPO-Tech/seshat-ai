import { Section } from '../common'
import { parseTodoItems } from '../helpers'
import type { ToolViewProps } from '../types'

export function TodoWriteToolView({ tool }: ToolViewProps) {
  const items = parseTodoItems(tool.input)

  if (items.length === 0) {
    return <div className="tb-note">The current session checklist was cleared.</div>
  }

  return (
    <Section label="Checklist">
      <div className="tb-plan-list">
        {items.map((item, index) => (
          <div key={`${item.content}-${index}`} className={`tb-plan-item tb-plan-item--${item.status}`}>
            <span className="tb-plan-marker" />
            <div className="tb-plan-copy">
              <span className="tb-plan-title">{item.content}</span>
              {item.status === 'in_progress' && item.activeForm && (
                <span className="tb-plan-detail">{item.activeForm}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}
