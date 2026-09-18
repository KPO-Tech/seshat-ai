import { describe, expect, it } from 'vitest'
import { getToolPresentation } from './toolPresentation'

describe('getToolPresentation', () => {
  it('routes the bare "write" tool name to the editor live workspace', () => {
    // regression: matchesAny only checked value.includes(needle), so a short
    // bare name like "write" could never match a longer alias needle like
    // "write_file" - it fell through to a generic compact card instead of
    // the diff view every other edit tool name gets.
    expect(getToolPresentation('write')).toMatchObject({ mode: 'live_workspace', surface: 'editor' })
  })

  it('still routes the known long-form aliases to the editor surface', () => {
    expect(getToolPresentation('write_file')).toMatchObject({ mode: 'live_workspace', surface: 'editor' })
    expect(getToolPresentation('edit')).toMatchObject({ mode: 'live_workspace', surface: 'editor' })
    expect(getToolPresentation('apply_patch')).toMatchObject({ mode: 'live_workspace', surface: 'editor' })
  })

  it('does not misroute an unrelated short tool name', () => {
    expect(getToolPresentation('web_search')).toMatchObject({ mode: 'compact' })
  })
})
