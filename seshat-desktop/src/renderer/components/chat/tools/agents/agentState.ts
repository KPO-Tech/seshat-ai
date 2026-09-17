import type { RuntimeAgentEvent, RuntimeEvent, ToolUseBlock } from '../../lib/chatTypes'

export type AgentLifecycle = 'initializing' | 'running' | 'waiting' | 'completed' | 'failed' | 'stopped'

export type AgentToolActivity = {
  toolName: string
  stage: string
  message?: string
  startedAt: number
  endedAt?: number
}

export type SubagentState = {
  key: string
  toolUseId: string
  agentId?: string
  nickname?: string
  role?: string
  agentType: string
  task: string
  status: AgentLifecycle
  startedAt: number
  endedAt?: number
  turnNumber: number
  inputTokens: number
  outputTokens: number
  activeTool?: AgentToolActivity
  activityLog: AgentToolActivity[]
  output: string
  thinking: string
  error?: string
}

export type AgentSessionState = {
  agents: Record<string, SubagentState>
}

export const emptyAgentSession: AgentSessionState = { agents: {} }

export function reduceAgentTool(state: AgentSessionState, tool: ToolUseBlock): AgentSessionState {
  if (!isAgentLaunchTool(tool.name)) return state
  const existing = state.agents[tool.id]
  const metadata = objectValue(tool._result?.metadata)
  const finished = metadata.subagent_finished === true
  const failed = Boolean(tool._result?.is_error || tool._result?.isError || tool._status === 'failed')
  const synchronousAgent = tool.name === 'agent' && metadata.background !== true && Boolean(tool._result)
  const next: SubagentState = {
    key: tool.id,
    toolUseId: tool.id,
    agentId: text(metadata.agent_id) || existing?.agentId || resultAgentId(tool),
    nickname: text(metadata.nickname) || existing?.nickname,
    role: text(tool.input.role) || text(metadata.role) || existing?.role,
    agentType: text(tool.input.type) || text(tool.input.agent_type) || existing?.agentType || 'agent',
    task: text(tool.input.task) || text(tool.input.prompt) || existing?.task || '',
    status: failed ? 'failed' : finished || synchronousAgent ? 'completed' : existing?.status ?? 'running',
    startedAt: existing?.startedAt ?? Date.now(),
    endedAt: failed || finished || synchronousAgent ? existing?.endedAt ?? Date.now() : existing?.endedAt,
    turnNumber: existing?.turnNumber ?? 0,
    inputTokens: existing?.inputTokens ?? 0,
    outputTokens: existing?.outputTokens ?? 0,
    activeTool: existing?.activeTool,
    activityLog: existing?.activityLog ?? [],
    output: text(metadata.content) || existing?.output || (synchronousAgent ? tool._result?.content ?? '' : ''),
    thinking: existing?.thinking ?? '',
    error: failed ? tool._result?.content || tool._message || 'Agent failed' : existing?.error
  }
  return { agents: { ...state.agents, [tool.id]: next } }
}

export function reduceAgentEvent(state: AgentSessionState, event: RuntimeEvent, blocks: ToolUseBlock[]): AgentSessionState {
  const parentToolUseId = text(event.agent_tool_use_id) || text(event.agentToolUseId)
  const agentEvent = event.agent_event ?? event.agentEvent
  const progress = event.tool_progress ?? event.toolProgress
  const agentId = agentEventId(agentEvent)
  const key = findAgentKey(state, parentToolUseId, agentId, text(progress?.tool_use_id) || text(progress?.toolUseId))
  const parentTool = blocks.find((block) => block.id === (parentToolUseId || key) && isAgentLaunchTool(block.name))
  let current = state.agents[key]

  if (!current && (parentTool || parentToolUseId || agentId)) {
    current = seedAgent(key, parentToolUseId || parentTool?.id || key, parentTool, agentEvent)
  }
  if (!current) return state

  const type = text(event.type)
  let next = { ...current }
  if (agentEvent) next = applyLifecycleEvent(next, type, agentEvent)

  if (parentToolUseId && type === 'turn.started') {
    next = { ...next, status: 'running', turnNumber: event.turn_number ?? event.turnNumber ?? next.turnNumber }
  }
  if (parentToolUseId && type === 'turn.completed') {
    next = {
      ...next,
      turnNumber: event.turn_number ?? event.turnNumber ?? next.turnNumber,
      inputTokens: event.usage?.input_tokens ?? next.inputTokens,
      outputTokens: event.usage?.output_tokens ?? next.outputTokens,
      activeTool: undefined
    }
  }
  if (parentToolUseId && type === 'turn.failed') {
    next = { ...next, status: 'failed', activeTool: undefined, endedAt: Date.now(), error: next.error || 'Agent turn failed' }
  }
  if (parentToolUseId && type === 'response.chunk' && event.chunk) next = applyChunk(next, event.chunk)
  if (progress) next = applyToolProgress(next, progress, Boolean(parentToolUseId))

  return { agents: { ...state.agents, [key]: next } }
}

export function isAgentLaunchTool(name: string) {
  return ['agent', 'spawn_agent', 'subagent', 'sub_agent', 'delegate_agent', 'task_agent'].includes(name.toLowerCase())
}

function applyLifecycleEvent(agent: SubagentState, type: string, event: RuntimeAgentEvent): SubagentState {
  const status = normalizeLifecycle(event.status, agent.status)
  const activity = lifecycleActivity(type, event)
  const isEnd = type.endsWith('.end')
  const nextStatus = type === 'agent.wait.begin' ? 'waiting'
    : type === 'agent.close.end' ? 'stopped'
      : type === 'agent.spawn.begin' ? 'initializing'
        : status
  return {
    ...agent,
    agentId: agentEventId(event) || agent.agentId,
    nickname: text(event.agent_nickname) || text(event.agentNickname) || agent.nickname,
    role: text(event.agent_role) || text(event.agentRole) || agent.role,
    task: text(event.prompt) || agent.task,
    status: nextStatus,
    startedAt: event.started_at_ms ?? event.startedAtMs ?? agent.startedAt,
    endedAt: nextStatus === 'completed' || nextStatus === 'failed' || nextStatus === 'stopped'
      ? event.completed_at_ms ?? event.completedAtMs ?? agent.endedAt ?? Date.now()
      : agent.endedAt,
    activeTool: isEnd ? undefined : activity ?? agent.activeTool,
    activityLog: activity && isEnd ? [...agent.activityLog, { ...activity, endedAt: event.completed_at_ms ?? event.completedAtMs ?? Date.now() }].slice(-20) : agent.activityLog
  }
}

function applyToolProgress(agent: SubagentState, progress: NonNullable<RuntimeEvent['tool_progress']>, nested: boolean): SubagentState {
  const metadata = objectValue(progress.metadata)
  if (!nested && progress.tool_name === 'spawn_agent' && metadata.subagent_finished === true) {
    const failed = progress.stage === 'failed'
    return {
      ...agent,
      status: agent.status === 'stopped' ? 'stopped' : failed ? 'failed' : 'completed',
      endedAt: Date.now(),
      activeTool: undefined,
      output: text(metadata.content) || agent.output,
      error: failed ? text(metadata.error) || progress.message || 'Agent failed' : agent.error
    }
  }
  if (!nested) return agent

  const now = Date.now()
  const stage = text(progress.stage) || 'running'
  const activity: AgentToolActivity = {
    toolName: text(progress.tool_name) || text(progress.toolName) || text(progress.name) || 'tool',
    stage,
    message: progress.message,
    startedAt: agent.activeTool?.startedAt ?? now,
    endedAt: stage === 'completed' || stage === 'failed' ? now : undefined
  }
  if (stage === 'completed' || stage === 'failed') {
    return { ...agent, activeTool: undefined, activityLog: [...agent.activityLog, activity].slice(-20) }
  }
  return { ...agent, status: 'running', activeTool: activity }
}

function applyChunk(agent: SubagentState, chunk: Record<string, unknown>): SubagentState {
  const type = text(chunk.type)
  if (type === 'content_block_start') {
    const block = objectValue(chunk.content_block)
    if (block.type === 'text') return { ...agent, output: agent.output + stringValue(block.text) }
    if (block.type === 'thinking') return { ...agent, thinking: agent.thinking + stringValue(block.thinking) }
  }
  if (type === 'content_block_delta') {
    const delta = objectValue(chunk.delta)
    const output = stringValue(delta.text)
    const thinking = stringValue(delta.thinking)
    return { ...agent, output: agent.output + output, thinking: agent.thinking + thinking }
  }
  return agent
}

function seedAgent(key: string, toolUseId: string, tool?: ToolUseBlock, event?: RuntimeAgentEvent): SubagentState {
  return {
    key,
    toolUseId,
    agentId: agentEventId(event),
    nickname: text(event?.agent_nickname) || text(event?.agentNickname),
    role: text(event?.agent_role) || text(event?.agentRole) || text(tool?.input.role),
    agentType: text(tool?.input.type) || text(tool?.input.agent_type) || 'agent',
    task: text(event?.prompt) || text(tool?.input.task) || text(tool?.input.prompt),
    status: 'running',
    startedAt: event?.started_at_ms ?? event?.startedAtMs ?? Date.now(),
    turnNumber: 0,
    inputTokens: 0,
    outputTokens: 0,
    activityLog: [],
    output: '',
    thinking: ''
  }
}

function findAgentKey(state: AgentSessionState, parentToolUseId: string, agentId: string, progressToolUseId: string) {
  if (parentToolUseId && state.agents[parentToolUseId]) return parentToolUseId
  const byAgentId = Object.values(state.agents).find((agent) => agentId && agent.agentId === agentId)
  if (byAgentId) return byAgentId.key
  if (progressToolUseId && state.agents[progressToolUseId]) return progressToolUseId
  return parentToolUseId || progressToolUseId || `agent:${agentId}`
}

function lifecycleActivity(type: string, event: RuntimeAgentEvent): AgentToolActivity | null {
  const labels: Record<string, string> = {
    'agent.spawn.begin': 'Starting agent',
    'agent.spawn.end': 'Agent ready',
    'agent.wait.begin': 'Waiting for agent',
    'agent.wait.end': 'Wait finished',
    'agent.interaction.begin': 'Sending message',
    'agent.interaction.end': 'Message delivered',
    'agent.close.begin': 'Stopping agent',
    'agent.close.end': 'Agent stopped'
  }
  const label = labels[type]
  if (!label) return null
  return { toolName: label, stage: type.endsWith('.end') ? 'completed' : 'running', message: text(event.message), startedAt: event.started_at_ms ?? event.startedAtMs ?? Date.now() }
}

function normalizeLifecycle(value: unknown, fallback: AgentLifecycle): AgentLifecycle {
  const status = text(value).toLowerCase()
  if (['completed', 'complete', 'done'].includes(status)) return 'completed'
  if (['failed', 'error'].includes(status)) return 'failed'
  if (['shutdown', 'stopped', 'cancelled', 'closed'].includes(status)) return 'stopped'
  if (['pendinginit', 'initializing'].includes(status)) return 'initializing'
  if (['waiting', 'blocked'].includes(status)) return 'waiting'
  if (status) return 'running'
  return fallback
}

function resultAgentId(tool: ToolUseBlock) {
  const match = tool._result?.content?.match(/Agent spawned:\s*([^\s(]+)/i)
  return match?.[1] ?? ''
}

function agentEventId(event?: RuntimeAgentEvent) {
  return text(event?.agent_id) || text(event?.agentId)
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}
