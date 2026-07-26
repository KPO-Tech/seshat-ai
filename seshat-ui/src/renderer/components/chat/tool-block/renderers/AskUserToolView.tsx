import { useMemo } from 'react'
import { CodeBox, Section } from '../common'
import { parseAskUserAnswers, resolveAskUserQuestions, splitSelectedAnswer } from '../helpers'
import type { ToolViewProps } from '../types'
import { GenericToolView } from './GenericToolView'

// Read-only: answering an ask_user_question call happens in AskUserPanel,
// docked above the message box (see Conversation.tsx's pendingAskUser).
// This inline card's only jobs are (a) point there while a question is
// actively pending, and (b) once answered, be the permanent Q&A record in
// the transcript - it never renders its own inputs.
export function AskUserToolView({ tool, result, status }: ToolViewProps) {
  const prompt = tool._prompt
  const questions = useMemo(() => resolveAskUserQuestions(tool.input, prompt), [prompt, tool.input])
  const answers = parseAskUserAnswers(result?.content)

  if (questions.length === 0 && !prompt) {
    return <GenericToolView tool={tool} result={result} status={status} />
  }

  if (status === 'running' && prompt) {
    return (
      <div className="tb-ask-card tb-ask-card--pending">
        <span className="tb-ask-pending-note">Waiting for your answer above the message box.</span>
      </div>
    )
  }

  return (
    <>
      {questions.map((question, index) => {
        const answer = answers.get(question.question) ?? ''
        const selectedLabels = splitSelectedAnswer(answer)
        const hasKnownSelection = selectedLabels.some((label) =>
          question.options.some((option) => option.label === label),
        )
        const customAnswerSummary = answer && !hasKnownSelection ? answer : ''

        return (
          <div key={`${question.header}-${index}`} className="tb-ask-card">
            <div className="tb-ask-card-top">
              <span className="tb-ask-chip">
                {question.header || `Question ${index + 1}`}
              </span>
              {question.multiSelect && (
                <span className="tb-ask-meta">Multi-select</span>
              )}
            </div>

            <div className="tb-ask-question">{question.question}</div>

            {question.options.length > 0 && (
              <div className="tb-ask-options">
                {question.options.map((option) => (
                  <div
                    key={option.label}
                    className={`tb-ask-option tb-ask-option--readonly${selectedLabels.includes(option.label) ? ' tb-ask-option--selected' : ''}`}
                  >
                    <div className="tb-ask-option-copy">
                      <span className="tb-ask-option-label">{option.label}</span>
                      {option.description && (
                        <span className="tb-ask-option-description">{option.description}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {answer && (
              <div className="tb-ask-answer">
                <span className="tb-ask-answer-label">Answer</span>
                <span className="tb-ask-answer-value">{answer}</span>
              </div>
            )}

            {customAnswerSummary && (
              <div className="tb-ask-note">
                Custom user input was provided for this question.
              </div>
            )}
          </div>
        )
      })}

      {status === 'running' && !result?.content && !prompt && (
        <div className="tb-ask-note">Waiting for the user response.</div>
      )}

      {status === 'failed' && result?.content && (
        <Section label="Error">
          <CodeBox content={result.content} variant="error" copyable />
        </Section>
      )}
    </>
  )
}
