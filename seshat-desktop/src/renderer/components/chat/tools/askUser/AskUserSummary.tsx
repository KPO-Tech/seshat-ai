import type { ToolUseBlock } from '../../lib/chatTypes'
import { CodePanel } from '../ToolDetails'
import { parseAskUserAnswers, resolveAskUserQuestions } from './askUserQuestions'

export function AskUserSummary({ tool }: { tool: ToolUseBlock }) {
  const questions = resolveAskUserQuestions(tool.input, tool._prompt)
  const answers = parseAskUserAnswers(tool._result?.content)

  if (questions.length === 0) {
    const question = tool._prompt?.message || (typeof tool.input.question === 'string' ? tool.input.question : '')
    return (
      <div className="grid gap-2">
        {question && <div className="rounded-md bg-[var(--surface-muted)] px-3 py-2 text-[12px] font-semibold text-[var(--text-primary)]">{question}</div>}
        {tool._result?.content ? <CodePanel title="Answer" value={tool._result.content} /> : <CodePanel title="Input" value={tool.input} />}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-soft)] bg-[var(--surface-muted)]">
      <div className="border-b border-[var(--border-soft)] px-3 py-2 text-[12px] font-semibold text-[var(--text-primary)]">Ask User</div>
      <div className="grid gap-2 p-3">
        {questions.map((question, index) => {
          const answer = answers.get(question.question)
          return (
            <div key={`${question.question}-${index}`} className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-panel)] px-3 py-2">
              <div className="text-[11px] font-semibold text-[var(--text-muted)]">{question.header || `Question ${index + 1}`}</div>
              <div className="mt-1 text-[12px] font-semibold leading-5 text-[var(--text-primary)]">{question.question}</div>
              {answer ? (
                <div className="mt-2 rounded-md bg-[var(--accent-success)]/8 px-2 py-1.5 text-[12px] text-[var(--text-secondary)]">{answer}</div>
              ) : (
                <div className="mt-2 text-[11px] text-[var(--text-muted)]">Waiting for response</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
