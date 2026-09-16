import { useState } from 'react'
import { decideToolPermission, respondToPrompt } from '../lib/chatApi'
import type { ToolUseBlock } from '../lib/chatTypes'
import { AskUserPromptBody } from './askUser/AskUserPromptBody'
import { AskUserSummary } from './askUser/AskUserSummary'
import { AutomationToolBody, MemoryToolBody } from './bodies/StructuredToolBodies'
import { parseMcpName, toolEntry } from './catalog/toolCatalog'
import { PlanArtifactCard } from './plan/PlanArtifactCard'
import { planIdFromTool } from './plan/planUtils'
import { CodePanel, formatDuration, hostFromUrl, prettyJsonOrRaw } from './ToolDetails'

export function ToolBody({ sessionId, tool }: { sessionId?: string; tool: ToolUseBlock }) {
  if (tool.name === 'submit_plan') return <PlanArtifactCard sessionId={sessionId} tool={tool} />
  if (tool._approval && planIdFromTool(tool)) return <PlanArtifactCard sessionId={sessionId} tool={tool} />
  if (tool._approval) return <ApprovalBody sessionId={sessionId} tool={tool} />
  if (tool.name === 'ask_user_question' && tool._prompt && !tool._result?.content) return <AskUserPromptBody sessionId={sessionId} tool={tool} />
  if (tool._prompt && !tool._result?.content) return <PromptBody sessionId={sessionId} tool={tool} />

  const body = toolEntry(tool.name).body ?? 'generic'
  if (body === 'web_search') return <WebSearchBody tool={tool} />
  if (body === 'web_fetch') return <WebFetchBody tool={tool} />
  if (body === 'rag') return <RagBody tool={tool} />
  if (body === 'mcp') return <McpBody tool={tool} />
  if (body === 'ask_user') return <AskUserBody tool={tool} />
  if (body === 'memory') return <MemoryToolBody tool={tool} />
  if (body === 'automation') return <AutomationToolBody tool={tool} />
  if (body === 'json') return <JsonBody tool={tool} />
  if (body === 'prose') return <ProseBody tool={tool} />
  return <GenericBody tool={tool} />
}

function ApprovalBody({ sessionId, tool }: { sessionId?: string; tool: ToolUseBlock }) {
  const [busy, setBusy] = useState<'allow' | 'always' | 'deny' | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const approval = tool._approval
  if (!approval) return <GenericBody tool={tool} />
  const approvalRequest = approval

  async function decide(approved: boolean, remember = false) {
    if (!sessionId) return
    setError('')
    setBusy(approved ? (remember ? 'always' : 'allow') : 'deny')
    try {
      await decideToolPermission({
        toolUseId: approvalRequest.toolUseId,
        sessionId,
        approved,
        remember,
        reason: approved ? '' : reason.trim(),
        planId: planIdFromTool(tool) || undefined
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decision failed.')
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-lg border border-[var(--accent-primary)]/25 bg-[var(--accent-primary)]/8 p-3">
        <div className="text-[12px] font-semibold text-[var(--text-primary)]">Approval required</div>
        <div className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">
          {approvalRequest.description || `Allow ${approvalRequest.toolName} to run?`}
        </div>
      </div>
      <CodePanel title="Tool input" value={approvalRequest.toolInput} />
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Optional reason when denying"
        className="min-h-16 resize-none rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)]"
      />
      {error && <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/8 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton disabled={!sessionId || Boolean(busy)} onClick={() => void decide(true)}>{busy === 'allow' ? 'Allowing' : 'Allow once'}</ActionButton>
        <ActionButton disabled={!sessionId || Boolean(busy)} onClick={() => void decide(true, true)}>{busy === 'always' ? 'Saving' : 'Always allow'}</ActionButton>
        <ActionButton tone="danger" disabled={!sessionId || Boolean(busy)} onClick={() => void decide(false)}>{busy === 'deny' ? 'Denying' : 'Deny'}</ActionButton>
      </div>
    </div>
  )
}

function PromptBody({ sessionId, tool }: { sessionId?: string; tool: ToolUseBlock }) {
  const prompt = tool._prompt
  const [value, setValue] = useState(() => typeof prompt?.default === 'string' ? prompt.default : '')
  const [selected, setSelected] = useState<unknown>(prompt?.default)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!prompt) return <GenericBody tool={tool} />
  const promptRequest = prompt

  const options = promptRequest.options ?? []
  const isConfirm = promptRequest.type === 'confirm'
  const needsOptionSelection = options.length > 0 && selected === undefined

  async function submit(nextValue?: unknown, cancelled = false) {
    if (!sessionId) return
    setError('')
    setBusy(true)
    try {
      await respondToPrompt({
        promptId: promptRequest.promptId,
        sessionId,
        value: cancelled ? undefined : nextValue,
        cancelled,
        metadata: promptRequest.metadata
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Response failed.')
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3">
      <div className="rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)] p-3">
        <div className="text-[12px] font-semibold text-[var(--text-primary)]">Input needed</div>
        {promptRequest.message && <div className="mt-1 text-[12px] leading-5 text-[var(--text-secondary)]">{promptRequest.message}</div>}
      </div>
      {options.length > 0 ? (
        <div className="grid gap-2">
          {options.map((option, index) => (
            <button
              key={`${option.label}-${index}`}
              type="button"
              onClick={() => setSelected(option.value ?? option.label)}
              className={[
                'rounded-md border px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-muted)]',
                selected === (option.value ?? option.label) ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--text-primary)]' : 'border-[var(--border-soft)] bg-[var(--surface-panel)] text-[var(--text-secondary)]'
              ].join(' ')}
            >
              <span className="block font-semibold">{option.label}</span>
              {option.description && <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{option.description}</span>}
            </button>
          ))}
        </div>
      ) : !isConfirm ? (
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Type your response"
          className="min-h-24 resize-none rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)]"
        />
      ) : null}
      {error && <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/8 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        {isConfirm ? (
          <>
            <ActionButton disabled={!sessionId || busy} onClick={() => void submit(true)}>Yes</ActionButton>
            <ActionButton tone="danger" disabled={!sessionId || busy} onClick={() => void submit(false)}>No</ActionButton>
          </>
        ) : (
          <ActionButton disabled={!sessionId || busy || needsOptionSelection} onClick={() => void submit(options.length > 0 ? selected : value)}>{busy ? 'Sending' : 'Send response'}</ActionButton>
        )}
        <ActionButton tone="muted" disabled={!sessionId || busy} onClick={() => void submit(undefined, true)}>Cancel</ActionButton>
      </div>
    </div>
  )
}

function ActionButton({ children, disabled, tone = 'primary', onClick }: { children: string; disabled?: boolean; tone?: 'primary' | 'danger' | 'muted'; onClick: () => void }) {
  const toneClass = tone === 'danger'
    ? 'border-[var(--accent-danger)]/40 text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/10'
    : tone === 'muted'
      ? 'border-[var(--border-soft)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]'
      : 'border-[var(--accent-primary)]/45 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/10'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={['rounded-md border bg-[var(--surface-panel)] px-3 py-1.5 text-[12px] font-semibold disabled:cursor-default disabled:opacity-50', toneClass].join(' ')}
    >
      {children}
    </button>
  )
}

function GenericBody({ tool }: { tool: ToolUseBlock }) {
  return (
    <div className="grid gap-2">
      <CodePanel title="Input" value={tool.input} />
      {tool._partialInput && <CodePanel title="Partial input" value={tool._partialInput} />}
      {tool._result?.content && <CodePanel title={tool._result.is_error || tool._result.isError ? 'Error' : 'Result'} value={prettyJsonOrRaw(tool._result.content)} />}
    </div>
  )
}

function JsonBody({ tool }: { tool: ToolUseBlock }) {
  if (!tool._result?.content) return <GenericBody tool={tool} />
  return <CodePanel title={tool._result.is_error || tool._result.isError ? 'Error' : 'Result'} value={prettyJsonOrRaw(tool._result.content)} />
}

function ProseBody({ tool }: { tool: ToolUseBlock }) {
  if (!tool._result?.content) return <GenericBody tool={tool} />
  return (
    <div className="rounded-md bg-[var(--surface-muted)] px-3 py-2 text-[12px] leading-6 text-[var(--text-secondary)] whitespace-pre-wrap">
      {tool._result.content}
    </div>
  )
}

function WebSearchBody({ tool }: { tool: ToolUseBlock }) {
  const hits = parseWebSearchHits(tool._result?.content ?? '')
  const [showAll, setShowAll] = useState(false)
  const visibleHits = showAll ? hits : hits.slice(0, 5)
  const provider = metadataText(tool, 'provider')
  const count = Number(tool._result?.metadata?.result_count ?? hits.length)
  const stat = [provider, count > 0 ? `${count} result${count === 1 ? '' : 's'}` : '', formatDuration(tool._result)].filter(Boolean).join(' | ')

  if (tool._result?.is_error || tool._result?.isError) return <CodePanel title="Error" value={tool._result.content} />

  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] px-3 py-2">
        <span className="text-[12px] font-semibold text-[var(--text-primary)]">Sources</span>
        {stat && <span className="truncate text-[10.5px] text-[var(--text-muted)]">{stat}</span>}
      </div>
      {visibleHits.length > 0 ? (
        <div className="no-scrollbar max-h-[240px] overflow-y-auto">
          {visibleHits.map((hit, index) => (
            <a key={`${hit.url}-${index}`} href={hit.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 border-b border-[var(--border-soft)] px-3 py-2 last:border-b-0 hover:bg-[var(--surface-panel)]">
              <Favicon domain={hostFromUrl(hit.url)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{hit.title || hit.url}</span>
                {hit.snippet && <span className="block truncate text-[11px] text-[var(--text-muted)]">{hit.snippet}</span>}
              </span>
              <span className="max-w-[160px] truncate text-[10.5px] text-[var(--text-muted)]">{hostFromUrl(hit.url)}</span>
            </a>
          ))}
        </div>
      ) : (
        <div className="px-3 py-2 text-[12px] text-[var(--text-muted)]">No sources found.</div>
      )}
      {hits.length > 5 && (
        <button type="button" onClick={() => setShowAll((value) => !value)} className="w-full px-3 py-2 text-left text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-panel)]">
          {showAll ? 'Show fewer sources' : `View all sources (${hits.length})`}
        </button>
      )}
    </div>
  )
}

function WebFetchBody({ tool }: { tool: ToolUseBlock }) {
  const url = typeof tool.input.url === 'string' ? tool.input.url : ''
  const parsed = parseFetchResult(tool._result?.content ?? '')
  const source = parsed.fetchedFrom || url
  const stat = [parsed.status, parsed.mode, parsed.size, parsed.time || formatDuration(tool._result)].filter(Boolean).join(' | ')

  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] px-3 py-2">
        {source ? <a href={source} target="_blank" rel="noreferrer" className="truncate text-[12px] font-semibold text-[var(--text-primary)] hover:text-[var(--accent-primary)]">{source}</a> : <span className="text-[12px] font-semibold">Web Fetch</span>}
        {stat && <span className="shrink-0 text-[10.5px] text-[var(--text-muted)]">{stat}</span>}
      </div>
      {tool._result?.is_error || tool._result?.isError ? <CodePanel title="Error" value={tool._result.content} /> : <CodePanel title="Extraction" value={parsed.content} />}
    </div>
  )
}

function RagBody({ tool }: { tool: ToolUseBlock }) {
  const query = typeof tool.input.query === 'string' ? tool.input.query : ''
  const corpus = typeof tool.input.corpus_id === 'string' ? tool.input.corpus_id : ''
  return (
    <div className="grid gap-2">
      {(query || corpus) && (
        <div className="flex flex-wrap gap-2">
          {query && <span className="rounded-md bg-[var(--accent-primary)]/10 px-2 py-1 text-[11px] font-semibold text-[var(--accent-primary)]">{query}</span>}
          {corpus && <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-[11px] font-semibold text-[var(--text-muted)]">corpus: {corpus}</span>}
        </div>
      )}
      {tool._result?.content && <CodePanel title={tool._result.is_error || tool._result.isError ? 'Error' : 'Results'} value={tool._result.content} />}
    </div>
  )
}

function McpBody({ tool }: { tool: ToolUseBlock }) {
  const parsed = parseMcpName(tool.name, tool.input)
  const args = Object.entries(tool.input).filter(([key]) => !['tool', '_tool', 'server', '_server'].includes(key))
  return (
    <div className="grid gap-2">
      <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2">
        <div className="text-[12px] font-semibold text-[var(--text-primary)]">{parsed.server || 'MCP'}</div>
        {parsed.tool && <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{parsed.tool}</div>}
      </div>
      {args.length > 0 && <CodePanel title="Arguments" value={Object.fromEntries(args)} />}
      {tool._result?.content && <CodePanel title={tool._result.is_error || tool._result.isError ? 'Error' : 'Result'} value={prettyJsonOrRaw(tool._result.content)} />}
    </div>
  )
}

function AskUserBody({ tool }: { tool: ToolUseBlock }) {
  return <AskUserSummary tool={tool} />
}

function Favicon({ domain }: { domain: string }) {
  const [failed, setFailed] = useState(false)
  if (!domain || failed) {
    return <span className="flex size-5 shrink-0 items-center justify-center rounded bg-[var(--accent-primary)] text-[9px] font-bold text-white">{domain.charAt(0).toUpperCase() || 'S'}</span>
  }
  return <img className="size-5 shrink-0 rounded object-cover" src={`https://icons.duckduckgo.com/ip3/${domain}.ico`} alt="" loading="lazy" onError={() => setFailed(true)} />
}

function parseWebSearchHits(content: string) {
  const lines = content.split('\n')
  const hits: Array<{ title: string; url: string; snippet: string }> = []
  for (let index = 0; index < lines.length; index += 1) {
    const titleMatch = lines[index]?.match(/^\d+\.\s+(.+)$/)
    const urlLine = lines[index + 1]?.trim()
    if (!titleMatch || !urlLine || !/^https?:\/\//i.test(urlLine)) continue
    const snippetLines: string[] = []
    for (let cursor = index + 2; cursor < lines.length; cursor += 1) {
      const line = lines[cursor]?.trim()
      if (!line || /^\d+\.\s+/.test(line)) break
      snippetLines.push(line)
    }
    hits.push({ title: titleMatch[1].trim(), url: urlLine, snippet: snippetLines.join(' ') })
  }
  return hits
}

function parseFetchResult(content: string) {
  const lines = content.split(/\r?\n/)
  const meta = { fetchedFrom: '', mode: '', status: '', size: '', time: '', content: content.trim() }
  let resultIndex = -1
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (/^Result:\s*$/i.test(line)) {
      resultIndex = index
      break
    }
    const match = line.match(/^([A-Za-z ]+):\s*(.*)$/)
    if (!match) continue
    const key = match[1].toLowerCase()
    const value = match[2].trim()
    if (key === 'fetched from') meta.fetchedFrom = value
    if (key === 'mode') meta.mode = value
    if (key === 'status') meta.status = value
    if (key === 'time') meta.time = value
    if (key === 'size') meta.size = value
  }
  if (resultIndex >= 0) meta.content = lines.slice(resultIndex + 1).join('\n').trim()
  meta.content = meta.content.replace(/^Processed preapproved content for prompt:\s*.*?\n+/is, '').trim()
  return meta
}

function metadataText(tool: ToolUseBlock, key: string) {
  const value = tool._result?.metadata?.[key]
  return value == null ? '' : String(value)
}
