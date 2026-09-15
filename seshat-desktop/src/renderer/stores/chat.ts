import { create } from 'zustand'
import type { ChatMessage, ChatSession, StreamingBlock } from '@renderer/components/chat/lib/chatTypes'

type ChatState = {
  sessions: ChatSession[]
  activeSessionId: string | null
  streamingBySession: Record<string, StreamingBlock[]>
  isStreamingBySession: Record<string, boolean>
  setSessions: (sessions: ChatSession[]) => void
  setActiveSessionId: (id: string | null) => void
  upsertSession: (session: ChatSession) => void
  updateSession: (id: string, patch: Partial<ChatSession>) => void
  addMessage: (sessionId: string, message: ChatMessage) => void
  setMessages: (sessionId: string, messages: ChatMessage[]) => void
  getStreaming: (sessionId: string | null) => StreamingBlock[]
  setStreaming: (sessionId: string, blocks: StreamingBlock[]) => void
  clearStreaming: (sessionId: string) => void
  isSessionStreaming: (sessionId: string | null) => boolean
  setIsStreaming: (sessionId: string, isStreaming: boolean) => void
  resetAll: () => void
}

export const useChatStore = create<ChatState>()((set, get) => ({
  sessions: [],
  activeSessionId: null,
  streamingBySession: {},
  isStreamingBySession: {},
  setSessions: (sessions) => set({ sessions }),
  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
  upsertSession: (session) => set((state) => {
    const exists = state.sessions.some((item) => item.id === session.id)
    const sessions = exists
      ? state.sessions.map((item) => item.id === session.id ? { ...item, ...session, status: session.status ?? item.status } : item)
      : [session, ...state.sessions]
    return { sessions }
  }),
  updateSession: (id, patch) => set((state) => ({
    sessions: state.sessions.map((session) => session.id === id ? { ...session, ...patch } : session)
  })),
  addMessage: (sessionId, message) => set((state) => ({
    sessions: state.sessions.map((session) => (
      session.id === sessionId
        ? { ...session, messages: [...session.messages, message], updatedAt: new Date().toISOString() }
        : session
    ))
  })),
  setMessages: (sessionId, messages) => set((state) => ({
    sessions: state.sessions.map((session) => session.id === sessionId ? { ...session, messages } : session)
  })),
  getStreaming: (sessionId) => {
    if (!sessionId) return []
    return get().streamingBySession[sessionId] ?? []
  },
  setStreaming: (sessionId, blocks) => set((state) => ({
    streamingBySession: { ...state.streamingBySession, [sessionId]: blocks }
  })),
  clearStreaming: (sessionId) => set((state) => {
    const next = { ...state.streamingBySession }
    delete next[sessionId]
    return { streamingBySession: next }
  }),
  isSessionStreaming: (sessionId) => {
    if (!sessionId) return false
    return Boolean(get().isStreamingBySession[sessionId])
  },
  setIsStreaming: (sessionId, isStreaming) => set((state) => {
    const next = { ...state.isStreamingBySession }
    if (isStreaming) {
      next[sessionId] = true
    } else {
      delete next[sessionId]
    }
    return {
      isStreamingBySession: next,
      sessions: state.sessions.map((session) => session.id === sessionId ? {
        ...session,
        status: isStreaming ? 'running' : session.status
      } : session)
    }
  }),
  resetAll: () => set({
    sessions: [],
    activeSessionId: null,
    streamingBySession: {},
    isStreamingBySession: {}
  })
}))
