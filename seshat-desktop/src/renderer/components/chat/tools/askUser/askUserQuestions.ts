import type { ToolPromptRequest } from '../../lib/chatTypes'

export type AskUserOption = {
  label: string
  description?: string
  value?: unknown
}

export type AskUserQuestion = {
  header: string
  question: string
  options: AskUserOption[]
  multiSelect: boolean
  kind?: 'confirm'
}

export function resolveAskUserQuestions(input: Record<string, unknown>, prompt?: ToolPromptRequest): AskUserQuestion[] {
  const parsed = parseAskUserQuestions(input)
  if (parsed.length > 0) return parsed
  if (!prompt?.message) return parsed

  const header = typeof prompt.metadata?.header === 'string' ? prompt.metadata.header : ''
  if (prompt.type === 'confirm') {
    return [{
      header,
      question: prompt.message,
      options: [{ label: 'Yes', value: true }, { label: 'No', value: false }],
      multiSelect: false,
      kind: 'confirm'
    }]
  }

  // A free-text prompt should always render as a plain textarea, even if
  // the backend somehow also attached an `options` array (a free-text
  // question shouldn't have options in the first place, but a "text" type
  // is the more explicit signal and takes precedence over whatever
  // `options` happens to contain).
  const options = prompt.type === 'text' ? [] : (prompt.options ?? [])
    .filter((option) => String(option.value ?? option.label) !== '__other__')
    .map((option) => ({
      label: option.label,
      description: option.description,
      value: option.value ?? option.label
    }))

  return [{
    header,
    question: prompt.message,
    options,
    multiSelect: prompt.type === 'text' ? false : Boolean(prompt.metadata?.multiSelect)
  }]
}

export function parseAskUserAnswers(content?: string) {
  const answers = new Map<string, string>()
  if (!content) return answers

  const matches = content.matchAll(/Q:\s*(.+?)\nA:\s*([\s\S]*?)(?=\n(?:Preview:|Notes:|Q:)|$)/g)
  for (const match of matches) {
    const question = match[1]?.trim()
    const answer = match[2]?.trim()
    if (question && answer) answers.set(question, answer)
  }
  return answers
}

function parseAskUserQuestions(input: Record<string, unknown>): AskUserQuestion[] {
  const rawQuestions = input.questions
  if (!Array.isArray(rawQuestions)) return []

  const questions: AskUserQuestion[] = []
  for (const entry of rawQuestions) {
    if (!entry || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    if (typeof raw.question !== 'string') continue

    const options: AskUserOption[] = []
    if (Array.isArray(raw.options)) {
      for (const option of raw.options) {
        if (!option || typeof option !== 'object') continue
        const item = option as Record<string, unknown>
        if (typeof item.label !== 'string') continue
        options.push({
          label: item.label,
          description: typeof item.description === 'string' ? item.description : undefined,
          value: item.value ?? item.label
        })
      }
    }

    questions.push({
      header: typeof raw.header === 'string' ? raw.header : '',
      question: raw.question,
      options,
      multiSelect: Boolean(raw.multiSelect)
    })
  }
  return questions
}
