import type { ToolUseBlock } from '../../lib/chatTypes'
import { CodePanel, formatDuration, prettyJsonOrRaw } from '../ToolDetails'

type DiffRow = {
  type: 'context' | 'add' | 'del'
  oldLineNo: number | null
  newLineNo: number | null
  text: string
}

type DiffSummary = {
  rows: DiffRow[]
  additions: number
  deletions: number
}

type PatchHunk = {
  oldStart: number
  newStart: number
  lines: string[]
}

export function EditorLiveView({ tool }: { tool: ToolUseBlock }) {
  const edit = editorData(tool)
  const failed = tool._result?.is_error || tool._result?.isError || tool._progress?.stage === 'failed'

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] px-3 py-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-[12px] font-semibold text-[var(--text-primary)]">{edit.filePath || edit.action}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10.5px] font-semibold text-[var(--text-muted)]">
            <span>{edit.action}</span>
            {edit.duration && <span>{edit.duration}</span>}
          </div>
        </div>
        {edit.diff && (
          <div className="flex shrink-0 items-center gap-2 rounded-md bg-[var(--surface-muted)] px-2 py-1 font-mono text-[10.5px] font-bold">
            <span className="text-[var(--accent-success)]">+{edit.diff.additions}</span>
            <span className="text-[var(--accent-danger)]">-{edit.diff.deletions}</span>
          </div>
        )}
      </div>

      {failed && tool._result?.content ? (
        <div className="p-3">
          <CodePanel title="Error" value={tool._result.content} />
        </div>
      ) : edit.diff?.rows.length ? (
        <DiffPreview rows={edit.diff.rows} />
      ) : edit.patchLines.length > 0 ? (
        <PatchSummary lines={edit.patchLines} />
      ) : edit.raw ? (
        <div className="p-3">
          <CodePanel title="Change" value={edit.raw} />
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-3 text-[12px] font-medium text-[var(--text-muted)]">
          <span className="size-2 rounded-full bg-[var(--accent-primary)] shadow-[0_0_10px_var(--accent-primary)]" />
          Preparing file change
        </div>
      )}
    </div>
  )
}

function DiffPreview({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="no-scrollbar max-h-[360px] overflow-auto bg-[#0a0d12] py-2 font-mono text-[11px] leading-5">
      {rows.map((row, index) => (
        <div key={index} className={rowClass(row.type)}>
          <span className="w-10 shrink-0 select-none text-right text-white/28">{row.oldLineNo ?? ''}</span>
          <span className="w-10 shrink-0 select-none text-right text-white/28">{row.newLineNo ?? ''}</span>
          <span className="w-4 shrink-0 select-none text-center font-bold">{row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '}</span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-all pl-1 text-white/78">{row.text || ' '}</span>
        </div>
      ))}
    </div>
  )
}

function PatchSummary({ lines }: { lines: string[] }) {
  return (
    <div className="grid gap-1 p-2">
      {lines.map((line, index) => {
        const verb = line.split(':')[0]?.trim().toLowerCase()
        const tone = verb === 'added' ? 'text-[var(--accent-success)]' : verb === 'deleted' ? 'text-[var(--accent-danger)]' : 'text-[var(--accent-primary)]'
        return (
          <div key={`${line}-${index}`} className={['rounded-md bg-[var(--surface-muted)] px-3 py-2 font-mono text-[11px] font-semibold', tone].join(' ')}>
            {line}
          </div>
        )
      })}
    </div>
  )
}

function editorData(tool: ToolUseBlock) {
  const metadata = { ...tool._result?.metadata, ...tool._progress?.metadata }
  const input = { ...tool.input, ...tool._progress?.input }
  const filePath = firstText(input.file_path, input.path, input.file, metadata.file_path, metadata.path, metadata.filename)
  const action = actionLabel(tool.name)
  const diff = resolveDiff(input, metadata)
  const resultText = tool._result?.content ?? tool._progress?.result ?? ''
  const patchLines = patchSummaryLines(resultText)
  const raw = diff || patchLines.length > 0 ? '' : prettyJsonOrRaw(resultText || text(input.patch) || text(input.diff) || text(input.content))

  return {
    action,
    filePath,
    diff,
    patchLines,
    raw,
    duration: formatDuration(tool._result) || formatMs(tool._progress?.durationMs)
  }
}

function resolveDiff(input: Record<string, unknown>, metadata: Record<string, unknown>): DiffSummary | null {
  const structured = asPatchHunks(metadata.structured_patch)
  if (structured.length > 0) return summarizeDiff(structured.flatMap((hunk) => rowsFromHunkLines(hunk.lines, hunk.oldStart, hunk.newStart)))

  const gitDiff = metadata.git_diff
  if (gitDiff && typeof gitDiff === 'object' && 'patch' in gitDiff && typeof gitDiff.patch === 'string') {
    const rows = parseUnifiedDiff(gitDiff.patch)
    if (rows.length > 0) return summarizeDiff(rows)
  }

  const patch = firstText(input.patch, input.diff, metadata.patch)
  if (patch) {
    const rows = parseUnifiedDiff(patch)
    if (rows.length > 0) return summarizeDiff(rows)
  }

  const oldText = firstText(input.old_string, metadata.original_file)
  const newText = firstText(input.new_string, input.content, metadata.content)
  if (!oldText && !newText) return null
  return summarizeDiff(computeLineDiff(oldText, newText))
}

const hunkHeader = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

function parseUnifiedDiff(patch: string): DiffRow[] {
  const rows: DiffRow[] = []
  let oldNo = 0
  let newNo = 0
  for (const line of patch.split('\n')) {
    const header = hunkHeader.exec(line)
    if (header) {
      oldNo = Number(header[1])
      newNo = Number(header[2])
      continue
    }
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ') || line.startsWith('index ')) continue
    if (oldNo === 0 && newNo === 0) continue
    const marker = line.charAt(0)
    const textValue = line.slice(1)
    if (marker === '-') {
      rows.push({ type: 'del', oldLineNo: oldNo, newLineNo: null, text: textValue })
      oldNo += 1
    } else if (marker === '+') {
      rows.push({ type: 'add', oldLineNo: null, newLineNo: newNo, text: textValue })
      newNo += 1
    } else {
      rows.push({ type: 'context', oldLineNo: oldNo, newLineNo: newNo, text: textValue })
      oldNo += 1
      newNo += 1
    }
  }
  return rows
}

function rowsFromHunkLines(lines: string[], oldStart: number, newStart: number): DiffRow[] {
  let oldNo = oldStart
  let newNo = newStart
  const rows: DiffRow[] = []
  for (const raw of lines) {
    const marker = raw.charAt(0)
    const textValue = raw.slice(1)
    if (marker === '-') {
      rows.push({ type: 'del', oldLineNo: oldNo, newLineNo: null, text: textValue })
      oldNo += 1
    } else if (marker === '+') {
      rows.push({ type: 'add', oldLineNo: null, newLineNo: newNo, text: textValue })
      newNo += 1
    } else {
      rows.push({ type: 'context', oldLineNo: oldNo, newLineNo: newNo, text: textValue })
      oldNo += 1
      newNo += 1
    }
  }
  return rows
}

function computeLineDiff(oldText: string, newText: string): DiffRow[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const rows: DiffRow[] = []
  const max = Math.max(oldLines.length, newLines.length)
  for (let index = 0; index < max; index += 1) {
    const oldLine = oldLines[index]
    const newLine = newLines[index]
    if (oldLine === newLine) {
      rows.push({ type: 'context', oldLineNo: index + 1, newLineNo: index + 1, text: oldLine ?? '' })
    } else {
      if (oldLine != null) rows.push({ type: 'del', oldLineNo: index + 1, newLineNo: null, text: oldLine })
      if (newLine != null) rows.push({ type: 'add', oldLineNo: null, newLineNo: index + 1, text: newLine })
    }
  }
  return rows
}

function summarizeDiff(rows: DiffRow[]): DiffSummary {
  return {
    rows,
    additions: rows.filter((row) => row.type === 'add').length,
    deletions: rows.filter((row) => row.type === 'del').length
  }
}

function asPatchHunks(value: unknown): PatchHunk[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is PatchHunk => {
    if (!item || typeof item !== 'object') return false
    const record = item as Record<string, unknown>
    return typeof record.oldStart === 'number' && typeof record.newStart === 'number' && Array.isArray(record.lines)
  })
}

function patchSummaryLines(value: string) {
  return value.split('\n').map((line) => line.trim()).filter((line) => /^(added|deleted|updated|moved):/i.test(line))
}

function rowClass(type: DiffRow['type']) {
  const base = 'flex items-start gap-1 px-2'
  if (type === 'add') return `${base} bg-[var(--accent-success)]/10 text-emerald-100`
  if (type === 'del') return `${base} bg-[var(--accent-danger)]/10 text-red-100`
  return `${base} text-white/70`
}

function actionLabel(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('create')) return 'Create file'
  if (lower.includes('write')) return 'Write file'
  if (lower.includes('move')) return 'Move file'
  if (lower.includes('replace')) return 'Replace file'
  if (lower.includes('patch')) return 'Apply patch'
  return 'Edit file'
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function formatMs(value?: number) {
  if (typeof value !== 'number') return ''
  return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`
}
