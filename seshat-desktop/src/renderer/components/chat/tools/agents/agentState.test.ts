import { describe, expect, it } from 'vitest'
import { emptyAgentSession, isAgentLaunchTool, reduceAgentEvent, reduceAgentTool } from './agentState'
import type { RuntimeEvent, ToolUseBlock } from '../../lib/chatTypes'

describe('isAgentLaunchTool', () => {
  it('recognizes known agent-launch tool names case-insensitively', () => {
    expect(isAgentLaunchTool('spawn_agent')).toBe(true)
    expect(isAgentLaunchTool('Agent')).toBe(true)
    expect(isAgentLaunchTool('bash')).toBe(false)
  })
})

describe('reduceAgentTool', () => {
  it('extracts sessionId and output from a finished tool result metadata', () => {
    const tool: ToolUseBlock = {
      type: 'tool_use',
      id: 'tool-1',
      name: 'spawn_agent',
      input: { task: 'research the topic' },
      _status: 'completed',
      _result: { content: 'Fallback', metadata: { subagent_finished: true, session_id: 'sub-abc', content: 'Done researching' } }
    }
    const state = reduceAgentTool(emptyAgentSession, tool)
    expect(state.agents['tool-1']).toMatchObject({
      status: 'completed',
      sessionId: 'sub-abc',
      output: 'Done researching',
      task: 'research the topic'
    })
  })

  it('ignores tools that are not agent-launch tools', () => {
    const tool: ToolUseBlock = { type: 'tool_use', id: 't1', name: 'bash', input: { command: 'ls' } }
    expect(reduceAgentTool(emptyAgentSession, tool)).toBe(emptyAgentSession)
  })
})

describe('reduceAgentEvent', () => {
  it('builds a structured block transcript from the sub-agent turn its own response.chunk events', () => {
    let state = emptyAgentSession
    state = reduceAgentEvent(state, {
      type: 'response.chunk',
      agent_tool_use_id: 'tool-1',
      chunk: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'Looking into it' } }
    } as RuntimeEvent, [])

    const agent = state.agents['tool-1']
    expect(agent).toBeDefined()
    expect(agent.blocks[0]).toMatchObject({ type: 'text', text: 'Looking into it' })
  })

  it('renders the sub-agent own tool call as a nested tool_use block and tracks it in the activity log', () => {
    let state = emptyAgentSession
    state = reduceAgentEvent(state, {
      type: 'response.chunk',
      agent_tool_use_id: 'tool-1',
      chunk: { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'inner-1', name: 'read_file', input: {} } }
    } as RuntimeEvent, [])
    state = reduceAgentEvent(state, {
      type: 'tool.progress',
      agent_tool_use_id: 'tool-1',
      tool_progress: { tool_use_id: 'inner-1', tool_name: 'read_file', stage: 'completed', result: 'file contents' }
    } as RuntimeEvent, [])

    const agent = state.agents['tool-1']
    const innerBlock = agent.blocks.find((block) => block.type === 'tool_use' && block.id === 'inner-1')
    expect(innerBlock).toBeDefined()
    if (innerBlock?.type !== 'tool_use') throw new Error('expected tool_use block')
    expect(innerBlock._status).toBe('completed')
    expect(innerBlock._result?.content).toBe('file contents')
    expect(agent.activityLog).toHaveLength(1)
    expect(agent.activityLog[0]).toMatchObject({ toolName: 'read_file', stage: 'completed' })
  })

  it('completes the agent from a top-level (non-nested) subagent_finished tool.progress event', () => {
    const spawnTool: ToolUseBlock = { type: 'tool_use', id: 'tool-1', name: 'spawn_agent', input: { task: 'do x' } }
    let state = reduceAgentTool(emptyAgentSession, spawnTool)

    state = reduceAgentEvent(state, {
      type: 'tool.progress',
      tool_progress: {
        tool_use_id: 'tool-1',
        tool_name: 'spawn_agent',
        stage: 'completed',
        metadata: { subagent_finished: true, session_id: 'sub-session-42', content: 'Final result text' }
      }
    } as RuntimeEvent, [spawnTool])

    const agent = state.agents['tool-1']
    expect(agent.status).toBe('completed')
    expect(agent.sessionId).toBe('sub-session-42')
    expect(agent.output).toBe('Final result text')
  })

  it('marks the agent failed on a top-level subagent_finished event with stage failed', () => {
    const spawnTool: ToolUseBlock = { type: 'tool_use', id: 'tool-1', name: 'spawn_agent', input: { task: 'do x' } }
    let state = reduceAgentTool(emptyAgentSession, spawnTool)

    state = reduceAgentEvent(state, {
      type: 'tool.progress',
      tool_progress: {
        tool_use_id: 'tool-1',
        tool_name: 'spawn_agent',
        stage: 'failed',
        metadata: { subagent_finished: true, error: 'ran out of time' }
      }
    } as RuntimeEvent, [spawnTool])

    const agent = state.agents['tool-1']
    expect(agent.status).toBe('failed')
    expect(agent.error).toBe('ran out of time')
  })

  it('returns the same state unchanged for events with no matching or seedable agent', () => {
    const state = emptyAgentSession
    const next = reduceAgentEvent(state, { type: 'turn.started' } as RuntimeEvent, [])
    expect(next).toBe(state)
  })
})
