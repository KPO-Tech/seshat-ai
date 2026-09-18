import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { StreamPresenter } from './streamPresenter'

describe('StreamPresenter', () => {
  beforeEach(() => {
    // schedule() and the trickle both run on setTimeout (not
    // requestAnimationFrame - see the comment in streamPresenter.ts on why:
    // rAF gets suspended by Chromium for a window that isn't visible/
    // focused, which froze the live view whenever the app lost focus).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a normal small per-token delta immediately, matching fine-grained providers', async () => {
    const publish = vi.fn()
    const presenter = new StreamPresenter(publish)

    presenter.update([{ type: 'text', text: 'Hi' }])
    await vi.advanceTimersByTimeAsync(16)

    expect(publish).toHaveBeenCalledWith([{ type: 'text', text: 'Hi' }])
  })

  it('coalesces several small updates that land within the same tick into one publish', async () => {
    const publish = vi.fn()
    const presenter = new StreamPresenter(publish)

    presenter.update([{ type: 'text', text: 'A' }])
    presenter.update([{ type: 'text', text: 'A go' }])
    presenter.update([{ type: 'text', text: 'A goo' }])
    await vi.advanceTimersByTimeAsync(16)

    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledWith([{ type: 'text', text: 'A goo' }])
  })

  it('does not dump a large one-shot delta in full - it trickles it out instead', () => {
    // a coarse-grained provider (e.g. GLM/z-ai) sending a whole paragraph in
    // one SSE event must not pop in as a single block
    const publish = vi.fn()
    const presenter = new StreamPresenter(publish)
    const full = 'A long streamed answer in one big chunk'

    presenter.update([{ type: 'text', text: full }])

    expect(publish).toHaveBeenCalled()
    const shown = (publish.mock.calls[0][0][0] as { text: string }).text
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThanOrEqual(3)
    expect(shown).not.toBe(full)
  })

  it('eventually reveals the full text of a trickled large delta', async () => {
    const publish = vi.fn()
    const presenter = new StreamPresenter(publish)
    const full = 'A long streamed answer in one big chunk'

    presenter.update([{ type: 'text', text: full }])
    await vi.runAllTimersAsync()

    const last = publish.mock.calls.at(-1)?.[0][0] as { text: string }
    expect(last.text).toBe(full)
  })

  it('keeps ordering when a small delta arrives while a large one is still trickling', async () => {
    const publish = vi.fn()
    const presenter = new StreamPresenter(publish)

    presenter.update([{ type: 'text', text: 'A long streamed answer' }])
    presenter.update([{ type: 'text', text: 'A long streamed answer!' }])
    await vi.runAllTimersAsync()

    const last = publish.mock.calls.at(-1)?.[0][0] as { text: string }
    expect(last.text).toBe('A long streamed answer!')
  })

  it('flush bypasses any pending trickle and publishes the full text immediately', () => {
    const publish = vi.fn()
    const presenter = new StreamPresenter(publish)

    presenter.update([{ type: 'text', text: 'A long streamed answer in one big chunk' }])
    publish.mockClear()
    presenter.flush([{ type: 'text', text: 'done' }])

    expect(publish).toHaveBeenCalledWith([{ type: 'text', text: 'done' }])
  })

  it('drain resolves once a trickled delta has fully caught up', async () => {
    const publish = vi.fn()
    const presenter = new StreamPresenter(publish)
    const full = 'A long streamed answer in one big chunk'
    presenter.update([{ type: 'text', text: full }])

    const done = presenter.drain()
    await vi.runAllTimersAsync()
    await done

    const last = publish.mock.calls.at(-1)?.[0][0] as { text: string }
    expect(last.text).toBe(full)
  })

  it('publishes tool state immediately, unpaced', async () => {
    const publish = vi.fn()
    const presenter = new StreamPresenter(publish)

    presenter.update([{ type: 'tool_use', id: 'tool-1', name: 'bash', input: {}, _status: 'running' }])
    await vi.advanceTimersByTimeAsync(16)

    expect(publish).toHaveBeenCalledWith([{ type: 'tool_use', id: 'tool-1', name: 'bash', input: {}, _status: 'running' }])
  })
})
