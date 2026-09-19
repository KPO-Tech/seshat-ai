import { describe, expect, it } from 'vitest'
import type { ChatSession } from '@renderer/stores/session'
import { normalizeProjectPath, resolveProjectContextPath, selectRecentSessions } from './projectContext'

function session(overrides: Partial<ChatSession>): ChatSession {
  return { id: 'a', title: 'A', messages: [], createdAt: '2026-01-01T00:00:00Z', ...overrides }
}

describe('normalizeProjectPath', () => {
  it('trims and drops trailing separators', () => {
    expect(normalizeProjectPath('  C:\\work\\app\\ ')).toBe('C:\\work\\app')
    expect(normalizeProjectPath('/home/me/app//')).toBe('/home/me/app')
  })
})

describe('selectRecentSessions', () => {
  const sessions = [
    session({ id: 'old', updatedAt: '2026-01-02T00:00:00Z' }),
    session({ id: 'new', updatedAt: '2026-03-01T00:00:00Z' }),
    session({ id: 'kb', source: 'knowledge' }),
    session({ id: 'inbox', source: 'inbox' }),
    session({ id: 'proj', projectPath: 'C:\\work\\app', updatedAt: '2026-02-01T00:00:00Z' })
  ]

  it('outside a project keeps only non-project chats, newest first, without knowledge or inbox', () => {
    expect(selectRecentSessions(sessions, null).map((s) => s.id)).toEqual(['new', 'old'])
  })

  it('inside a project keeps only that project, ignoring case and trailing slash', () => {
    expect(selectRecentSessions(sessions, 'c:\\WORK\\app\\').map((s) => s.id)).toEqual(['proj'])
  })

  it('caps the list', () => {
    expect(selectRecentSessions(sessions, null, 1)).toHaveLength(1)
  })
})

describe('resolveProjectContextPath', () => {
  it('prefers the ?project= parameter', () => {
    expect(resolveProjectContextPath({ projectParam: '/p', conversationRouteId: 'x' }, [])).toBe('/p')
  })

  it('uses the project of the open conversation', () => {
    const sessions = [session({ id: 'c1', projectPath: '/repo' })]
    expect(resolveProjectContextPath({ projectParam: null, conversationRouteId: 'c1' }, sessions)).toBe('/repo')
  })

  it('returns null with no project signal', () => {
    expect(resolveProjectContextPath({ projectParam: null }, [])).toBeNull()
  })
})
