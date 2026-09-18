import { beforeEach, describe, expect, it } from 'vitest'
import { useChatStore } from './chat'
import type { ChatSession } from '@renderer/components/chat/lib/chatTypes'

function session(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 's1',
    title: 'Task',
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('useChatStore.upsertSession', () => {
  beforeEach(() => {
    useChatStore.setState({ sessions: [], isStreamingBySession: {} })
  })

  it('keeps the in-progress local messages when a stale fetch lands mid-stream', () => {
    const localMessages = [{ id: 'user-1', role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] }]
    useChatStore.setState({
      sessions: [session({ messages: localMessages, status: 'running' })],
      isStreamingBySession: { s1: true }
    })

    // a refetch that landed before the backend had persisted the new turn
    useChatStore.getState().upsertSession(session({ messages: [], status: 'idle', title: 'Renamed' }))

    const updated = useChatStore.getState().sessions.find((s) => s.id === 's1')
    expect(updated?.messages).toBe(localMessages)
    expect(updated?.status).toBe('running')
    // non-volatile fields still update
    expect(updated?.title).toBe('Renamed')
  })

  it('replaces messages normally when the session is not currently streaming', () => {
    useChatStore.setState({
      sessions: [session({ messages: [{ id: 'old', role: 'user', content: [] }] })],
      isStreamingBySession: {}
    })

    const fresh = [{ id: 'new', role: 'assistant' as const, content: [{ type: 'text' as const, text: 'done' }] }]
    useChatStore.getState().upsertSession(session({ messages: fresh }))

    expect(useChatStore.getState().sessions.find((s) => s.id === 's1')?.messages).toBe(fresh)
  })
})
