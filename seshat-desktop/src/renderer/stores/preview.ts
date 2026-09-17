import { create } from 'zustand'
import type { MessageAttachment } from '@renderer/components/chat/lib/chatTypes'

export type PreviewMode = 'side' | 'center' | 'fullscreen'

export type PreviewItem = {
  kind: 'file' | 'image' | 'artifact'
  title: string
  attachment?: MessageAttachment
  url?: string
  contentType?: string
}

type PreviewState = {
  item: PreviewItem | null
  mode: PreviewMode
  open: (item: PreviewItem, mode?: PreviewMode) => void
  close: () => void
  setMode: (mode: PreviewMode) => void
}

export const usePreviewStore = create<PreviewState>()((set) => ({
  item: null,
  mode: 'center',
  open: (item, mode) => set((state) => ({ item, mode: mode ?? state.mode })),
  close: () => set({ item: null }),
  setMode: (mode) => set({ mode })
}))
