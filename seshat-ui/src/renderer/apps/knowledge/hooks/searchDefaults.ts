const KNOWLEDGE_SEARCH_DEFAULTS_KEY = 'seshat.knowledge-search-defaults.v1'

// Which corpus a fresh Knowledge session starts scoped to, and how many
// chunks it asks for per search - a per-device UI preference (localStorage),
// not account state, same reasoning as chatPreference.ts's model choice.
// Configured from Settings > Knowledge (see pages/settings/KnowledgeView.tsx);
// KnowledgePage reads this once as its initial state, same precedent as
// loadChatModelPreference.
export type SearchDefaults = { corpusId: string; topK: number }

const DEFAULTS: SearchDefaults = { corpusId: 'all', topK: 8 }

export function loadSearchDefaults(): SearchDefaults {
  try {
    const raw = localStorage.getItem(KNOWLEDGE_SEARCH_DEFAULTS_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw)
    return {
      corpusId: typeof parsed?.corpusId === 'string' ? parsed.corpusId : DEFAULTS.corpusId,
      topK: typeof parsed?.topK === 'number' ? parsed.topK : DEFAULTS.topK,
    }
  } catch {
    return DEFAULTS
  }
}

export function saveSearchDefaults(prefs: SearchDefaults) {
  try {
    localStorage.setItem(KNOWLEDGE_SEARCH_DEFAULTS_KEY, JSON.stringify(prefs))
  } catch {
    // best-effort only
  }
}
