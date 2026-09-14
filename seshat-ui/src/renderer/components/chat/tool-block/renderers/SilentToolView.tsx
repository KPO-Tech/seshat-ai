import { useState } from 'react'
import type { ToolViewProps } from '../types'
import type { ToolStatus } from '@/api/types'
import { useUIStore } from '@/stores/ui'
import { useSessionStore } from '@/stores/session'
import { PlanArtifactCard } from '@/components/chat/plan/PlanArtifactCard'
import { categoryIcon, hasCustomRender, renderToolBody, toolLabel } from '../toolDisplay'

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function lineIcon(toolName: string, isRunning: boolean, isError: boolean) {
  if (isRunning) {
    return <span className="size-2.5 shrink-0 animate-spin rounded-full border-[1.5px] border-[rgba(239,124,47,0.2)] border-t-[var(--color-accent)]" />
  }
  return (
    <span className={cx('relative inline-flex shrink-0 items-center justify-center text-app-text-muted', isError && 'text-app-text-secondary')}>
      {categoryIcon(toolName)}
      {isError && <span className="absolute -right-0.5 -top-0.5 size-[5px] rounded-full bg-app-error" />}
    </span>
  )
}

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
    <div className="flex flex-col">
      <div
        className={cx(
          'inline-flex w-full select-none items-center gap-1.5 rounded-md py-[3px] pr-[5px] text-[10.5px] leading-snug text-app-text-muted',
          clickable ? 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--color-surface)_42%,transparent)] hover:text-app-text-secondary' : 'cursor-default',
        )}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? handleClick : undefined}
        onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() } : undefined}
      >
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
          {lineIcon(tool.name, isRunning, isError)}
        </span>
        <span className="shrink-0 font-medium not-italic text-inherit">{label}</span>
        {isError && <span className="shrink-0 text-[9px] font-bold leading-none text-app-error">failed</span>}
        {snippet && <span className="min-w-0 flex-1 truncate font-mono text-[10px] opacity-[0.62]">{snippet}</span>}
        {expandable && (
          <span className={cx('shrink-0 text-[10px] leading-none opacity-45 transition-transform duration-150', open && 'rotate-180')}>▾</span>
        )}
      </div>
      {/* Delegates to the tool's own dedicated renderer (or GenericToolView
          if it doesn't have one) instead of dumping raw result.content -
          same "every full-card renderer owns its own presentation" rule the
          non-silent surfaces already follow, see DESIGN.md. */}
      {open && expandable && (
        <div className="pl-[22px] [&>.tb-hcard:first-child]:rounded-b-md [&>.tb-hcard:first-child]:rounded-t-none [&>.tb-hcard:first-child]:border-t-0">{renderToolBody({ tool, result, status })}</div>
      )}
    </div>
  )
}
