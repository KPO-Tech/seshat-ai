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
    <div className="pfc-root">
      <div className="pfc-card">
        <div className="pfc-icon">{icon}</div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
        <div className="pfc-note">{note}</div>
      </div>
    </div>
  )
}

export const PLANNED_FEATURE_CARD_CSS = `
.pfc-root {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 34px;
}
.pfc-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  max-width: 380px;
}
.pfc-icon {
  width: 52px; height: 52px; border-radius: 13px;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, transparent);
  color: var(--color-primary);
  margin-bottom: 4px;
}
.pfc-card h2 { margin: 0; font-size: var(--font-size-base); font-weight: 700; color: var(--color-text); }
.pfc-card p { margin: 0; font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height: 1.5; }
.pfc-note {
  margin-top: 6px;
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
  background: var(--color-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  padding: 8px 12px;
  line-height: 1.5;
}
`
