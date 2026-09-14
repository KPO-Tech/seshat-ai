export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// Base look for an attachment tile's clickable surface (ChatInput's own
// pre-send attachment row) - border color is layered on separately per
// category (image/documents/other), see attachmentBorderClass below.
export const ATTACHMENT_THUMB_CSS = 'block h-full w-full cursor-pointer overflow-hidden rounded-app-md border bg-app-surface p-0 text-app-text-secondary'

export function attachmentBorderClass(category: string): string {
  if (category === 'image') return 'border-[color-mix(in_srgb,var(--color-primary)_36%,transparent)]'
  if (category === 'documents') return 'border-[color-mix(in_srgb,var(--color-success)_34%,transparent)]'
  return 'border-app-border-subtle'
}

// Shared 28x28 icon-button look for the footer's tool row (attach, project,
// corpus, mic - not the circular "+" or the send/stop buttons, which each
// have their own distinct shape).
export const NOTICE_CSS = 'flex items-center justify-start gap-2 rounded-app-md border border-[rgba(var(--color-error-rgb),0.16)] bg-[rgba(var(--color-error-rgb),0.08)] px-2 py-1.5 text-[11px] leading-[1.4] text-app-error'

export const TOOL_ICON_CSS = 'flex h-7 w-7 items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-app-text-muted transition-colors duration-150 hover:bg-[var(--color-hover)] hover:text-app-text-secondary disabled:cursor-progress disabled:opacity-55'
