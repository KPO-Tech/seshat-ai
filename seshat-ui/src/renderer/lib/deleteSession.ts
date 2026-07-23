import { api } from '@/api/client'
import { useSessionStore } from '@/stores/session'
import { useUIStore } from '@/stores/ui'

// Shared by Sidebar.tsx (recent-chat menu) and Conversation.tsx (the "•••"
// conversation menu) so the delete + cleanup sequence lives in one place.
// Callers handle their own post-delete navigation.
export async function deleteSession(id: string): Promise<void> {
  await api.delete(`/sessions/${id}`)
  useSessionStore.getState().removeSession(id)
  useUIStore.getState().closeRightPanelsForSession(id)
}
