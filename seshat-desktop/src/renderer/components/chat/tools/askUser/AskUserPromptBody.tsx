import { useEffect, useMemo, useState } from 'react'
import { respondToPrompt } from '../../lib/chatApi'
import type { ToolUseBlock } from '../../lib/chatTypes'
import { resolveAskUserQuestions } from './askUserQuestions'

export function AskUserPromptBody({ sessionId, tool }: { sessionId?: string; tool: ToolUseBlock }) {
  const prompt = tool._prompt
  const questions = useMemo(() => resolveAskUserQuestions(tool.input, prompt), [prompt, tool.input])
  const activeIndex = useMemo(() => {
    if (!prompt) return 0
    const index = questions.findIndex((question) => question.question === prompt.message)
    return index >= 0 ? index : 0
  }, [prompt, questions])
  const [viewIndex, setViewIndex] = useState(activeIndex)
  const [selectedValues, setSelectedValues] = useState<unknown[]>([])
  const [customAnswer, setCustomAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setViewIndex(activeIndex)
    setSelectedValues([])
    setCustomAnswer('')
  }, [activeIndex, prompt?.promptId])

  if (!prompt || questions.length === 0) return null

  const question = questions[viewIndex]
  const isActive = viewIndex === activeIndex
  const isLast = viewIndex === questions.length - 1
  // Reviewing an already-answered question (!isActive) must never be a
  // dead end - "Next" just has to step forward locally back to the live
  // question, so it can't require a freshly drafted answer to be enabled.
  const canSubmit = !busy && Boolean(sessionId) && (!isActive || Boolean(customAnswer.trim()) || selectedValues.length > 0)

  function toggleValue(value: unknown) {
    setCustomAnswer('')
    if (!question.multiSelect) {
      setSelectedValues([value])
      return
    }
    setSelectedValues((current) => current.some((item) => Object.is(item, value)) ? current.filter((item) => !Object.is(item, value)) : [...current, value])
  }

  function goNext() {
    if (!isActive) {
      // Already answered - the "Next"/"Submit" action just steps forward
      // locally through history, it must not re-send anything.
      setViewIndex((index) => Math.min(questions.length - 1, index + 1))
      return
    }
    void submit()
  }

  async function submit(cancelled = false) {
    if (!sessionId || !prompt || busy) return
    const trimmed = customAnswer.trim()
    let value: unknown = trimmed
    if (!trimmed && question.multiSelect) value = selectedValues
    if (!trimmed && !question.multiSelect) value = selectedValues[0] ?? ''
    if (question.kind === 'confirm' && !trimmed) value = selectedValues[0] === true || selectedValues[0] === 'Yes'

    setBusy(true)
    setError('')
    try {
      await respondToPrompt({
        promptId: prompt.promptId,
        sessionId,
        value: cancelled ? undefined : value,
        cancelled,
        metadata: prompt.metadata
      })
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'Response failed.')
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--accent-primary)]/25 bg-[var(--surface-panel)]">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--border-soft)] px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent-primary)]/12 text-[12px] font-bold text-[var(--accent-primary)]">?</span>
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold text-[var(--text-primary)]">Input needed</div>
            {questions.length > 1 && <div className="text-[10.5px] text-[var(--text-muted)]">Question {viewIndex + 1} of {questions.length}</div>}
          </div>
        </div>
        {questions.length > 1 && (
          <div className="flex items-center gap-1">
            {questions.map((item, index) => (
              <span
                key={`${item.question}-${index}`}
                title={item.header || item.question}
                className={[
                  'size-2 rounded-full',
                  index === viewIndex ? 'bg-[var(--accent-primary)]' : index < activeIndex ? 'bg-[var(--accent-success)]' : 'bg-[var(--surface-muted)]'
                ].join(' ')}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 p-3">
        <div>
          {question.header && <div className="mb-1 text-[10.5px] font-semibold uppercase text-[var(--text-muted)]">{question.header}</div>}
          <div className="text-[13px] font-semibold leading-5 text-[var(--text-primary)]">{question.question}</div>
        </div>

        {question.options.length > 0 && (
          <div className="grid gap-1.5">
            {question.options.map((option) => {
              const selected = selectedValues.some((value) => Object.is(value, option.value ?? option.label))
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => toggleValue(option.value ?? option.label)}
                  className={[
                    'grid min-h-10 grid-cols-[14px_minmax(0,1fr)] items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors',
                    selected ? 'border-[var(--accent-primary)]/45 bg-[var(--accent-primary)]/10' : 'border-[var(--border-soft)] bg-[var(--surface-muted)] hover:bg-[var(--surface-panel)]'
                  ].join(' ')}
                >
                  <span className={['size-3 rounded-full border', selected ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] shadow-[inset_0_0_0_3px_var(--surface-panel)]' : 'border-[var(--text-muted)]'].join(' ')} />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">{option.label}</span>
                    {option.description && <span className="block truncate text-[11px] text-[var(--text-muted)]">{option.description}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {question.kind !== 'confirm' && (
          <textarea
            value={customAnswer}
            onChange={(event) => {
              setCustomAnswer(event.target.value)
              if (event.target.value.trim()) setSelectedValues([])
            }}
            placeholder={question.options.length > 0 ? 'Other response' : 'Type your response'}
            className="min-h-16 resize-none rounded-md border border-[var(--border-soft)] bg-[var(--surface-muted)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)]"
          />
        )}

        {error && <div className="rounded-md border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/8 px-3 py-2 text-[12px] font-semibold text-[var(--accent-danger)]">{error}</div>}

        <div className="flex items-center justify-between gap-2">
          <button type="button" className="rounded-md border border-[var(--border-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-muted)] disabled:opacity-40" disabled={viewIndex === 0 || busy} onClick={() => setViewIndex((index) => Math.max(0, index - 1))}>Previous</button>
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-md border border-[var(--border-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-muted)] disabled:opacity-40" disabled={busy || !sessionId} onClick={() => void submit(true)}>Cancel</button>
            <button type="button" className="rounded-md border border-[var(--accent-primary)]/45 bg-[var(--accent-primary)]/12 px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-primary)] disabled:opacity-40" disabled={!canSubmit} onClick={goNext}>{busy ? 'Sending' : isLast ? 'Submit' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
