import { describe, expect, it } from 'vitest'
import { looksStructured } from './GenericToolBodies'

describe('looksStructured', () => {
  it('recognizes valid JSON objects and arrays', () => {
    expect(looksStructured('{"a":1}')).toBe(true)
    expect(looksStructured('[1,2,3]')).toBe(true)
  })

  it('rejects plain prose, even if it happens to contain braces', () => {
    expect(looksStructured('The answer is 4.')).toBe(false)
    expect(looksStructured('{not actually json')).toBe(false)
  })
})
