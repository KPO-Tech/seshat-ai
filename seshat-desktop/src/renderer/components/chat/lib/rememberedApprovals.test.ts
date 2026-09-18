import { beforeEach, describe, expect, it } from 'vitest'
import { permissionSignature, useRememberedApprovalsStore } from './rememberedApprovals'

describe('permissionSignature', () => {
  it('matches bash calls on the literal command', () => {
    expect(permissionSignature('bash', { command: 'ls -la ' })).toBe('bash::ls -la')
  })

  it('matches file tools on the target path', () => {
    expect(permissionSignature('write_file', { file_path: '/tmp/a.txt', content: 'x' })).toBe('write_file::/tmp/a.txt')
  })

  it('falls back to the full input shape for anything else', () => {
    expect(permissionSignature('web_fetch', { url: 'https://example.com' })).toBe('web_fetch::{"url":"https://example.com"}')
  })
})

describe('useRememberedApprovalsStore', () => {
  beforeEach(() => {
    useRememberedApprovalsStore.setState({ remembered: {} })
  })

  it('round-trips remember/isRemembered', () => {
    const signature = permissionSignature('bash', { command: 'rm -rf /tmp/x' })
    expect(useRememberedApprovalsStore.getState().isRemembered(signature)).toBe(false)
    useRememberedApprovalsStore.getState().remember(signature)
    expect(useRememberedApprovalsStore.getState().isRemembered(signature)).toBe(true)
  })

  it('forget removes a remembered signature', () => {
    const signature = permissionSignature('bash', { command: 'ls' })
    useRememberedApprovalsStore.getState().remember(signature)
    useRememberedApprovalsStore.getState().forget(signature)
    expect(useRememberedApprovalsStore.getState().isRemembered(signature)).toBe(false)
  })
})
