import { describe, expect, it } from 'vitest'
import { formatBytes, languageForPath, parseListDirectory, rangeLabel } from './FileToolBodies'

describe('languageForPath', () => {
  it('maps common extensions to a highlighter language', () => {
    expect(languageForPath('src/main.go')).toBe('go')
    expect(languageForPath('index.tsx')).toBe('tsx')
  })

  it('recognizes a bare Dockerfile with no extension', () => {
    expect(languageForPath('backend/Dockerfile')).toBe('docker')
  })

  it('returns undefined for an unknown extension', () => {
    expect(languageForPath('data.xyz')).toBeUndefined()
  })
})

describe('rangeLabel', () => {
  it('describes an offset+limit window as a 1-based line range', () => {
    expect(rangeLabel(10, 20)).toBe('lines 11–30')
  })

  it('describes an offset-only read', () => {
    expect(rangeLabel(5, undefined)).toBe('from line 6')
  })

  it('describes a limit-only read', () => {
    expect(rangeLabel(undefined, 50)).toBe('first 50 lines')
  })

  it('is empty when neither is set', () => {
    expect(rangeLabel(undefined, undefined)).toBe('')
  })
})

describe('parseListDirectory', () => {
  it('parses the real Go tool output shape', () => {
    const content = JSON.stringify({
      path: '/tmp',
      entries: [{ name: 'a.txt', is_directory: false, is_symlink: false, size_bytes: 12 }],
      count: 1,
      truncated: false
    })
    expect(parseListDirectory(content)).toMatchObject({ count: 1, truncated: false })
  })

  it('returns null for non-JSON or JSON missing an entries array', () => {
    expect(parseListDirectory('not json')).toBeNull()
    expect(parseListDirectory('{"path":"/tmp"}')).toBeNull()
  })
})

describe('formatBytes', () => {
  it('formats bytes, kilobytes, and megabytes', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
