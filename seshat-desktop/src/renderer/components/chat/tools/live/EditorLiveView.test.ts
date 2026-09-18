import { describe, expect, it } from 'vitest'
import { editorData } from './EditorLiveView'
import type { ToolUseBlock } from '../../lib/chatTypes'

function tool(overrides: Partial<ToolUseBlock> = {}): ToolUseBlock {
  return {
    type: 'tool_use',
    id: 't1',
    name: 'edit',
    input: { file_path: '/a.txt', old_string: 'before', new_string: 'after' },
    ...overrides
  }
}

describe('editorData', () => {
  it('computes a diff from old_string/new_string on success', () => {
    const data = editorData(tool(), false)
    expect(data.diff?.rows.length).toBeGreaterThan(0)
  })

  it('does not fabricate a diff from the proposed input when the call failed', () => {
    // regression: a failed edit has no real structured_patch/git_diff, but
    // the old_string/new_string fallback doesn't know that and would
    // otherwise render the model's merely-proposed change as if it had
    // actually been applied
    const data = editorData(tool({ _result: { content: '', is_error: true } }), true)
    expect(data.diff).toBeNull()
    expect(data.raw).toBe('')
  })
})
