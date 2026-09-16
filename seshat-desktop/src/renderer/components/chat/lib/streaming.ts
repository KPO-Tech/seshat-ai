import type {
  ChatMessage,
  QueryDone,
  RuntimePermissionRequest,
  RuntimePromptRequest,
  RuntimeToolProgress,
  StreamingBlock,
  StreamEvent,
  ToolApproval,
  ToolProgress,
  ToolPromptRequest,
  ToolUseBlock
} from './chatTypes'

export function applyStreamEvent(blocks: StreamingBlock[], event: StreamEvent): StreamingBlock[] {
  if (event.event === 'done' || event.event === 'error') return blocks
  if (event.event === 'runtime') return applyRuntimeEvent(blocks, event.data as Record<string, unknown>)

  const data = event.data as Record<string, unknown>
  const type = String(data.type ?? '')
  const index = typeof data.index === 'number' ? data.index : blocks.length

  if (type === 'content_block_start') {
    const raw = data.content_block as Record<string, unknown> | undefined
    if (!raw) return blocks
    return setBlock(blocks, index, normalizeBlock(raw, index))
  }

  if (type === 'content_block_delta') {
    const delta = data.delta as Record<string, unknown> | undefined
    const current = blocks[index]
    if (!current || !delta) return blocks
    if (current.type === 'text') return setBlock(blocks, index, { ...current, text: current.text + String(delta.text ?? '') })
    if (current.type === 'thinking') return setBlock(blocks, index, { ...current, thinking: current.thinking + String(delta.thinking ?? '') })
    if (current.type === 'tool_use') {
      const partial = String(data.partial_json ?? delta.partial_json ?? '')
      const nextPartial = `${current._partialInput ?? ''}${partial}`
      return setBlock(blocks, index, { ...current, _partialInput: nextPartial, input: tryParseObject(nextPartial) ?? current.input })
    }
  }

  return blocks
}

function applyRuntimeEvent(blocks: StreamingBlock[], data: Record<string, unknown>): StreamingBlock[] {
  const type = String(data.type ?? '')
  if (type === 'tool.permission_required') return applyPermissionRequest(blocks, (data.permission_request ?? data.permissionRequest) as RuntimePermissionRequest | undefined)
  if (type === 'prompt.request') return applyPromptRequest(blocks, (data.prompt_request ?? data.promptRequest) as RuntimePromptRequest | undefined)

  const rawProgress = (data.tool_progress ?? data.toolProgress ?? data.tool) as RuntimeToolProgress | undefined
  if (!rawProgress || !type.includes('tool')) return blocks

  const progress = normalizeToolProgress(rawProgress)
  const index = findToolIndex(blocks, progress)
  if (index < 0) return blocks

  const tool = blocks[index]
  if (tool.type !== 'tool_use') return blocks

  return setBlock(blocks, index, mergeToolProgress(tool, progress))
}

function applyPermissionRequest(blocks: StreamingBlock[], request?: RuntimePermissionRequest): StreamingBlock[] {
  if (!request) return blocks
  const toolUseId = request.tool_use_id ?? request.toolUseId ?? `approval-${Date.now()}`
  const toolName = request.tool_name ?? request.toolName ?? 'tool'
  const toolInput = request.tool_input ?? request.toolInput ?? {}
  const approval: ToolApproval = {
    toolUseId,
    toolName,
    toolInput,
    description: request.description
  }
  const index = blocks.findIndex((block) => block.type === 'tool_use' && block.id === toolUseId)
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
    return attachDoneMetadata(normalizeMessages(done.messages), done)
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
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]
    if (block.type === 'tool_use' && block.name === name) return block.id
  }
  return null
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
