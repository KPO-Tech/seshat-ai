import { create } from 'zustand'
import type { ChatMessage, ChatSession, StreamingBlock } from '@renderer/components/chat/chatTypes'

type ChatState = {
  sessions: ChatSession[]
  activeSessionId: string | null
  streaming: StreamingBlock[]
  isStreaming: boolean
  setSessions: (sessions: ChatSession[]) => void
  setActiveSessionId: (id: string | null) => void
  upsertSession: (session: ChatSession) => void
  addMessage: (sessionId: string, message: ChatMessage) => void
  setMessages: (sessionId: string, messages: ChatMessage[]) => void
  setStreaming: (blocks: StreamingBlock[]) => void
  clearStreaming: () => void
  setIsStreaming: (isStreaming: boolean) => void
}

export const useChatStore = create<ChatState>()((set) => ({
  sessions: [],
  activeSessionId: null,
  streaming: [],
  isStreaming: false,
  setSessions: (sessions) => set({ sessions }),
  setActiveSessionId: (activeSessionId) => set({ activeSessionId, streaming: [] }),
  upsertSession: (session) => set((state) => {
    const exists = state.sessions.some((item) => item.id === session.id)
    const sessions = exists
      ? state.sessions.map((item) => item.id === session.id ? { ...item, ...session } : item)
      : [session, ...state.sessions]
    return { sessions }
  }),
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
  setStreaming: (streaming) => set({ streaming }),
  clearStreaming: () => set({ streaming: [] }),
  setIsStreaming: (isStreaming) => set({ isStreaming })
}))
