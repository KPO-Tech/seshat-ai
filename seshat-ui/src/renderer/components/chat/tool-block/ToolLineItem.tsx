import { useState } from 'react'
import { CheckOne, Copy, Down } from '@icon-park/react'
import { api } from '@/api/client'
import { useUIStore } from '@/stores/ui'
import type { ToolUseBlock } from '@/api/types'
import { ErrorPre } from './common'
import { DiffView, resolveDiffRows } from './DiffView'
import { fmtDuration, parseAskUserAnswers, resolveAskUserQuestions } from './helpers'
import { summarizeQuietGroup, toolResultSubtitle, toolStatus } from './quietGroupPhrase'
import { categoryIcon, isEditTool, isWriteTool, renderToolBody, toolLabel } from './toolDisplay'
import type { ToolBlockProps } from './types'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function lineIcon(toolName: string, isRunning: boolean, isError: boolean) {
  if (isRunning) {
    return <span className="size-2.5 shrink-0 animate-spin rounded-full border-[1.5px] border-[rgba(239,124,47,0.2)] border-t-[var(--color-accent)]" />
  }
  return (
    <span className={cx('relative inline-flex shrink-0 items-center justify-center text-app-text-muted', isError && 'text-app-text-secondary')}>
      {categoryIcon(toolName)}
      {isError && <span className="absolute -right-0.5 -top-0.5 size-[5px] rounded-full bg-app-error" />}
    </span>
  )
}

// The single terse, foldable line used for every non-silent tool call,
// whether it's shown standalone (ToolBlock, one lone tool with no
// simultaneous neighbor) or nested inside a shared group (QuietToolGroup,
// 2+ tools running back-to-back with no text between them) - both surfaces
// render the exact same row so they can never visually drift apart.
export function ToolLineItem({ tool, sessionId, autoExpand = false, onSubmitPrompt }: {
  tool: ToolUseBlock
  sessionId?: string
  autoExpand?: boolean
  onSubmitPrompt?: ToolBlockProps['onSubmitPrompt']
}) {
  const isPreviewTool =
    tool.name === 'web_search' ||
    tool.name === 'web_fetch' ||
    tool.name === 'read_url' ||
    tool.name === 'read_document_url' ||
    tool.name === 'bash' ||
    tool.name === 'ask_user_question' ||
    tool.name === 'mcp' ||
    tool.name.startsWith('mcp__')
  const setToolExpansion = useUIStore((s) => s.setToolExpansion)
  const status = toolStatus(tool)
  const isRunning = status === 'running' || status === 'pending'
  const isError = status === 'failed'
  const isCompleted = status === 'completed'
  const expanded = useUIStore((s) => s.toolExpansion[tool.id] ?? (autoExpand || isRunning || isError))
  const label = isPreviewTool ? toolLabel(tool.name) : summarizeQuietGroup([tool])
  const detail = isPreviewTool ? previewDetail(tool) : ''
  const meta = isPreviewTool ? previewMeta(tool) : ''
  const isDiffTool = isEditTool(tool.name) || isWriteTool(tool.name)
  // The label above already reads "Wrote foo.py +12 -3" - a "12 lines"
  // subtitle under it for a diff tool is pure repetition (and once
  // expanded, DiffView's own path/stats strip repeats it a third time).
  // Still surface "failed" though, same as every other tool - it's the one
  // subtitle worth seeing without expanding.
  const subtitle = isDiffTool && status !== 'failed' ? null : toolResultSubtitle(tool)
  const copyText = tool._result?.content || JSON.stringify(tool.input, null, 2)

  function toggle() {
    setToolExpansion(tool.id, !expanded)
  }

  return (
    <div className="flex flex-col">
      {/* A real <button> for copy can't nest inside another <button>, so the
          row itself is a div with button semantics instead. */}
      <div
        className={cx(
          'group inline-flex min-h-0 w-full cursor-pointer items-center gap-1.5 border border-app-border-subtle px-2 py-1.5 text-left text-[10.5px] leading-snug text-app-text-muted transition-colors duration-150 hover:border-[color-mix(in_srgb,var(--color-accent)_20%,var(--color-border-subtle))] hover:bg-app-surface-elevated hover:text-app-text-secondary',
          isPreviewTool ? 'min-h-10 bg-app-surface-elevated' : 'bg-app-surface',
          expanded ? 'rounded-t-md' : 'rounded-md',
        )}
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } }}
        aria-expanded={expanded}
      >
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
          {lineIcon(tool.name, isRunning, isError)}
        </span>
        <span className="min-w-0 flex-none overflow-hidden text-ellipsis whitespace-nowrap font-medium text-app-text-secondary">{label}</span>
        {detail && <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium text-app-text" title={detail}>{detail}</span>}
        {isError && <span className="shrink-0 text-[9px] font-bold leading-none text-app-error">failed</span>}
        {meta && <span className="ml-auto shrink-0 text-[10px] text-app-text-muted">{meta}</span>}
        {isCompleted && (
          <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-bg))] text-app-success" title="Completed" aria-label="Completed">
            <CheckOne size={10} />
          </span>
        )}
        <button
          type="button"
          className="inline-flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-app-text-muted opacity-0 transition duration-150 hover:bg-[var(--color-hover)] hover:text-app-text group-hover:opacity-100"
          aria-label="Copy"
          onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(copyText) }}
        >
          <Copy size={10} />
        </button>
        <span className={cx('inline-flex shrink-0 items-center opacity-45 transition-transform duration-150', expanded && 'rotate-180')}>
          <Down size={10} />
        </span>
      </div>

      {subtitle && !isError && !isPreviewTool && (
        <div className={cx('pb-0.5 pl-[22px] text-[9px] text-app-text-muted opacity-65', isError && 'text-app-error opacity-85')}>{subtitle}</div>
      )}

      {/* Every dedicated *ToolView (and GenericToolView) already renders its
          own "Error" section from result.content when isError - showing it
          again here duplicated the same text under every failed tool call.
          See BashToolView/WebSearchToolView for the two that were missing
          that section until this pass. */}
      {expanded && (
        <div className="[&>.tb-hcard:first-child]:rounded-b-md [&>.tb-hcard:first-child]:rounded-t-none [&>.tb-hcard:first-child]:border-t-0">
          {isDiffTool ? (
            <DiffContent tool={tool} />
          ) : (
            renderToolBody({ tool, result: tool._result, status, sessionId }, onSubmitPrompt)
          )}
        </div>
      )}
    </div>
  )
}

function previewDetail(tool: ToolUseBlock): string {
  if (tool.name === 'web_search') {
    return typeof tool.input.query === 'string' ? tool.input.query : ''
  }
  if (tool.name === 'bash') {
    if (typeof tool.input.description === 'string' && tool.input.description) return tool.input.description
    if (tool._message) return tool._message
    return typeof tool.input.command === 'string' ? tool.input.command : ''
  }
  if (tool.name === 'ask_user_question') {
    const answers = parseAskUserAnswers(tool._result?.content)
    if (answers.size > 0) {
      return `${answers.size} question${answers.size === 1 ? '' : 's'} answered`
    }
    if (tool._prompt?.message) return tool._prompt.message
    if (typeof tool.input.question === 'string') return tool.input.question
    if (Array.isArray(tool.input.questions) && tool.input.questions.length > 0) {
      const first = tool.input.questions[0]
      if (first && typeof first === 'object' && 'question' in first && typeof first.question === 'string') {
        return first.question
      }
    }
    return ''
  }
  if (tool.name === 'mcp' || tool.name.startsWith('mcp__')) {
    const parsed = parseMcpPreview(tool)
    if (parsed.tool) return parsed.tool
    return typeof tool.input.tool === 'string' ? tool.input.tool : ''
  }
  const url = typeof tool.input.url === 'string' ? tool.input.url : ''
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function previewMeta(tool: ToolUseBlock): string {
  const result = tool._result
  const parts: string[] = []
  if (tool.name === 'ask_user_question') {
    const questions = resolveAskUserQuestions(tool.input, tool._prompt)
    const answers = parseAskUserAnswers(result?.content)
    if (answers.size > 0 && questions.length > answers.size) {
      parts.push(`${answers.size}/${questions.length}`)
    }
  }
  const provider = result?.metadata?.provider != null ? String(result.metadata.provider) : ''
  const resultCount = result?.metadata?.result_count != null ? Number(result.metadata.result_count) : NaN
  if (tool.name === 'mcp' || tool.name.startsWith('mcp__')) {
    const parsed = parseMcpPreview(tool)
    if (parsed.server) parts.push(`mcp - ${parsed.server}`)
  }
  if (provider) parts.push(provider)
  if (Number.isFinite(resultCount) && resultCount > 0) {
    parts.push(`${resultCount} result${resultCount === 1 ? '' : 's'}`)
  }
  if (result?.durationMs != null) parts.push(fmtDuration(result.durationMs))
  return parts.join('  *  ')
}

function parseMcpPreview(tool: ToolUseBlock): { server: string; tool: string } {
  const dynamicName =
    tool.name.startsWith('mcp__')
      ? tool.name
      : typeof tool.input.tool === 'string' && tool.input.tool.startsWith('mcp__')
        ? tool.input.tool
        : ''
  if (dynamicName) {
    const rest = dynamicName.slice('mcp__'.length)
    const sepIndex = rest.indexOf('__')
    return sepIndex >= 0
      ? { server: rest.slice(0, sepIndex), tool: rest.slice(sepIndex + 2).replace(/_/g, ' ') }
      : { server: '', tool: rest.replace(/_/g, ' ') }
  }
  return {
    server: typeof tool.input.server === 'string' ? tool.input.server : '',
    tool: typeof tool.input.tool === 'string' ? tool.input.tool.replace(/_/g, ' ') : '',
  }
}

function DiffContent({ tool }: { tool: ToolUseBlock }) {
  const diff = resolveDiffRows(tool)
  const filePath = typeof tool.input.file_path === 'string' ? (tool.input.file_path as string) : ''
  const body = (() => {
    if (diff && diff.rows.length > 0) {
      return <DiffView filePath={filePath} rows={diff.rows} addCount={diff.addCount} delCount={diff.delCount} />
    }
    // resolveDiffRows returns null for a landed, failed result (see its own
    // comment) - show the real error instead of a silently empty body, same
    // treatment WriteToolView/EditToolView give the non-grouped case.
    if (tool._result?.isError && tool._result.content) {
      return <ErrorPre content={tool._result.content} />
    }
    return null
  })()

  return (
    <>
      {body}
      <HTMLPreviewTrigger tool={tool} filePath={filePath} />
    </>
  )
}

// Self-contained HTML the agent just wrote (see the rendering-capabilities
// system-prompt block in seshat-backend/internal/query/context.go) can be
// opened as a live sandboxed preview - the full written content is already
// right here in the tool result (write_file's own JSON output echoes back
// what it wrote), no extra file read needed. edit_file results don't carry
// the full post-edit content the same way, so this only fires for write_file.
function HTMLPreviewTrigger({ tool, filePath }: { tool: ToolUseBlock; filePath: string }) {
  const openRightPanel = useUIStore((s) => s.openRightPanel)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const isHTMLFile = /\.html?$/i.test(filePath)
  const content = typeof tool._result?.metadata?.content === 'string' ? tool._result.metadata.content : undefined
  if (!isHTMLFile || !content || tool._result?.isError) return null

  async function openPreview() {
    if (!content || previewing) return
    setPreviewing(true)
    setPreviewError(null)
    try {
      const { id } = await api.post<{ id: string }>('/artifacts/preview', { html: content })
      openRightPanel({
        kind: 'artifact',
        title: filePath.split(/[/\\]/).pop() || filePath,
        artifactPreviewId: id,
      })
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to open preview')
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        className="cursor-pointer rounded-md border border-[rgba(239,124,47,0.3)] bg-[rgba(239,124,47,0.1)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-accent)] disabled:cursor-default disabled:opacity-60"
        onClick={() => void openPreview()}
        disabled={previewing}
      >
        {previewing ? 'Opening preview…' : 'Preview'}
      </button>
      {previewError && <span className="text-[11px] text-app-error">{previewError}</span>}
    </div>
  )
}
