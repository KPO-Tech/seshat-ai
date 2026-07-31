export const UNTITLED_SESSION_TITLE = 'Untitled conversation'

export function isUntitledSessionTitle(title?: string | null): boolean {
  const normalized = (title ?? '').trim()
  return normalized === '' || normalized === UNTITLED_SESSION_TITLE
}
