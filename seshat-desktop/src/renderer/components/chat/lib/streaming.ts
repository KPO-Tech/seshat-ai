import type {
  ChatMessage,
  QueryDone,
  RuntimePermissionRequest,
  RuntimePlanEvent,
  RuntimePromptRequest,
  RuntimeTaskEvent,
  RuntimeToolProgress,
  StreamingBlock,
  StreamEvent,
  ToolApproval,
  ToolProgress,
  ToolPromptRequest,
  ToolResult,
  ToolResultBlock,
  ToolUseBlock
} from './chatTypes'

// Lets the caller (useChatWorkspace, which owns the persisted "always allow"
// store) decide whether a given tool.permission_required should be
// auto-approved instead of surfacing a prompt - kept out of this module so
// streaming.ts stays a pure, store-free reducer.
export type IsApprovalRemembered = (toolName: string, input: Record<string, unknown>) => boolean

export function applyStreamEvent(blocks: StreamingBlock[], event: StreamEvent, isApprovalRemembered?: IsApprovalRemembered): StreamingBlock[] {
  if (event.event === 'done' || event.event === 'error') return blocks
  if (event.event === 'runtime') return applyRuntimeEvent(blocks, event.data as Record<string, unknown>, isApprovalRemembered)

  const data = event.data as Record<string, unknown>
  const type = String(data.type ?? '')

  if (type === 'content_block_start') {
    const raw = data.content_block as Record<string, unknown> | undefined
    if (!raw) return blocks
    const index = typeof data.index === 'number' ? data.index : blocks.length
    return setBlock(blocks, index, normalizeBlock(raw, index))
  }

  if (type === 'content_block_delta') {
    const nestedDelta = objectValue(data.delta)
    const deltaType = String(data.delta_type ?? nestedDelta?.type ?? '')
    const textDelta = typeof data.delta === 'string'
      ? data.delta
      : String(nestedDelta?.text ?? nestedDelta?.thinking ?? '')
    const explicitIndex = typeof data.index === 'number' ? data.index : undefined
    const fallbackIndex = blocks.length - 1
    const fallbackBlock = blocks[fallbackIndex]

    if (!deltaType || deltaType === 'text_delta') {
      const index = explicitIndex ?? (fallbackBlock?.type === 'text' ? fallbackIndex : blocks.length)
      const current = blocks[index]
      const text = current?.type === 'text' ? current.text : ''
      return setBlock(blocks, index, { type: 'text', text: text + textDelta })
    }

    if (deltaType === 'thinking_delta') {
      const index = explicitIndex ?? (fallbackBlock?.type === 'thinking' ? fallbackIndex : blocks.length)
      const current = blocks[index]
      const thinking = current?.type === 'thinking' ? current.thinking : ''
      return setBlock(blocks, index, { type: 'thinking', thinking: thinking + textDelta })
    }

    const index = explicitIndex ?? fallbackIndex
    const current = blocks[index]
    if (!current) return blocks
    if (current.type === 'tool_use') {
      const partial = String(data.partial_json ?? nestedDelta?.partial_json ?? '')
      const nextPartial = `${current._partialInput ?? ''}${partial}`
      return setBlock(blocks, index, { ...current, _partialInput: nextPartial, input: tryParseObject(nextPartial) ?? current.input })
    }
  }

  return blocks
}

function applyRuntimeEvent(blocks: StreamingBlock[], data: Record<string, unknown>, isApprovalRemembered?: IsApprovalRemembered): StreamingBlock[] {
  const type = String(data.type ?? '')
  if (type === 'plan.submitted' || type === 'plan.status_changed') return applyPlanEvent(blocks, (data.plan_event ?? data.planEvent) as RuntimePlanEvent | undefined)
  if (type === 'tool.permission_required') return applyPermissionRequest(blocks, (data.permission_request ?? data.permissionRequest) as RuntimePermissionRequest | undefined, isApprovalRemembered)
  if (type === 'prompt.request') return applyPromptRequest(blocks, (data.prompt_request ?? data.promptRequest) as RuntimePromptRequest | undefined)
  if (type === 'task.changed') return applyTaskEvent(blocks, (data.task_event ?? data.taskEvent) as RuntimeTaskEvent | undefined)

  const rawProgress = (data.tool_progress ?? data.toolProgress ?? data.tool) as RuntimeToolProgress | undefined
  if (!rawProgress || !type.includes('tool')) return blocks

  const progress = normalizeToolProgress(rawProgress)
  const index = findToolIndex(blocks, progress)
  if (index < 0) return blocks

  const tool = blocks[index]
  if (tool.type !== 'tool_use') return blocks

  return setBlock(blocks, index, mergeToolProgress(tool, progress))
}

function applyTaskEvent(blocks: StreamingBlock[], event?: RuntimeTaskEvent): StreamingBlock[] {
  if (!event) return blocks
  const taskId = event.task_id ?? event.taskId ?? ''
  const expectedName = event.action === 'create' ? 'task_create' : 'task_update'
  let index = -1

  for (let cursor = blocks.length - 1; cursor >= 0; cursor -= 1) {
    const block = blocks[cursor]
    if (block.type !== 'tool_use' || !isTaskTool(block.name)) continue
    const blockTaskId = textValue(block.input.task_id) || textValue(block.input.taskId) || textValue(block._task?.task_id) || textValue(block._task?.taskId)
    if ((taskId && blockTaskId === taskId) || block.name === expectedName) {
      index = cursor
      break
    }
  }

  if (index >= 0) {
    const current = blocks[index]
    if (current.type !== 'tool_use') return blocks
    return setBlock(blocks, index, { ...current, _task: event })
  }

  return [...blocks, {
    type: 'tool_use',
    id: `task-event-${taskId || Date.now()}`,
    name: expectedName,
    input: { task_id: taskId, subject: event.subject, status: event.status },
    _status: 'completed',
    _task: event
  }]
}

function applyPermissionRequest(blocks: StreamingBlock[], request?: RuntimePermissionRequest, isApprovalRemembered?: IsApprovalRemembered): StreamingBlock[] {
  if (!request) return blocks
  const toolUseId = request.tool_use_id ?? request.toolUseId ?? `approval-${Date.now()}`
  const toolName = request.tool_name ?? request.toolName ?? 'tool'
  const latestPlan = latestPlanEvent(blocks)
  const baseToolInput = request.tool_input ?? request.toolInput ?? {}
  const metadata = request.metadata ?? {}
  const shouldAttachLatestPlan = toolName === 'exit_plan_mode' && !textValue(baseToolInput.plan_id) && !textValue(baseToolInput.planId) && Boolean(planEventId(latestPlan))
  const toolInput = shouldAttachLatestPlan ? { ...baseToolInput, plan_id: planEventId(latestPlan) } : baseToolInput
  const nextMetadata = shouldAttachLatestPlan ? { ...metadata, plan_id: planEventId(latestPlan) } : metadata
  const index = blocks.findIndex((block) => block.type === 'tool_use' && block.id === toolUseId)

  // "Always allow" from a previous prompt - auto-resolve without ever
  // showing the card again. The actual backend approval call (the server is
  // paused waiting for a decision) is the caller's job, same as the plan/
  // task/session-titled special cases in useChatWorkspace's onEvent.
  if (isApprovalRemembered?.(toolName, toolInput)) {
    const resolved: ToolUseBlock = { type: 'tool_use', id: toolUseId, name: toolName, input: toolInput, _status: 'running' }
    return index >= 0 ? setBlock(blocks, index, { ...blocks[index] as ToolUseBlock, ...resolved }) : [...blocks, resolved]
  }

  const approval: ToolApproval = {
    toolUseId,
    toolName,
    toolInput,
    description: request.description,
    metadata: nextMetadata
  }
  const next: ToolUseBlock = {
    type: 'tool_use',
    id: toolUseId,
    name: toolName,
    input: toolInput,
    _status: 'awaiting_approval',
    _approval: approval,
    _message: request.description ?? `Awaiting approval for ${toolName}`
  }
  return index >= 0 ? setBlock(blocks, index, { ...blocks[index] as ToolUseBlock, ...next }) : [...blocks, next]
}

function applyPlanEvent(blocks: StreamingBlock[], event?: RuntimePlanEvent): StreamingBlock[] {
  const planId = planEventId(event)
  if (!event || !planId) return blocks
  const index = latestToolIndexByName(blocks, 'submit_plan')
  const input = planEventInput(event)
  const result = {
    id: index >= 0 && blocks[index].type === 'tool_use' ? blocks[index].id : `plan-${planId}`,
    tool_use_id: index >= 0 && blocks[index].type === 'tool_use' ? blocks[index].id : `plan-${planId}`,
    content: event.content ?? '',
    metadata: {
      plan_id: planId,
      slug: event.slug,
      filename: event.filename,
      version: event.version,
      status: event.status
    }
  }
  if (index >= 0) {
    const current = blocks[index]
    if (current.type !== 'tool_use') return blocks
    return setBlock(blocks, index, {
      ...current,
      input: { ...current.input, ...input },
      _plan: event,
      _status: current._status === 'failed' ? current._status : 'completed',
      _result: current._result ?? result
    })
  }
  return [...blocks, {
    type: 'tool_use',
    id: `plan-${planId}`,
    name: 'submit_plan',
    input,
    _status: 'completed',
    _plan: event,
    _result: result
  }]
}

function applyPromptRequest(blocks: StreamingBlock[], request?: RuntimePromptRequest): StreamingBlock[] {
  if (!request) return blocks
  const metadata = request.metadata ?? {}
  const promptId = typeof metadata.prompt_id === 'string' ? metadata.prompt_id : `prompt-${Date.now()}`
  const toolUseId = typeof metadata.tool_use_id === 'string' ? metadata.tool_use_id : latestToolIdByName(blocks, 'ask_user_question') ?? `ask-user-${Date.now()}`
  const toolName = typeof metadata.tool_name === 'string' ? metadata.tool_name : 'ask_user_question'
  const prompt: ToolPromptRequest = {
    promptId,
    type: request.type,
    message: request.message,
    options: request.options,
    default: request.default,
    metadata
  }
  const index = blocks.findIndex((block) => block.type === 'tool_use' && block.id === toolUseId)
  const next: ToolUseBlock = {
    type: 'tool_use',
    id: toolUseId,
    name: toolName,
    input: { question: request.message ?? '' },
    _status: 'running',
    _prompt: prompt,
    _message: request.message
  }
  return index >= 0 ? setBlock(blocks, index, { ...blocks[index] as ToolUseBlock, ...next }) : [...blocks, next]
}

export function mergeDoneIntoMessages(current: ChatMessage[], done: QueryDone, assistantId: string, streaming: StreamingBlock[]): ChatMessage[] {
  if (Array.isArray(done.messages) && done.messages.length > 0) {
    const withAttachments = preserveLocalUserAttachments(current, normalizeMessages(done.messages))
    const folded = foldToolResults(withAttachments)
    const withResults = attachDoneToolResults(folded, done.tool_results)
    return attachDoneMetadata(withResults, done)
  }
  const resultById = new Map((done.tool_results ?? []).map((result) => [result.id ?? result.tool_use_id ?? '', result]))
  const content = streaming.map((block) => {
    if (block.type !== 'tool_use') return block
    const result = resultById.get(block.id)
    return result ? { ...block, _status: result.is_error ? 'failed' as const : 'completed' as const, _result: result } : block
  })
  if (content.length === 0 && done.content) content.push({ type: 'text', text: done.content })
  return current.map((message) => message.id === assistantId ? {
    ...message,
    content,
    status: 'sent' as const,
    usage: done.usage,
    turn_number: done.turn_number,
    stop_reason: done.stop_reason,
    is_complete: done.is_complete
  } : message)
}

function attachDoneMetadata(messages: ChatMessage[], done: QueryDone): ChatMessage[] {
  let lastAssistantIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') {
      lastAssistantIndex = index
      break
    }
  }
  if (lastAssistantIndex < 0) return messages

  return messages.map((message, index) => index === lastAssistantIndex ? {
    ...message,
    usage: message.usage ?? done.usage,
    turn_number: message.turn_number ?? done.turn_number,
    stop_reason: message.stop_reason ?? done.stop_reason,
    is_complete: message.is_complete ?? done.is_complete,
    status: message.status ?? ('sent' as const)
  } : message)
}

// The backend's authoritative session history doesn't carry the UI-only
// metadata.attachments field, so replacing local messages with it wholesale
// (as the done.messages branch above does) drops any attachment thumbnail
// the moment the turn completes. Ported from seshat-ui's
// preserveLocalUserAttachments (hooks/useChat.ts): re-attach by message id
// first, then by matching ordinal among locally-known attachment-bearing
// messages, then by exact text match - the backend's own messages never
// carry this field, so id/position/text are all we have to go on.
function preserveLocalUserAttachments(previous: ChatMessage[], messages: ChatMessage[]): ChatMessage[] {
  const localUserMessages = previous.filter((message) => message.role === 'user' && Array.isArray(message.metadata?.attachments) && (message.metadata?.attachments?.length ?? 0) > 0)
  if (localUserMessages.length === 0) return messages

  const localById = new Map(localUserMessages.filter((message) => message.id).map((message) => [message.id, message]))
  const used = new Set<number>()
  let userOrdinal = 0

  return messages.map((message) => {
    if (message.role !== 'user') return message
    const currentOrdinal = userOrdinal
    userOrdinal += 1
    if (message.metadata?.attachments) return message

    const byId = localById.get(message.id)
    if (byId?.metadata?.attachments) {
      return { ...message, metadata: { ...message.metadata, attachments: byId.metadata.attachments } }
    }

    const byOrdinal = localUserMessages[currentOrdinal]
    if (byOrdinal?.metadata?.attachments && !used.has(currentOrdinal)) {
      used.add(currentOrdinal)
      return { ...message, metadata: { ...message.metadata, attachments: byOrdinal.metadata.attachments } }
    }

    const text = messageText(message)
    const matchIndex = localUserMessages.findIndex((local, index) => !used.has(index) && messageText(local) === text)
    if (matchIndex < 0) return message
    used.add(matchIndex)
    return { ...message, metadata: { ...message.metadata, attachments: localUserMessages[matchIndex].metadata?.attachments } }
  })
}

function messageText(message: ChatMessage): string {
  return message.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim()
}

// The backend's session history represents a tool's result as a trailing
// role:'user' message whose content is entirely tool_result blocks, not as
// part of the assistant's own message. Left as-is, that reads as an empty
// orphan message and the tool_use block it answers keeps showing no
// result/status. Ported from seshat-ui's normalizeSessionMessages
// (lib/chat.ts), which folds it back into the tool_use block instead.
function foldToolResults(messages: ChatMessage[]): ChatMessage[] {
  const folded: ChatMessage[] = []
  const toolById = new Map<string, ToolUseBlock>()

  for (const message of messages) {
    const isPureToolResult = message.role === 'user' && message.content.length > 0 && message.content.every((block) => block.type === 'tool_result')
    if (isPureToolResult) {
      for (const block of message.content as ToolResultBlock[]) {
        const tool = block.tool_use_id ? toolById.get(block.tool_use_id) : undefined
        if (!tool) continue
        tool._result = { content: block.content ?? '', is_error: block.is_error }
        tool._status = block.is_error ? 'failed' : 'completed'
      }
      continue
    }

    const cloned: ChatMessage = { ...message, content: message.content.map((block) => block.type === 'tool_use' ? { ...block } : block) }
    for (const block of cloned.content) {
      if (block.type === 'tool_use') toolById.set(block.id, block)
    }
    folded.push(cloned)
  }

  return folded
}

// The done event's separate tool_results array is the authoritative source
// for a result that never arrived as its own synthetic message (or should
// override one that did) - ported from seshat-ui's attachDoneResults.
function attachDoneToolResults(messages: ChatMessage[], results?: ToolResult[]): ChatMessage[] {
  if (!results || results.length === 0) return messages
  for (const result of results) {
    const toolUseId = result.id ?? result.tool_use_id
    if (!toolUseId) continue
    for (const message of messages) {
      for (const block of message.content) {
        if (block.type !== 'tool_use' || block.id !== toolUseId) continue
        block._result = result
        block._status = (result.is_error ?? result.isError) ? 'failed' : 'completed'
      }
    }
  }
  return messages
}

export function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    id: message.id || crypto.randomUUID(),
    content: Array.isArray(message.content) ? message.content : [{ type: 'text' as const, text: String(message.content ?? '') }]
  }))
}

function normalizeBlock(raw: Record<string, unknown>, index: number): StreamingBlock {
  const type = String(raw.type ?? 'text')
  if (type === 'thinking') return { type: 'thinking', thinking: String(raw.thinking ?? '') }
  if (type === 'tool_use') {
    return {
      type: 'tool_use',
      id: String(raw.id ?? `tool-${index}`),
      name: String(raw.name ?? 'tool'),
      input: typeof raw.input === 'object' && raw.input ? raw.input as Record<string, unknown> : {},
      _status: 'running'
    }
  }
  return { type: 'text', text: String(raw.text ?? '') }
}

function normalizeToolProgress(raw: RuntimeToolProgress): ToolProgress {
  return {
    toolUseId: raw.tool_use_id ?? raw.toolUseId,
    toolName: raw.tool_name ?? raw.toolName ?? raw.name,
    stage: raw.stage,
    message: raw.message,
    summary: raw.summary,
    percentComplete: raw.percent_complete ?? raw.percentComplete,
    input: raw.input ?? raw.tool_input,
    result: raw.result,
    durationMs: raw.duration_ms ?? raw.durationMs,
    metadata: raw.metadata
  }
}

function findToolIndex(blocks: StreamingBlock[], progress: ToolProgress) {
  if (progress.toolUseId) {
    const byId = blocks.findIndex((block) => block.type === 'tool_use' && block.id === progress.toolUseId)
    if (byId >= 0) return byId
  }
  if (progress.toolName) {
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      const block = blocks[index]
      if (block.type === 'tool_use' && block.name === progress.toolName) return index
    }
  }
  return -1
}

function latestToolIdByName(blocks: StreamingBlock[], name: string) {
  const index = latestToolIndexByName(blocks, name)
  const block = index >= 0 ? blocks[index] : null
  return block?.type === 'tool_use' ? block.id : null
}

function latestToolIndexByName(blocks: StreamingBlock[], name: string) {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    if (block.type === 'tool_use' && block.name === name) return index
  }
  return -1
}

function latestPlanEvent(blocks: StreamingBlock[]) {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    if (block.type === 'tool_use' && block._plan && planEventId(block._plan)) return block._plan
    if (block.type === 'tool_use' && block.name === 'submit_plan') {
      const planId = textValue(block._result?.metadata?.plan_id) || textValue(block.input.plan_id)
      if (planId) return { plan_id: planId, slug: textValue(block._result?.metadata?.slug) || textValue(block.input.slug) }
    }
  }
  return null
}

function planEventInput(event: RuntimePlanEvent): Record<string, unknown> {
  return {
    plan_id: planEventId(event),
    slug: event.slug,
    filename: event.filename,
    content: event.content
  }
}

function planEventId(event?: RuntimePlanEvent | null) {
  return textValue(event?.plan_id) || textValue(event?.planId)
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function isTaskTool(name: string) {
  return ['task_create', 'task_update', 'task_list', 'task_get', 'task_stop', 'task_output'].includes(name.toLowerCase())
}

function mergeToolProgress(tool: ToolUseBlock, progress: ToolProgress): ToolUseBlock {
  const status = progress.stage === 'completed' || progress.stage === 'failed' || progress.stage === 'pending' || progress.stage === 'running'
    ? progress.stage
    : tool._status
  const input = progress.input ? { ...tool.input, ...progress.input } : tool.input
  const result = progress.result
    ? {
        id: tool.id,
        tool_use_id: tool.id,
        content: progress.result,
        is_error: progress.stage === 'failed',
        duration_ms: progress.durationMs
      }
    : tool._result

  return {
    ...tool,
    input,
    _status: status,
    _progress: { ...tool._progress, ...progress },
    _result: result
  }
}

function setBlock(blocks: StreamingBlock[], index: number, block: StreamingBlock) {
  const next = [...blocks]
  next[index] = block
  return next.filter(Boolean)
}

function tryParseObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
