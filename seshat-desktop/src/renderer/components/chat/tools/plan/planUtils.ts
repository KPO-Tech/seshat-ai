import type { ToolUseBlock } from '../../lib/chatTypes'

export function planIdFromTool(tool: ToolUseBlock) {
  return firstText(
    tool._plan?.plan_id,
    tool._plan?.planId,
    tool.input.plan_id,
    tool.input.planId,
    tool._result?.metadata?.plan_id,
    tool._result?.metadata?.planId,
    tool._approval?.metadata?.plan_id,
    tool._approval?.metadata?.planId,
    tool._approval?.toolInput?.plan_id,
    tool._approval?.toolInput?.planId
  )
}

export function planTitleFromSlug(slug: string) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export function submitPlanName(tool: ToolUseBlock) {
  const slug = typeof tool._plan?.slug === 'string' ? tool._plan.slug : typeof tool.input.slug === 'string' ? tool.input.slug : ''
  return slug ? planTitleFromSlug(slug) : 'Plan'
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}
