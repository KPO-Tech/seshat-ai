export const UNTITLED_SESSION_TITLE = 'Untitled conversation'

export function isUntitledSessionTitle(title?: string | null): boolean {
  const normalized = (title ?? '').trim()
  return normalized === '' || normalized === UNTITLED_SESSION_TITLE
}

export function generateSessionTitleFromPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim()
  if (!normalized) return UNTITLED_SESSION_TITLE

  const stripped = normalized
    .replace(/^(please|pls|can you|could you|i want you to|help me)\s+/i, '')
    .trim()

  const base = stripped || normalized
  return base.length > 56 ? `${base.slice(0, 56).trimEnd()}...` : base
}
