import type { Skill } from '../api/types'

// ─── Collection grouping helpers ──────────────────────────────────────────────

const SIDEBAR_COLLECTION_ORDER = ['user', 'builtin', 'managed', 'mcp']
export const SIDEBAR_COLLECTION_LABELS: Record<string, string> = {
  user:    'My Skills',
  builtin: 'Built-in',
  managed: 'Managed',
  mcp:     'MCP',
}

export function groupForSidebar(skills: Skill[]) {
  const map = new Map<string, Skill[]>()
  for (const sk of skills) {
    const coll = sk.collection || 'user'
    const arr = map.get(coll) ?? []
    arr.push(sk)
    map.set(coll, arr)
  }
  const result: { label: string; skills: Skill[]; readOnly: boolean; collection: string }[] = []
  for (const coll of SIDEBAR_COLLECTION_ORDER) {
    const g = map.get(coll)
    if (g) {
      result.push({ label: SIDEBAR_COLLECTION_LABELS[coll], skills: g, readOnly: coll !== 'user', collection: coll })
      map.delete(coll)
    }
  }
  for (const [coll, g] of map) {
    const label = coll.charAt(0).toUpperCase() + coll.slice(1)
    result.push({ label, skills: g, readOnly: true, collection: coll })
  }
  return result
}

export function isUserSkill(skill: Skill) {
  return skill.collection === 'user'
}

