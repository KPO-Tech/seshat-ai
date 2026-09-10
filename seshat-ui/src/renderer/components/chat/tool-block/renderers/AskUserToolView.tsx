import { useMemo } from 'react'
import { CodeBox, Section } from '../common'
import { parseAskUserAnswers, resolveAskUserQuestions } from '../helpers'
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
    <div className="tb-ask-summary">
      {questions.map((question, index) => {
        const answer = answers.get(question.question) ?? ''

        return (
          <div key={`${question.header}-${index}`} className="tb-ask-qa">
            <span className="tb-ask-qa-index">{index + 1}</span>
            <div className="tb-ask-qa-copy">
              <div className="tb-ask-question">{question.question}</div>
              {answer ? (
                <div className="tb-ask-answer-value">{answer}</div>
              ) : (
                <div className="tb-ask-note">No answer recorded yet.</div>
              )}
            </div>
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
    </div>
  )
}
