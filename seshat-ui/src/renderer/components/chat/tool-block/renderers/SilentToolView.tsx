import { useState } from 'react'
import type { ToolViewProps } from '../types'
import type { ToolStatus } from '@/api/types'
import { useUIStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { PlanArtifactCard } from '@/components/chat/plan/PlanArtifactCard'
import { categoryIcon, hasCustomRender, renderToolBody, toolLabel } from '../toolDisplay'

const CSS = `
.tb-sl {
  display: flex;
  flex-direction: column;
  margin: 0 0 2px;
}

.tb-sl-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 5px 3px 0;
  border-radius: 6px;
  font-size: 10.5px;
  line-height: 1.35;
  color: var(--color-text-muted);
  cursor: default;
  user-select: none;
  width: 100%;
}

.tb-sl-line--clickable {
  cursor: pointer;
}

.tb-sl-line--clickable:hover {
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-surface) 42%, transparent);
}

.tb-sl-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.tb-sl-name {
  font-style: normal;
  color: inherit;
  flex-shrink: 0;
  font-weight: 500;
}

/* Was a flat max-width:320px regardless of how much room the row actually
   had - flex:1/min-width:0 lets it fill whatever space is left after the
   label (and icon/arrow) instead of truncating early on a wide window. */
.tb-sl-snippet {
  font-family: monospace;
  font-size: 10px;
  opacity: 0.62;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.tb-sl-arrow {
  opacity: 0.45;
  font-size: 10px;
  transition: transform 0.15s;
  line-height: 1;
  flex-shrink: 0;
}

.tb-sl-arrow--open {
  transform: rotate(180deg);
}

.tb-sl-body {
  margin-top: 4px;
  padding-left: 22px;
}

.tb-sl-status {
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
}

.tb-sl-status--failed { color: var(--color-error); }
`

type Props = ToolViewProps & { status: ToolStatus; snippet: string }

function humanizeSlug(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// submit_plan's own tool call carries no interesting input/output to show -
// what the user actually wants here is the plan's name, clickable straight
// to the review panel, instead of a generic "Submit Plan" label (see
// PlanArtifactCard, which already does this for the chat-level card; this
// is the same affordance for the tool-call line itself).
function submitPlanInfo(tool: Props['tool'], result: Props['result']): { name: string; planId: string } {
  const slug = typeof tool.input.slug === 'string' ? (tool.input.slug as string) : ''
  // submit_plan's Go tool puts plan_id in ResultMetadata.Additional, but the
  // engine/backend always flatten Additional's keys onto the metadata object
  // it sends over the wire (see toolResultMetadata/buildToolResultMessages/
  // buildToolResultSSE) - there is no nested `metadata.additional` on any
  // event type. plan_id lives at metadata.plan_id directly.
  const metadata = result?.metadata as Record<string, unknown> | undefined
  const planId =
    (typeof tool.input.plan_id === 'string' && tool.input.plan_id) ||
    (typeof metadata?.plan_id === 'string' ? (metadata.plan_id as string) : '') ||
    ''
  return { name: slug ? humanizeSlug(slug) : 'Submit Plan', planId }
}

export function SilentToolView({ tool, result, status, snippet, sessionId }: Props) {
  const [open, setOpen] = useState(false)
  const isError = result?.isError === true || status === 'failed'
  const isRunning = status === 'running' || status === 'pending'
  const isSubmitPlan = tool.name === 'submit_plan'
  const { name: planName, planId } = isSubmitPlan
    ? submitPlanInfo(tool, result)
    : { name: '', planId: '' }
  const canOpenPlan = isSubmitPlan && !isError && !!planId && !!sessionId
  // Once the plan document has synced into the store, submit_plan gets the
  // exact same document-card look as the chat-level PlanArtifactCard
  // (icon, name, live status badge) instead of a plain text line - clicking
  // it always reopens the panel, read-only once no longer pending, so
  // scrolling back to this tool call stays a way to reread the plan forever.
  const livePlan = useSessionStore((s) => (canOpenPlan ? s.getPlan(sessionId!, planId) : undefined))
  if (isSubmitPlan && livePlan && sessionId) {
    return <PlanArtifactCard plan={livePlan} sessionId={sessionId} readOnly />
  }

  const label = isSubmitPlan ? planName : toolLabel(tool.name)

  // A silent tool with its own dedicated renderer (read, list_directory, …)
  // stays worth opening even when it succeeded, not only on error - a
  // pure-confirmation tool with no renderer (create_directory, …) still
  // only opens on error, same as before, since GenericToolView's raw
  // Input/Output split is the only thing there'd be to show either way.
  const hasRender = hasCustomRender(tool.name)
  const expandable = isError || hasRender

  function handleClick() {
    if (canOpenPlan) {
      useUIStore.getState().openRightPanel({ kind: 'plan', title: planName, sessionId: sessionId!, planId })
      return
    }
    if (expandable) setOpen((v) => !v)
  }

  const clickable = expandable || canOpenPlan

  return (
    <div className="tb-sl">
      <style>{CSS}</style>
      <div
        className={`tb-sl-line${clickable ? ' tb-sl-line--clickable' : ''}`}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? handleClick : undefined}
        onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() } : undefined}
      >
        <span className="tb-sl-icon">
          {isRunning && <span className="tl-spinner" />}
          {!isRunning && (
            <span className={`tl-icon${isError ? ' tl-icon--err' : ''}`}>
              {categoryIcon(tool.name)}
              {isError && <span className="tl-icon-badge" />}
            </span>
          )}
        </span>
        <span className="tb-sl-name">{label}</span>
        {isError && <span className="tb-sl-status tb-sl-status--failed">failed</span>}
        {snippet && <span className="tb-sl-snippet">{snippet}</span>}
        {expandable && (
          <span className={`tb-sl-arrow${open ? ' tb-sl-arrow--open' : ''}`}>▾</span>
        )}
      </div>
      {/* Delegates to the tool's own dedicated renderer (or GenericToolView
          if it doesn't have one) instead of dumping raw result.content -
          same "every full-card renderer owns its own presentation" rule the
          non-silent surfaces already follow, see DESIGN.md. */}
      {open && expandable && (
        <div className="tb-sl-body">{renderToolBody({ tool, result, status })}</div>
      )}
    </div>
  )
}
