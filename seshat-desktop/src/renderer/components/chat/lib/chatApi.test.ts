import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamQuery } from './chatApi'

const originalWindow = globalThis.window

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow
  })
})

describe('streamQuery', () => {
  it('rejects with AbortError when an Electron stream is cancelled', async () => {
    const cancelStream = vi.fn(async () => undefined)
    const cleanup = vi.fn()

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        nexus: {
          http: {
            startStream: vi.fn(async () => ({ streamId: 'stream-1' })),
            cancelStream,
            onStreamEvent: vi.fn(() => cleanup)
          }
        }
      }
    })

    const controller = new AbortController()
    const request = streamQuery({
      prompt: 'Hello',
      sessionId: 'session-1',
      signal: controller.signal,
      onEvent: vi.fn()
    })

    await Promise.resolve()
    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancelStream).toHaveBeenCalledWith('stream-1')
    expect(cleanup).toHaveBeenCalledOnce()
  })
})
