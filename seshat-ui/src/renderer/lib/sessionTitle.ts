export const UNTITLED_SESSION_TITLE = 'Untitled conversation'

export function isUntitledSessionTitle(title?: string | null): boolean {
  const normalized = (title ?? '').trim()
  return normalized === '' || normalized === UNTITLED_SESSION_TITLE
}

// The stored title only needs a hard ceiling to keep a pathological prompt
// (a multi-KB paste) from becoming the session's title verbatim - actual
// shortening for a given surface (sidebar, top bar) is that surface's own
// CSS truncation, not baked into the string itself. A cap this generous
// means most real prompts come through whole, leaving something for a
// wider surface (the History page's 2-line clamp) to actually show instead
// of everyone inheriting the narrowest surface's truncation permanently.
const MAX_TITLE_LENGTH = 200

export function generateSessionTitleFromPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim()
  if (!normalized) return UNTITLED_SESSION_TITLE

  const stripped = normalized
    .replace(/^(please|pls|can you|could you|i want you to|help me)\s+/i, '')
    .trim()

  const base = stripped || normalized
  return base.length > MAX_TITLE_LENGTH ? `${base.slice(0, MAX_TITLE_LENGTH).trimEnd()}...` : base
}
