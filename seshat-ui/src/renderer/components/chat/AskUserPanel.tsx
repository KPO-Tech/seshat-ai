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

  return (
    <div className="askp-root">
      <style>{ASK_PANEL_CSS}</style>

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

      <div className="askp-body">
        {questions.length > 1 && (
          <div className="askp-progress">Question {viewIndex + 1} of {questions.length}</div>
        )}

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
                    <span className="askp-option-label">{option.label}</span>
                    {option.description && (
                      <span className="askp-option-description">{option.description}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <textarea
              className="askp-textarea"
              rows={question.options.length > 0 ? 2 : 3}
              value={customAnswer}
              onChange={(event) => setCustomAnswer(event.target.value)}
              placeholder={question.options.length > 0 ? 'Or type your own answer…' : 'Type your answer…'}
            />
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
  gap: 10px;
  margin: 0 24px 10px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid rgba(239, 124, 47, 0.22);
  background: rgba(239, 124, 47, 0.05);
  flex-shrink: 0;
}

.askp-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.askp-step {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.03em;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-muted);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.askp-step--done {
  background: rgba(var(--color-success-rgb), 0.12);
  color: var(--color-success);
}

.askp-step--current {
  background: rgba(239, 124, 47, 0.16);
  color: var(--color-accent);
}

.askp-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.askp-progress {
  font-size: 10px;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.askp-question {
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text);
}

.askp-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.askp-option {
  border: 1px solid var(--color-border-subtle);
  border-radius: 10px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.02);
  width: 100%;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.askp-option--selected {
  border-color: rgba(var(--color-success-rgb), 0.3);
  background: rgba(var(--color-success-rgb), 0.08);
}

.askp-option-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.askp-option-description {
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-text-muted);
}

.askp-textarea {
  width: 100%;
  resize: vertical;
  min-height: 48px;
  border-radius: 10px;
  border: 1px solid var(--color-border-subtle);
  background: rgba(0, 0, 0, 0.24);
  color: var(--color-text);
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  line-height: 1.45;
  outline: none;
}

.askp-textarea:focus {
  border-color: rgba(239, 124, 47, 0.32);
}

.askp-answer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.askp-answer-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-success);
}

.askp-answer-value {
  font-size: 13px;
  color: var(--color-text);
}

.askp-footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.askp-nav {
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  padding: 7px 14px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.askp-nav:disabled {
  opacity: 0.4;
  cursor: default;
}

.askp-nav--primary {
  border-color: rgba(var(--color-success-rgb), 0.3);
  background: rgba(var(--color-success-rgb), 0.14);
  color: var(--color-success);
  margin-left: auto;
}
`
