import { describe, expect, it } from 'vitest'
import { resolveAskUserQuestions } from './askUserQuestions'

describe('resolveAskUserQuestions', () => {
  it('forces a plain textarea for a text-type prompt even if options are attached', () => {
    // regression: a free-text prompt shouldn't show selectable options - if
    // the backend attaches an `options` array to a type:'text' prompt
    // anyway, `type` must win, not `options`.
    const questions = resolveAskUserQuestions({}, {
      promptId: 'p1',
      type: 'text',
      message: 'Anything else?',
      options: [{ label: 'Yes' }, { label: 'No' }]
    })
    expect(questions[0].options).toEqual([])
    expect(questions[0].multiSelect).toBe(false)
  })

  it('still builds selectable options for a non-text prompt', () => {
    const questions = resolveAskUserQuestions({}, {
      promptId: 'p1',
      type: 'select',
      message: 'Pick one',
      options: [{ label: 'A' }, { label: 'B' }]
    })
    expect(questions[0].options).toHaveLength(2)
  })
})
