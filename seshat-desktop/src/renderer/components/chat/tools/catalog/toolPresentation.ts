export type ToolIntent = 'observable' | 'informational' | 'delegated'
export type ToolRenderMode = 'compact' | 'agent_activity' | 'live_workspace'
export type LiveToolSurface = 'browser' | 'terminal' | 'editor' | 'computer' | 'tasks'

export type ToolPresentation = {
  intent: ToolIntent
  mode: ToolRenderMode
  label: string
  surface?: LiveToolSurface
  initiallyOpen?: boolean
}

// Keep this policy in code as well as docs/chat-tool-rendering.md:
// observable tools get live workspaces, informational tools get compact cards,
// delegated tools get agent activity cards.
export function getToolPresentation(name: string): ToolPresentation {
  const normalized = normalizeToolName(name)

  if (['task_create', 'task_update', 'task_list', 'task_get', 'task_stop', 'task_output'].includes(normalized)) {
    return { intent: 'observable', mode: 'live_workspace', surface: 'tasks', label: 'Tasks', initiallyOpen: false }
  }

  if (normalized === 'agent' || matchesAny(normalized, ['spawn_agent', 'subagent', 'sub_agent', 'delegate_agent', 'task_agent'])) {
    return { intent: 'delegated', mode: 'agent_activity', label: 'Sub-agent', initiallyOpen: true }
  }

  if (matchesAny(normalized, ['browser', 'navigate', 'open_url', 'click', 'screenshot', 'playwright', 'selenium'])) {
    return { intent: 'observable', mode: 'live_workspace', surface: 'browser', label: 'Browser', initiallyOpen: false }
  }

  if (matchesAny(normalized, ['terminal', 'shell', 'bash', 'powershell', 'cmd', 'exec_command', 'run_command'])) {
    return { intent: 'observable', mode: 'live_workspace', surface: 'terminal', label: 'Terminal', initiallyOpen: false }
  }

  if (matchesAny(normalized, ['apply_patch', 'edit', 'write_file', 'file_write', 'create_file', 'replace_file', 'move_file'])) {
    return { intent: 'observable', mode: 'live_workspace', surface: 'editor', label: 'Edit', initiallyOpen: false }
  }

  if (matchesAny(normalized, ['computer', 'desktop', 'mouse', 'keyboard'])) {
    return { intent: 'observable', mode: 'live_workspace', surface: 'computer', label: 'Computer', initiallyOpen: false }
  }

  return { intent: 'informational', mode: 'compact', label: humanizeToolName(name), initiallyOpen: false }
}

export function humanizeToolName(value: string) {
  return value
    .replace(/^mcp__/, '')
    .replace(/__/g, ' / ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function normalizeToolName(value: string) {
  return value.toLowerCase().replace(/^mcp__/, '').replace(/__/g, '_')
}

// Bidirectional: a short bare tool name (e.g. "write") won't contain a
// longer alias needle ("write_file"), but the needle contains it - matching
// only one direction silently dropped "write" out of live_workspace/editor
// entirely (it matched none of apply_patch/edit/write_file/file_write/...),
// so every file write rendered as a raw JSON card instead of a diff.
function matchesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle) || needle.includes(value))
}
