const KNOWLEDGE_CHAT_PREFERENCE_KEY = 'seshat.knowledge-chat-preferred-model.v1'

export type ChatModelPreference = { providerSettingId: string; modelId: string }

export function loadChatModelPreference(): ChatModelPreference | null {
  try {
    const raw = localStorage.getItem(KNOWLEDGE_CHAT_PREFERENCE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.providerSettingId === 'string' && typeof parsed.modelId === 'string') {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function saveChatModelPreference(pref: ChatModelPreference | null) {
  try {
    if (!pref) {
      localStorage.removeItem(KNOWLEDGE_CHAT_PREFERENCE_KEY)
      return
    }
    localStorage.setItem(KNOWLEDGE_CHAT_PREFERENCE_KEY, JSON.stringify(pref))
  } catch {
    // best-effort only
  }
}
