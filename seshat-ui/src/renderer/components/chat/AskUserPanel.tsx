import { useEffect, useMemo, useState } from 'react'
import type { ToolUseBlock } from '@/api/types'
import { useUIStore } from '@/stores/ui'
import { resolveAskUserQuestions } from './tool-block/helpers'

type Props = {
  tool: ToolUseBlock
  onSubmitPrompt: (promptId: string, value: unknown) => void
}

// Docked above the message box while ask_user_question has a live prompt
// pending (see Conversation.tsx's pendingAskUser) - one question at a time
// with Previous/Next, instead of every question dumped into the chat
// transcript at once. The inline tool-block rendering (AskUserToolView)
// steps aside to a small placeholder for the same tool call while this is
// showing, and takes back over with the permanent Q&A summary once answered.
//
// The backend resolves one question at a time (a fresh tool._prompt per
// question, matched by its .message) - only the question matching the
// current prompt is actually answerable. Navigating to an earlier question
// is a local, read-only review of what was already sent (tracked in the UI
// store's askUserAnswers, not local state - this component unmounts between
// each question, the moment pendingAskUser goes briefly null after a
// submission, so local state wouldn't survive to be reviewed); navigating
// past the live question isn't possible until it's answered.
export function AskUserPanel({ tool, onSubmitPrompt }: Props) {
  const prompt = tool._prompt
  const questions = useMemo(() => resolveAskUserQuestions(tool.input, prompt), [prompt, tool.input])
  const activeIndex = useMemo(() => {
    if (!prompt) return 0
    const idx = questions.findIndex((q) => q.question === prompt.message)
    return idx >= 0 ? idx : 0
  }, [prompt, questions])

  const [viewIndex, setViewIndex] = useState(activeIndex)
  const [selectedValues, setSelectedValues] = useState<string[]>([])
  const [customAnswer, setCustomAnswer] = useState('')
  const askUserAnswers = useUIStore((s) => s.askUserAnswers)
  const setAskUserAnswer = useUIStore((s) => s.setAskUserAnswer)

  // A fresh prompt (next question, or this one re-issued) - jump the view
  // back to whatever the backend is actually waiting on and clear the
  // in-progress answer, even if the user was reviewing an earlier one.
  useEffect(() => {
    setViewIndex(activeIndex)
    setSelectedValues([])
    setCustomAnswer('')
  }, [prompt?.promptId, activeIndex])

  if (!prompt || questions.length === 0) return null

  const question = questions[viewIndex]
  const isActive = viewIndex === activeIndex
  const isLast = viewIndex === questions.length - 1
  const pastAnswer = !isActive ? askUserAnswers[`${tool.id}:${viewIndex}`] : undefined

  function toggleValue(value: string) {
    setCustomAnswer('')
    if (!question.multiSelect) {
      setSelectedValues([value])
      return
    }
    setSelectedValues((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    )
  }

  function goPrev() {
    setViewIndex((i) => Math.max(0, i - 1))
  }

  function goNext() {
    if (!prompt) return
    if (!isActive) {
      // Just reviewing an already-answered question - move forward locally,
      // that answer was already sent to the agent.
      setViewIndex((i) => Math.min(questions.length - 1, i + 1))
      return
    }
    const trimmedCustom = customAnswer.trim()
    let value: unknown
    let summary: string
    if (trimmedCustom) {
      value = trimmedCustom
      summary = trimmedCustom
    } else if (question.kind === 'confirm') {
      // Synthesized from a bare confirm-type prompt (see
      // resolveAskUserQuestions) - the prompt expects a boolean back, not
      // the literal "Yes"/"No" label text.
      if (!selectedValues[0]) return
      value = selectedValues[0] === 'Yes'
      summary = selectedValues[0]
    } else if (question.multiSelect) {
      if (selectedValues.length === 0) return
      value = selectedValues
      summary = selectedValues.join(', ')
    } else {
      if (!selectedValues[0]) return
      value = selectedValues[0]
      summary = selectedValues[0]
    }
    setAskUserAnswer(`${tool.id}:${viewIndex}`, summary)
    onSubmitPrompt(prompt.promptId, value)
  }

  const canSubmit = !isActive || Boolean(customAnswer.trim()) || selectedValues.length > 0
  const hasCustomAnswer = Boolean(customAnswer.trim())

  return (
    <div className="askp-root">
      <style>{ASK_PANEL_CSS}</style>

      <div className="askp-head">
        <div className="askp-title">
          <span className="askp-title-icon">?</span>
          <span>Ask User</span>
        </div>
        {questions.length > 1 && (
          <div className="askp-steps">
            {questions.map((q, i) => (
              <span
                key={i}
                className={`askp-step${i === viewIndex ? ' askp-step--current' : ''}${i < activeIndex ? ' askp-step--done' : ''}`}
                title={q.header || q.question}
              >
                {q.header || `Q${i + 1}`}
              </span>
            ))}
          </div>
        )}
        {questions.length > 1 && (
          <div className="askp-progress">Question {viewIndex + 1} of {questions.length}</div>
        )}
      </div>

      <div className="askp-body">
        <div className="askp-question">{question.question}</div>

        {pastAnswer !== undefined ? (
          <div className="askp-answer">
            <span className="askp-answer-label">Your answer</span>
            <span className="askp-answer-value">{pastAnswer}</span>
          </div>
        ) : (
          <>
            {question.options.length > 0 && (
              <div className="askp-options">
                {question.options.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={`askp-option${selectedValues.includes(option.label) ? ' askp-option--selected' : ''}`}
                    onClick={() => toggleValue(option.label)}
                  >
                    <span className="askp-radio" aria-hidden="true" />
                    <span className="askp-option-copy">
                      <span className="askp-option-label">{option.label}</span>
                      {option.description && (
                        <span className="askp-option-description">{option.description}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <label className={`askp-custom${hasCustomAnswer ? ' askp-custom--active' : ''}`}>
              <span className="askp-radio" aria-hidden="true" />
              <textarea
                className="askp-textarea"
                rows={question.options.length > 0 ? 1 : 2}
                value={customAnswer}
                onChange={(event) => {
                  const value = event.target.value
                  setCustomAnswer(value)
                  if (value.trim()) setSelectedValues([])
                }}
                placeholder={question.options.length > 0 ? 'Autre reponse...' : 'Type your answer...'}
              />
            </label>
          </>
        )}
      </div>

      <div className="askp-footer">
        <button type="button" className="askp-nav" onClick={goPrev} disabled={viewIndex === 0}>
          Previous
        </button>
        <button
          type="button"
          className="askp-nav askp-nav--primary"
          onClick={goNext}
          disabled={!canSubmit}
        >
          {!isActive ? 'Next' : isLast ? 'Submit' : 'Next'}
        </button>
      </div>
    </div>
  )
}

const ASK_PANEL_CSS = `
.askp-root {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: min(780px, calc(100% - 32px));
  margin: 0 auto 10px;
  padding: 0;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 26%, var(--color-border-subtle));
  background: color-mix(in srgb, var(--color-surface-elevated) 62%, var(--color-bg));
  box-shadow: 0 14px 34px rgba(31, 27, 23, 0.07);
  flex-shrink: 0;
  overflow: hidden;
}

.askp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 48px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.askp-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 700;
}

.askp-title-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, var(--color-border-subtle));
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-bg));
  color: var(--color-accent);
  font-size: 14px;
  font-weight: 750;
}

.askp-steps {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0;
  margin-left: auto;
}

.askp-step {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 650;
  padding: 2px 8px 2px 18px;
  border-radius: 0;
  background: transparent;
  color: var(--color-text-muted);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.askp-step::before {
  content: "";
  position: absolute;
  left: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.askp-step + .askp-step {
  border-left: 1px solid var(--color-border-subtle);
}

.askp-step--done {
  color: var(--color-success);
}

.askp-step--done::before {
  border-color: color-mix(in srgb, var(--color-success) 45%, var(--color-border));
  background: color-mix(in srgb, var(--color-success) 18%, var(--color-bg));
}

.askp-step--current {
  color: var(--color-accent);
}

.askp-step--current::before {
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.askp-body {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px;
}

.askp-progress {
  font-size: 9px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.askp-question {
  font-size: 13px;
  line-height: 1.4;
  font-weight: 650;
  color: var(--color-text);
}

.askp-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.askp-option {
  border: 1px solid var(--color-border-subtle);
  border-radius: 7px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--color-bg) 92%, var(--color-surface));
  width: 100%;
  text-align: left;
  cursor: pointer;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 42px;
  transition: border-color 0.12s, background 0.12s, box-shadow 0.12s;
}

.askp-option:hover {
  border-color: color-mix(in srgb, var(--color-primary) 18%, var(--color-border-subtle));
  background: color-mix(in srgb, var(--color-surface-elevated) 38%, var(--color-bg));
}

.askp-option--selected {
  border-color: color-mix(in srgb, var(--color-primary) 34%, var(--color-border-subtle));
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg));
}

.askp-option--selected .askp-radio,
.askp-custom--active .askp-radio {
  border-color: var(--color-primary);
  box-shadow: inset 0 0 0 4px var(--color-bg);
  background: var(--color-primary);
}

.askp-radio {
  width: 13px;
  height: 13px;
  border: 1.5px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-bg);
  flex-shrink: 0;
}

.askp-option-copy {
  display: grid;
  grid-template-columns: minmax(160px, 0.85fr) minmax(0, 1.15fr);
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.askp-option-label {
  font-size: 12px;
  font-weight: 650;
  color: var(--color-text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.askp-option-description {
  font-size: 11.5px;
  line-height: 1.3;
  color: var(--color-text-muted);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.askp-custom {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 38px;
  padding: 6px 10px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 7px;
  background: color-mix(in srgb, var(--color-bg) 92%, var(--color-surface));
  transition: border-color 0.12s, background 0.12s;
}

.askp-custom:focus-within {
  border-color: color-mix(in srgb, var(--color-primary) 34%, var(--color-border-subtle));
  background: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg));
}

.askp-textarea {
  width: 100%;
  resize: none;
  min-height: 24px;
  max-height: 58px;
  border: 0;
  background: transparent;
  color: var(--color-text);
  padding: 3px 0 0;
  font: inherit;
  font-size: 12px;
  line-height: 1.35;
  outline: none;
}

.askp-textarea:focus {
  border-color: transparent;
}

.askp-answer {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
  padding: 6px 8px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--color-success) 8%, var(--color-bg));
}

.askp-answer-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-success);
}

.askp-answer-value {
  font-size: 11px;
  color: var(--color-text);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.askp-footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px 12px;
}

.askp-nav {
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  min-width: 64px;
  padding: 6px 12px;
  background: color-mix(in srgb, var(--color-bg) 76%, var(--color-surface));
  color: var(--color-text-muted);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}

.askp-nav:disabled {
  opacity: 0.4;
  cursor: default;
}

.askp-nav--primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: white;
  margin-left: auto;
}

@media (max-width: 760px) {
  .askp-option {
    align-items: start;
  }

  .askp-option-copy {
    grid-template-columns: 1fr;
    gap: 2px;
  }

  .askp-option-description {
    white-space: normal;
  }

  .askp-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .askp-steps {
    width: 100%;
    justify-content: flex-start;
  }
}
`
