import { useState } from 'react'
import { decideToolPermission, respondToPrompt } from '../lib/chatApi'
import type { ToolUseBlock } from '../lib/chatTypes'
import { AskUserPromptBody } from './askUser/AskUserPromptBody'
import { AskUserSummary } from './askUser/AskUserSummary'
import { GenericBody, JsonBody, ProseBody } from './bodies/GenericToolBodies'
import { McpBody, RagBody } from './bodies/KnowledgeToolBodies'
import { AutomationToolBody, MemoryToolBody } from './bodies/StructuredToolBodies'
import { WebFetchBody, WebSearchBody } from './bodies/WebToolBodies'
import { AudioToolBody, ImageToolBody, TranscriptionToolBody } from './bodies/MediaToolBodies'
import { toolEntry } from './catalog/toolCatalog'
import { PlanArtifactCard } from './plan/PlanArtifactCard'
import { planIdFromTool } from './plan/planUtils'
import { CodePanel } from './ToolDetails'

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
  if (body === 'image') return <ImageToolBody tool={tool} />
  if (body === 'audio') return <AudioToolBody tool={tool} />
  if (body === 'transcription') return <TranscriptionToolBody tool={tool} />
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

function AskUserBody({ tool }: { tool: ToolUseBlock }) {
  return <AskUserSummary tool={tool} />
}
