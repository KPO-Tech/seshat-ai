import type { ToolUseBlock } from '../../lib/chatTypes'
import { CodePanel, prettyJsonOrRaw } from '../ToolDetails'

type JsonMap = Record<string, unknown>

export function MemoryToolBody({ tool }: { tool: ToolUseBlock }) {
  const parsed = parseJson(tool._result?.content)
  const query = text(tool.input.query)
  const entities = arrayFrom(parsed, ['entities', 'nodes', 'results', 'memories'])
  const relations = arrayFrom(parsed, ['relations', 'edges'])
  const observations = arrayFrom(parsed, ['observations'])
  const hasStructured = entities.length > 0 || relations.length > 0 || observations.length > 0

  if (tool._result?.is_error || tool._result?.isError) return <CodePanel title="Error" value={tool._result.content} />

  return (
    <div className="grid gap-2">
      {(query || text(tool.input.name)) && (
        <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-normal text-[var(--text-muted)]">{query ? 'Search query' : 'Memory'}</div>
          <div className="mt-1 text-[12px] font-semibold text-[var(--text-primary)]">{query || text(tool.input.name)}</div>
        </div>
      )}
      {hasStructured ? (
        <div className="grid gap-2">
          {entities.length > 0 && <CompactList title="Entities" items={entities} />}
          {observations.length > 0 && <CompactList title="Observations" items={observations} />}
          {relations.length > 0 && <CompactList title="Relations" items={relations} />}
        </div>
      ) : tool._result?.content ? (
        <CodePanel title="Memory result" value={prettyJsonOrRaw(tool._result.content)} />
      ) : (
        <CodePanel title="Input" value={tool.input} />
      )}
    </div>
  )
}

export function AutomationToolBody({ tool }: { tool: ToolUseBlock }) {
  const parsed = parseJson(tool._result?.content)
  const jobs = arrayFrom(parsed, ['jobs', 'items', 'results'])
  const parsedJob = asMap(parsed)
  const directJob = text(parsedJob.name) || text(parsedJob.id) ? [parsedJob] : []
  const rows = jobs.length > 0 ? jobs : directJob
  const name = text(tool.input.name) || text(tool.input.job_name)
  const schedule = text(tool.input.schedule) || text(tool.input.cron) || text(tool.input.when)

  if (tool._result?.is_error || tool._result?.isError) return <CodePanel title="Error" value={tool._result.content} />

  return (
    <div className="grid gap-2">
      {(name || schedule) && (
        <div className="grid gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2">
          {name && <InfoLine label="Job" value={name} />}
          {schedule && <InfoLine label="Schedule" value={schedule} />}
        </div>
      )}
      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)]">
          <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-3 py-2">
            <span className="text-[12px] font-semibold text-[var(--text-primary)]">Jobs</span>
            <span className="text-[10.5px] text-[var(--text-muted)]">{rows.length} item{rows.length === 1 ? '' : 's'}</span>
          </div>
          <div className="grid">
            {rows.slice(0, 8).map((item, index) => <JobRow key={index} item={asMap(item)} />)}
          </div>
        </div>
      ) : tool._result?.content ? (
        <CodePanel title="Automation result" value={prettyJsonOrRaw(tool._result.content)} />
      ) : (
        <CodePanel title="Input" value={tool.input} />
      )}
    </div>
  )
}

function CompactList({ title, items }: { title: string; items: unknown[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)]">
      <div className="flex items-center justify-between border-b border-[var(--border-soft)] px-3 py-2">
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">{title}</span>
        <span className="text-[10.5px] text-[var(--text-muted)]">{items.length}</span>
      </div>
      <div className="no-scrollbar max-h-[220px] overflow-auto">
        {items.slice(0, 12).map((item, index) => {
          const value = asMap(item)
          const primary = text(value.name) || text(value.title) || text(value.id) || shortText(item)
          const secondary = text(value.type) || text(value.description) || text(value.content) || text(value.observation)
          return (
            <div key={index} className="border-b border-[var(--border-soft)] px-3 py-2 last:border-b-0">
              <div className="truncate text-[12px] font-semibold text-[var(--text-primary)]">{primary}</div>
              {secondary && <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{secondary}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function JobRow({ item }: { item: JsonMap }) {
  const title = text(item.name) || text(item.title) || text(item.id) || 'Scheduled job'
  const status = text(item.status) || text(item.state) || (item.enabled === false ? 'Paused' : item.enabled === true ? 'Active' : '')
  const cadence = text(item.schedule) || text(item.cron) || text(item.next_run_at) || text(item.nextRunAt)
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border-soft)] px-3 py-2 last:border-b-0">
      <span className={['size-2 rounded-full', status.toLowerCase().includes('pause') || status.toLowerCase().includes('disabled') ? 'bg-[var(--text-muted)]' : 'bg-[var(--accent-success)]'].join(' ')} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{title}</span>
        {cadence && <span className="block truncate text-[11px] text-[var(--text-muted)]">{cadence}</span>}
      </span>
      {status && <span className="rounded-full bg-[var(--surface-panel)] px-2 py-1 text-[10.5px] font-semibold text-[var(--text-muted)]">{status}</span>}
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 truncate text-right text-[12px] font-semibold text-[var(--text-primary)]">{value}</span>
    </div>
  )
}

function parseJson(content?: string) {
  if (!content) return null
  try {
    return JSON.parse(content) as unknown
  } catch {
    return null
  }
}

function arrayFrom(value: unknown, keys: string[]) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  const map = value as JsonMap
  for (const key of keys) {
    if (Array.isArray(map[key])) return map[key] as unknown[]
  }
  return []
}

function asMap(value: unknown): JsonMap {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonMap : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

function shortText(value: unknown) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return 'Item'
  }
}
