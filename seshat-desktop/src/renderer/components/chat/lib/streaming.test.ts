import { describe, expect, it } from 'vitest'
import { applyStreamEvent, mergeDoneIntoMessages } from './streaming'
import type { ChatMessage, StreamEvent, StreamingBlock } from './chatTypes'

describe('applyStreamEvent', () => {
  it('accumulates flat SDK text deltas on the active block', () => {
    let blocks: StreamingBlock[] = []
    blocks = applyStreamEvent(blocks, {
      event: 'message',
      data: { type: 'content_block_start', content_block: { type: 'text', text: '' } }
    } as StreamEvent)
    blocks = applyStreamEvent(blocks, {
      event: 'message',
      data: { type: 'content_block_delta', delta_type: 'text_delta', delta: 'Hel' }
    } as StreamEvent)
    blocks = applyStreamEvent(blocks, {
      event: 'message',
      data: { type: 'content_block_delta', delta_type: 'text_delta', delta: 'lo' }
    } as StreamEvent)

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'text', text: 'Hello' })
  })

  it('accumulates flat SDK thinking deltas separately from text', () => {
    let blocks: StreamingBlock[] = []
    blocks = applyStreamEvent(blocks, {
      event: 'message',
      data: { type: 'content_block_start', content_block: { type: 'thinking', thinking: '' } }
    } as StreamEvent)
    blocks = applyStreamEvent(blocks, {
      event: 'message',
      data: { type: 'content_block_delta', delta_type: 'thinking_delta', delta: 'Considering' }
    } as StreamEvent)

    expect(blocks[0]).toMatchObject({ type: 'thinking', thinking: 'Considering' })
  })

  it('creates thinking and text blocks from provider deltas without start events', () => {
    let blocks: StreamingBlock[] = []
    blocks = applyStreamEvent(blocks, {
      event: 'message',
      data: { type: 'content_block_delta', delta_type: 'thinking_delta', delta: 'Planning' }
    } as StreamEvent)
    blocks = applyStreamEvent(blocks, {
      event: 'message',
      data: { type: 'content_block_delta', delta_type: 'thinking_delta', delta: ' the answer' }
    } as StreamEvent)
    blocks = applyStreamEvent(blocks, {
      event: 'message',
      data: { type: 'content_block_delta', delta_type: 'text_delta', delta: 'Bon' }
    } as StreamEvent)
    blocks = applyStreamEvent(blocks, {
      event: 'message',
      data: { type: 'content_block_delta', delta_type: 'text_delta', delta: 'jour' }
    } as StreamEvent)

    expect(blocks).toEqual([
      { type: 'thinking', thinking: 'Planning the answer' },
      { type: 'text', text: 'Bonjour' }
    ])
  })

  it('builds a tool_use block input from streamed partial_json', () => {
    let blocks: StreamingBlock[] = []
    blocks = applyStreamEvent(blocks, {
      event: 'message',
      data: { type: 'content_block_start', content_block: { type: 'tool_use', id: 't1', name: 'bash', input: {} } }
    } as StreamEvent)
    blocks = applyStreamEvent(blocks, {
      event: 'message',
      data: { type: 'content_block_delta', delta_type: 'input_json_delta', partial_json: '{"command":' }
    } as StreamEvent)
    blocks = applyStreamEvent(blocks, {
      event: 'message',
      data: { type: 'content_block_delta', delta_type: 'input_json_delta', partial_json: '"ls"}' }
    } as StreamEvent)

    expect(blocks[0]).toMatchObject({ type: 'tool_use', id: 't1', name: 'bash', input: { command: 'ls' } })
  })

  it('ignores done and error events', () => {
    const seed: StreamingBlock[] = [{ type: 'text', text: 'unchanged' }]
    const afterDone = applyStreamEvent(seed, { event: 'done', data: { session_id: 's', content: 'x' } })
    const afterError = applyStreamEvent(seed, { event: 'error', data: { error: 'boom' } })
    expect(afterDone).toBe(seed)
    expect(afterError).toBe(seed)
  })

  it('creates an awaiting_approval tool_use block from a permission_required runtime event', () => {
    const blocks = applyStreamEvent([], {
      event: 'runtime',
      data: {
        type: 'tool.permission_required',
        permission_request: {
          tool_use_id: 'perm-1',
          tool_name: 'write_file',
          tool_input: { path: '/tmp/a' },
          description: 'Allow write_file?'
        }
      }
    } as StreamEvent)

    expect(blocks).toHaveLength(1)
    const block = blocks[0]
    expect(block.type).toBe('tool_use')
    if (block.type !== 'tool_use') throw new Error('expected tool_use')
    expect(block._status).toBe('awaiting_approval')
    expect(block._approval).toMatchObject({ toolUseId: 'perm-1', toolName: 'write_file' })
  })

  it('auto-resolves a remembered permission request instead of surfacing a prompt', () => {
    const blocks = applyStreamEvent(
      [],
      {
        event: 'runtime',
        data: {
          type: 'tool.permission_required',
          permission_request: {
            tool_use_id: 'perm-2',
            tool_name: 'bash',
            tool_input: { command: 'ls' },
            description: 'Allow bash?'
          }
        }
      } as StreamEvent,
      (toolName, input) => toolName === 'bash' && input.command === 'ls'
    )

    expect(blocks).toHaveLength(1)
    const block = blocks[0]
    if (block.type !== 'tool_use') throw new Error('expected tool_use')
    expect(block._status).toBe('running')
    expect(block._approval).toBeUndefined()
  })

  it('merges tool.progress into the matching tool_use block by id', () => {
    let blocks: StreamingBlock[] = [{ type: 'tool_use', id: 'tool-1', name: 'bash', input: {}, _status: 'running' }]
    blocks = applyStreamEvent(blocks, {
      event: 'runtime',
      data: { type: 'tool.progress', tool_progress: { tool_use_id: 'tool-1', stage: 'completed', result: 'ok' } }
    } as StreamEvent)

    const block = blocks[0]
    if (block.type !== 'tool_use') throw new Error('expected tool_use')
    expect(block._status).toBe('completed')
    expect(block._result?.content).toBe('ok')
  })
})

describe('mergeDoneIntoMessages', () => {
  it('attaches tool results by id and marks the assistant message sent', () => {
    const streaming: StreamingBlock[] = [
      { type: 'text', text: 'Running a command' },
      { type: 'tool_use', id: 'tool-1', name: 'bash', input: { command: 'ls' }, _status: 'running' }
    ]
    const current: ChatMessage[] = [
      { id: 'assistant-1', role: 'assistant', content: [] }
    ]

    const merged = mergeDoneIntoMessages(current, {
      session_id: 's1',
      content: 'done',
      tool_results: [{ id: 'tool-1', tool_use_id: 'tool-1', content: 'file1\nfile2', is_error: false }]
    }, 'assistant-1', streaming)

    const assistant = merged.find((m) => m.id === 'assistant-1')
    expect(assistant?.status).toBe('sent')
    const toolBlock = assistant?.content.find((b) => b.type === 'tool_use')
    expect(toolBlock).toMatchObject({ _status: 'completed', _result: { content: 'file1\nfile2' } })
  })

  it('falls back to done.content as plain text when there is no streamed content', () => {
    const current: ChatMessage[] = [{ id: 'assistant-1', role: 'assistant', content: [] }]
    const merged = mergeDoneIntoMessages(current, { session_id: 's1', content: 'Final answer' }, 'assistant-1', [])
    const assistant = merged.find((m) => m.id === 'assistant-1')
    expect(assistant?.content).toEqual([{ type: 'text', text: 'Final answer' }])
  })

  it('folds a trailing tool_result message into its tool_use block instead of rendering an orphan message', () => {
    const current: ChatMessage[] = [{ id: 'assistant-1', role: 'assistant', content: [] }]
    const doneMessages: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: [{ type: 'text', text: 'list files' }] },
      { id: 'assistant-1', role: 'assistant', content: [{ type: 'tool_use', id: 'tool-1', name: 'bash', input: { command: 'ls' }, _status: 'running' }] },
      { id: 'user-2', role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'file1\nfile2', is_error: false }] }
    ]

    const merged = mergeDoneIntoMessages(current, { session_id: 's1', content: 'done', messages: doneMessages }, 'assistant-1', [])

    expect(merged.some((m) => m.id === 'user-2')).toBe(false)
    const assistant = merged.find((m) => m.id === 'assistant-1')
    const toolBlock = assistant?.content.find((b) => b.type === 'tool_use')
    expect(toolBlock).toMatchObject({ _status: 'completed', _result: { content: 'file1\nfile2' } })
  })

  it('preserves a locally-known attachment thumbnail that the backend does not echo back', () => {
    const current: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: [{ type: 'text', text: 'check this image' }], metadata: { attachments: [{ id: 'att-1', filename: 'photo.png' }] } },
      { id: 'assistant-1', role: 'assistant', content: [] }
    ]
    const doneMessages: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: [{ type: 'text', text: 'check this image' }] },
      { id: 'assistant-1', role: 'assistant', content: [{ type: 'text', text: 'Nice photo.' }] }
    ]

    const merged = mergeDoneIntoMessages(current, { session_id: 's1', content: 'done', messages: doneMessages }, 'assistant-1', [])

    const userMessage = merged.find((m) => m.id === 'user-1')
    expect(userMessage?.metadata?.attachments).toEqual([{ id: 'att-1', filename: 'photo.png' }])
  })

  it('falls back to matching text when the backend assigns a different message id', () => {
    const current: ChatMessage[] = [
      { id: 'local-temp-id', role: 'user', content: [{ type: 'text', text: 'check this image' }], metadata: { attachments: [{ id: 'att-1', filename: 'photo.png' }] } }
    ]
    const doneMessages: ChatMessage[] = [
      { id: 'server-assigned-id', role: 'user', content: [{ type: 'text', text: 'check this image' }] },
      { id: 'assistant-1', role: 'assistant', content: [{ type: 'text', text: 'Nice photo.' }] }
    ]

    const merged = mergeDoneIntoMessages(current, { session_id: 's1', content: 'done', messages: doneMessages }, 'assistant-1', [])

    const userMessage = merged.find((m) => m.id === 'server-assigned-id')
    expect(userMessage?.metadata?.attachments).toEqual([{ id: 'att-1', filename: 'photo.png' }])
  })

  it('attaches a done.tool_results entry that never arrived as its own message', () => {
    const current: ChatMessage[] = [{ id: 'assistant-1', role: 'assistant', content: [] }]
    const doneMessages: ChatMessage[] = [
      { id: 'assistant-1', role: 'assistant', content: [{ type: 'tool_use', id: 'tool-1', name: 'bash', input: { command: 'ls' }, _status: 'running' }] }
    ]

    const merged = mergeDoneIntoMessages(current, {
      session_id: 's1',
      content: 'done',
      messages: doneMessages,
      tool_results: [{ id: 'tool-1', content: 'file1\nfile2', is_error: false }]
    }, 'assistant-1', [])

    const assistant = merged.find((m) => m.id === 'assistant-1')
    const toolBlock = assistant?.content.find((b) => b.type === 'tool_use')
    expect(toolBlock).toMatchObject({ _status: 'completed', _result: { content: 'file1\nfile2' } })
  })
})
