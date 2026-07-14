import { useEffect, useMemo, useState } from 'react'
import { CodeBox, Section } from '../common'
import { parseAskUserAnswers, parseAskUserQuestions, splitSelectedAnswer } from '../helpers'
import type { AskUserQuestion, ToolBlockProps, ToolViewProps } from '../types'
import { GenericToolView } from './GenericToolView'

type Props = ToolViewProps & Pick<ToolBlockProps, 'onSubmitPrompt'>

export function AskUserToolView({ tool, result, status, onSubmitPrompt }: Props) {
  const prompt = tool._prompt
  const questions = useMemo(() => {
    const parsedQuestions = parseAskUserQuestions(tool.input)
    if (parsedQuestions.length > 0) return parsedQuestions
    if (!prompt) return parsedQuestions

    const header = typeof prompt.metadata?.header === 'string' ? prompt.metadata.header : ''
    const multiSelect = Boolean(prompt.metadata?.multiSelect)
    const options = (prompt.options ?? [])
      .filter((option) => String(option.value ?? option.label) !== '__other__')
      .map((option) => ({
        label: option.label,
        description: option.description,
      }))

    if (!prompt.message || options.length === 0) return parsedQuestions
    const fallbackQuestion: AskUserQuestion = {
      header,
      question: prompt.message,
      options,
      multiSelect,
    }
    return [fallbackQuestion]
  }, [prompt, tool.input])
  const answers = parseAskUserAnswers(result?.content)
  const activeQuestion = useMemo(() => {
    if (!prompt) return null
    return questions.find((question) => question.question === prompt.message) ?? questions[0] ?? null
  }, [prompt, questions])
  const [selectedValues, setSelectedValues] = useState<string[]>([])
  const [customAnswer, setCustomAnswer] = useState('')

  useEffect(() => {
    setSelectedValues([])
    setCustomAnswer('')
  }, [prompt?.promptId])

  // Prompt types that need a dedicated render even without a parsed question list
  const isTextPrompt = prompt?.type === 'text' && questions.length === 0
  const isConfirmPrompt = prompt?.type === 'confirm' && questions.length === 0

  if (questions.length === 0 && !prompt) {
    return <GenericToolView tool={tool} result={result} status={status} />
  }

  function submitPrompt() {
    if (!prompt?.promptId || !onSubmitPrompt) return
    const trimmedCustom = customAnswer.trim()
    if (isTextPrompt) {
      if (!trimmedCustom) return
      onSubmitPrompt(prompt.promptId, trimmedCustom)
      return
    }
    if (!activeQuestion) return
    if (trimmedCustom) {
      onSubmitPrompt(prompt.promptId, trimmedCustom)
      return
    }
    if (activeQuestion.multiSelect) {
      if (selectedValues.length === 0) return
      onSubmitPrompt(prompt.promptId, selectedValues)
      return
    }
    if (selectedValues[0]) {
      onSubmitPrompt(prompt.promptId, selectedValues[0])
    }
  }

  function toggleValue(value: string) {
    if (!activeQuestion?.multiSelect) {
      setSelectedValues([value])
      return
    }
    setSelectedValues((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    )
  }

  // ── Text prompt (free-form input, no options) ──────────────────────────
  if (isTextPrompt) {
    return (
      <div className="tb-ask-card">
        {prompt.message && <div className="tb-ask-question">{prompt.message}</div>}
        {status === 'running' ? (
          <div className="tb-ask-form">
            <label className="tb-ask-custom">
              <textarea
                className="tb-ask-textarea"
                rows={3}
                value={customAnswer}
                onChange={(event) => setCustomAnswer(event.target.value)}
                placeholder="Type your answer…"
                autoFocus
              />
            </label>
            <div className="tb-ask-actions">
              <button
                type="button"
                className="tb-ask-submit"
                onClick={submitPrompt}
                disabled={!customAnswer.trim()}
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          result?.content && (
            <div className="tb-ask-answer">
              <span className="tb-ask-answer-label">Answer</span>
              <span className="tb-ask-answer-value">{result.content}</span>
            </div>
          )
        )}
      </div>
    )
  }

  // ── Confirm prompt (yes / no) ──────────────────────────────────────────
  if (isConfirmPrompt) {
    return (
      <div className="tb-ask-card">
        {prompt.message && <div className="tb-ask-question">{prompt.message}</div>}
        {status === 'running' ? (
          <div className="tb-ask-options">
            <button
              type="button"
              className={`tb-ask-option${selectedValues[0] === 'true' ? ' tb-ask-option--selected' : ''}`}
              onClick={() => { setSelectedValues(['true']); onSubmitPrompt?.(prompt.promptId, true) }}
            >
              <div className="tb-ask-option-copy">
                <span className="tb-ask-option-label">Yes</span>
              </div>
            </button>
            <button
              type="button"
              className={`tb-ask-option${selectedValues[0] === 'false' ? ' tb-ask-option--selected' : ''}`}
              onClick={() => { setSelectedValues(['false']); onSubmitPrompt?.(prompt.promptId, false) }}
            >
              <div className="tb-ask-option-copy">
                <span className="tb-ask-option-label">No</span>
              </div>
            </button>
          </div>
        ) : (
          result?.content && (
            <div className="tb-ask-answer">
              <span className="tb-ask-answer-label">Answer</span>
              <span className="tb-ask-answer-value">
                {result.content === 'true' ? 'Yes' : result.content === 'false' ? 'No' : result.content}
              </span>
            </div>
          )
        )}
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

            <div className="tb-ask-options">
              {question.options.map((option) => {
                const selected = prompt && activeQuestion?.question === question.question
                  ? selectedValues.includes(option.label)
                  : selectedLabels.includes(option.label)
                return (
                  <button
                    key={option.label}
                    type="button"
                    className={`tb-ask-option${selected ? ' tb-ask-option--selected' : ''}`}
                    onClick={() => {
                      if (!prompt || activeQuestion?.question !== question.question) return
                      toggleValue(option.label)
                    }}
                    disabled={!prompt || activeQuestion?.question !== question.question}
                  >
                    <div className="tb-ask-option-copy">
                      <span className="tb-ask-option-label">{option.label}</span>
                      {option.description && (
                        <span className="tb-ask-option-description">{option.description}</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>

            {prompt && activeQuestion?.question === question.question && (
              <div className="tb-ask-form">
                <label className="tb-ask-custom">
                  <span className="tb-ask-custom-label">Or type your own answer</span>
                  <textarea
                    className="tb-ask-textarea"
                    rows={3}
                    value={customAnswer}
                    onChange={(event) => setCustomAnswer(event.target.value)}
                    placeholder="Write your own answer..."
                  />
                </label>
                <div className="tb-ask-actions">
                  <button
                    type="button"
                    className="tb-ask-submit"
                    onClick={submitPrompt}
                    disabled={!customAnswer.trim() && selectedValues.length === 0}
                  >
                    Validate
                  </button>
                </div>
              </div>
            )}

            {status === 'completed' && answer && (
              <div className="tb-ask-answer">
                <span className="tb-ask-answer-label">Answer</span>
                <span className="tb-ask-answer-value">{answer}</span>
              </div>
            )}

            {status === 'completed' && customAnswerSummary && (
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
