import type { ReactNode } from 'react'

type Props = {
  icon: ReactNode
  title: string
  description?: string
  note: string
}

/**
 * Shared placeholder for a feature that's designed but not wired to a
 * backend yet — e.g. Workspace's Templates tab, Knowledge's public catalog.
 * Keeps "not built yet" content visually consistent instead of every page
 * inventing its own card. Not for pages like Team, which show real preview
 * content (mission flow, feature grid) rather than a simple placeholder.
 */
export function PlannedFeatureCard({ icon, title, description, note }: Props) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-[34px]">
      <div className="flex max-w-[380px] flex-col items-center gap-2.5 text-center">
        <div className="mb-1 flex size-[52px] items-center justify-center rounded-[13px] border border-[color-mix(in_srgb,var(--color-primary)_22%,transparent)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] text-[var(--color-primary)]">{icon}</div>
        <h2 className="m-0 text-base font-bold text-app-text">{title}</h2>
        {description && <p className="m-0 text-sm leading-[1.5] text-app-text-secondary">{description}</p>}
        <div className="mt-1.5 rounded-lg border border-app-border-subtle bg-app-surface px-3 py-2 text-[var(--font-size-2xs)] leading-[1.5] text-app-text-muted">{note}</div>
      </div>
    </div>
  )
}
