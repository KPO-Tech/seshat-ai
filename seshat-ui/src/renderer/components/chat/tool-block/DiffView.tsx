import { Copy } from '@icon-park/react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { ToolUseBlock } from '@/api/types'
import { languageForPath } from './helpers'

// ─── Backend payload shapes ─────────────────────────────────────────────────
// Mirrors github.com/KPO-Tech/seshat's edit_file/write_file tool output
// (internal/tools/files/edit/edit.go, .../write/write.go) — note the mixed
// casing is intentional and matches the Go JSON tags exactly: the outer
// metadata map uses snake_case keys, but StructuredPatchHunk is a typed
// struct with its own camelCase tags.
type StructuredPatchHunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

type GitDiffMeta = {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch: string
}

export type DiffRow = {
  type: 'context' | 'add' | 'del'
  oldLineNo: number | null
  newLineNo: number | null
  text: string
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function isStructuredPatchHunk(value: unknown): value is StructuredPatchHunk {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.oldStart === 'number' && typeof v.newStart === 'number' && Array.isArray(v.lines)
}

// ─── Parsers (all pure) ──────────────────────────────────────────────────────

function rowsFromHunkLines(lines: string[], oldStart: number, newStart: number): DiffRow[] {
  let oldNo = oldStart
  let newNo = newStart
  const rows: DiffRow[] = []
  for (const raw of lines) {
    const marker = raw.charAt(0)
    const text = raw.slice(1)
    if (marker === '-') {
      rows.push({ type: 'del', oldLineNo: oldNo, newLineNo: null, text })
      oldNo++
    } else if (marker === '+') {
      rows.push({ type: 'add', oldLineNo: null, newLineNo: newNo, text })
      newNo++
    } else {
      rows.push({ type: 'context', oldLineNo: oldNo, newLineNo: newNo, text })
      oldNo++
      newNo++
    }
  }
  return rows
}

function parseStructuredPatch(hunks: StructuredPatchHunk[]): DiffRow[] {
  const rows: DiffRow[] = []
  for (const hunk of hunks) {
    rows.push(...rowsFromHunkLines(hunk.lines, hunk.oldStart, hunk.newStart))
  }
  return rows
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

function parseUnifiedDiffText(patch: string): DiffRow[] {
  const rows: DiffRow[] = []
  let oldNo = 0
  let newNo = 0
  for (const line of patch.split('\n')) {
    const header = HUNK_HEADER_RE.exec(line)
    if (header) {
      oldNo = parseInt(header[1], 10)
      newNo = parseInt(header[3], 10)
      continue
    }
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ') || line.startsWith('index ')) continue
    if (oldNo === 0 && newNo === 0) continue // before the first hunk header
    const marker = line.charAt(0)
    const text = line.slice(1)
    if (marker === '-') {
      rows.push({ type: 'del', oldLineNo: oldNo, newLineNo: null, text })
      oldNo++
    } else if (marker === '+') {
      rows.push({ type: 'add', oldLineNo: null, newLineNo: newNo, text })
      newNo++
    } else {
      rows.push({ type: 'context', oldLineNo: oldNo, newLineNo: newNo, text })
      oldNo++
      newNo++
    }
  }
  return rows
}

// Minimal LCS-based line diff — fallback only, for the brief window before
// tool result metadata has landed (or an older backend without
// structured_patch). Not used on the primary path.
function computeLcsDiff(oldStr: string, newStr: string): DiffRow[] {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  const n = oldLines.length
  const m = newLines.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  let oldNo = 1
  let newNo = 1
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      rows.push({ type: 'context', oldLineNo: oldNo++, newLineNo: newNo++, text: oldLines[i] })
      i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'del', oldLineNo: oldNo++, newLineNo: null, text: oldLines[i] })
      i++
    } else {
      rows.push({ type: 'add', oldLineNo: null, newLineNo: newNo++, text: newLines[j] })
      j++
    }
  }
  while (i < n) { rows.push({ type: 'del', oldLineNo: oldNo++, newLineNo: null, text: oldLines[i] }); i++ }
  while (j < m) { rows.push({ type: 'add', oldLineNo: null, newLineNo: newNo++, text: newLines[j] }); j++ }
  return rows
}

export type ResolvedDiff = { rows: DiffRow[]; addCount: number; delCount: number }

export function resolveDiffRows(tool: ToolUseBlock): ResolvedDiff | null {
  const metadata = tool._result?.metadata

  const structuredPatchRaw = asArray(metadata?.structured_patch).filter(isStructuredPatchHunk)
  if (structuredPatchRaw.length > 0) {
    const rows = parseStructuredPatch(structuredPatchRaw)
    return summarize(rows)
  }

  const gitDiff = metadata?.git_diff as GitDiffMeta | undefined
  if (gitDiff?.patch) {
    const rows = parseUnifiedDiffText(gitDiff.patch)
    if (rows.length > 0) return summarize(rows)
  }

  // A landed, failed result has no structured_patch/git_diff (the tool never
  // got far enough to produce one) - falling through to the input-based
  // fallback below would render the model's *proposed* content as if it were
  // a successful diff, with nothing but the small status icon to say
  // otherwise. Bail out here so the caller shows the real error instead.
  if (tool._result?.isError) return null

  // Fallback: compute client-side from raw input/original content. Covers
  // the brief window before tool._result has landed, and edit_file's
  // old_string/new_string (always present on the input itself).
  const oldStr = typeof tool.input.old_string === 'string'
    ? tool.input.old_string
    : (typeof metadata?.original_file === 'string' ? (metadata.original_file as string) : '')
  const newStr = typeof tool.input.new_string === 'string'
    ? tool.input.new_string
    : (typeof tool.input.content === 'string' ? (tool.input.content as string) : '')
  if (!oldStr && !newStr) return null
  return summarize(computeLcsDiff(oldStr, newStr))
}

function summarize(rows: DiffRow[]): ResolvedDiff {
  let addCount = 0
  let delCount = 0
  for (const row of rows) {
    if (row.type === 'add') addCount++
    else if (row.type === 'del') delCount++
  }
  return { rows, addCount, delCount }
}

// ─── Component ────────────────────────────────────────────────────────────

export function DiffView({
  filePath,
  rows,
  addCount,
  delCount,
}: {
  filePath?: string
  rows: DiffRow[]
  addCount: number
  delCount: number
}) {
  const language = filePath ? languageForPath(filePath) : undefined

  const copyText = rows
    .map((r) => `${r.type === 'add' ? '+' : r.type === 'del' ? '-' : ' '} ${r.text}`)
    .join('\n')

  return (
    <div className="tb-difv">
      <style>{DIFF_VIEW_CSS}</style>
      {filePath && (
        <div className="tb-edit-path-row">
          <span className="tb-filepath-full" title={filePath}>{filePath}</span>
          <span className="tb-difv-stats">
            <span className="tb-difv-add">+{addCount}</span>
            <span className="tb-difv-del">−{delCount}</span>
          </span>
        </div>
      )}
      <div className="tb-diff">
        <button className="tb-diff-copy" type="button" aria-label="Copy diff" onClick={() => void navigator.clipboard.writeText(copyText)}>
          <Copy size={10} />
        </button>
        {rows.map((row, i) => (
          <div key={i} className={`tb-difv-row tb-difv-row--${row.type}`}>
            <span className="tb-difv-gutter tb-difv-gutter--old">{row.oldLineNo ?? ''}</span>
            <span className="tb-difv-gutter tb-difv-gutter--new">{row.newLineNo ?? ''}</span>
            <span className="tb-diff-sign" aria-hidden>
              {row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '}
            </span>
            <span className="tb-difv-code">
              {language ? (
                <SyntaxHighlighter
                  language={language}
                  style={vscDarkPlus}
                  PreTag="span"
                  CodeTag="span"
                  customStyle={{ background: 'transparent', padding: 0, margin: 0, display: 'inline' }}
                  codeTagProps={{ style: { background: 'transparent', fontFamily: 'inherit', fontSize: 'inherit', whiteSpace: 'pre' } }}
                >
                  {row.text || ' '}
                </SyntaxHighlighter>
              ) : (
                row.text || ' '
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const DIFF_VIEW_CSS = `
.tb-difv {
  display: flex;
  flex-direction: column;
}

/* Fused directly to .tb-edit-path-row above (see styles.ts) - no border-top
   or top radius of its own, so the path/stats strip and the diff body read
   as one continuous bordered box instead of two stacked ones. */
.tb-edit-path-row + .tb-diff {
  border-top: none;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.tb-difv-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.tb-difv-add { color: #6ee7b7; }
.tb-difv-del { color: #fca5a5; }

.tb-difv-row {
  display: flex;
  align-items: flex-start;
  padding: 0 7px 0 0;
}

.tb-difv-row--del { background: rgba(var(--color-error-rgb), 0.10); }
.tb-difv-row--add { background: rgba(var(--color-success-rgb), 0.08); }

.tb-difv-gutter {
  flex-shrink: 0;
  width: 34px;
  text-align: right;
  padding-right: 4px;
  color: var(--color-text-disabled);
  user-select: none;
}

.tb-difv-code {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--color-text-secondary);
  padding-left: 3px;
}
`
