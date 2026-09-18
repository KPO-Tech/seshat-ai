import type { StreamingBlock } from './chatTypes'

type FrameHandle = ReturnType<typeof setTimeout>

// Ported from Open WebUI's streamLargeDeltasAsRandomChunks
// (src/lib/apis/streaming/index.ts), written specifically because "some
// providers may send large chunks of text at once" - exactly what GLM/z-ai
// does. A delta below the threshold is shown as-is (matches genuine
// per-token providers with zero added latency); a bigger one is replayed as
// small random-sized pieces with a short delay between them, so a single big
// provider chunk still reads as a stream instead of one pop-in.
const LARGE_DELTA_THRESHOLD = 5
const MICRO_CHUNK_DELAY_MS = 5

function textOf(block: StreamingBlock | undefined, type: 'text' | 'thinking'): string {
  if (!block) return ''
  if (type === 'text' && block.type === 'text') return block.text
  if (type === 'thinking' && block.type === 'thinking') return block.thinking
  return ''
}

function withText(block: StreamingBlock, type: 'text' | 'thinking', text: string): StreamingBlock {
  return type === 'text' ? { ...block, type: 'text', text } : { ...block, type: 'thinking', thinking: text }
}

export class StreamPresenter {
  private target: StreamingBlock[] = []
  private displayed: StreamingBlock[] = []
  private frame: FrameHandle | null = null
  private idleResolvers: Array<() => void> = []
  // leftover, not-yet-revealed text per paced block index, drained a few
  // characters at a time by the trickle loop below
  private queues = new Map<number, string>()
  private trickleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly publish: (blocks: StreamingBlock[]) => void) {}

  update(target: StreamingBlock[]) {
    const previous = this.target
    this.target = target

    target.forEach((block, index) => {
      if (block.type !== 'text' && block.type !== 'thinking') {
        // tool state (e.g. a running bash command) is never paced - shown as
        // soon as it changes, same as before
        this.displayed[index] = block
        return
      }
      const type = block.type
      const delta = textOf(block, type).slice(textOf(previous[index], type).length)
      if (!delta) return

      const queued = this.queues.get(index)
      if (queued) {
        // still catching up on an earlier large delta for this block - append
        // to keep order, rather than letting a fresh small delta jump ahead
        this.queues.set(index, queued + delta)
        return
      }
      if (delta.length < LARGE_DELTA_THRESHOLD) {
        this.displayed[index] = withText(this.displayed[index] ?? block, type, textOf(this.displayed[index], type) + delta)
        return
      }
      this.queues.set(index, delta)
    })

    this.startTrickle()
    this.schedule()
  }

  flush(target = this.target) {
    this.target = target
    this.cancelFrame()
    this.cancelTrickle()
    this.queues.clear()
    this.displayed = cloneBlocks(target)
    this.publish(this.displayed)
    this.resolveIdle()
  }

  drain() {
    if (!hasPendingText(this.displayed, this.target)) {
      this.flush(this.target)
      return Promise.resolve()
    }
    this.schedule()
    return new Promise<void>((resolve) => this.idleResolvers.push(resolve))
  }

  cancel() {
    this.cancelFrame()
    this.cancelTrickle()
    this.queues.clear()
    this.resolveIdle()
  }

  // Coalesces however many small (sub-threshold) deltas land within one
  // ~frame into a single publish/re-render. This never paces content by
  // itself - it just avoids one React re-render per network event.
  //
  // Deliberately setTimeout, not requestAnimationFrame: rAF callbacks are
  // tied to the compositor's paint cycle and Chromium suspends them
  // entirely for a window that isn't visible/focused (minimized, occluded,
  // or just not the foreground window - normal while someone alt-tabs to a
  // terminal to watch backend logs during a long turn). That silently froze
  // the entire live view - the backend kept streaming and completed
  // correctly, but nothing ever got flushed to React until the app was
  // restarted and the session reloaded from scratch on a fresh mount.
  // setTimeout keeps running on the JS event loop regardless of window
  // visibility, so this can't get stuck the same way.
  private schedule() {
    if (this.frame !== null) return
    this.frame = setTimeout(() => {
      this.frame = null
      this.publish(this.displayed)
      if (this.queues.size === 0) this.resolveIdle()
    }, 16)
  }

  private startTrickle() {
    if (this.trickleTimer !== null || this.queues.size === 0) return
    this.tickTrickle()
  }

  private tickTrickle = () => {
    this.trickleTimer = null
    for (const [index, queued] of this.queues) {
      const take = Math.min(Math.floor(Math.random() * 3) + 1, queued.length)
      const type = this.target[index]?.type === 'thinking' ? 'thinking' : 'text'
      const shown = queued.slice(0, take)
      const rest = queued.slice(take)
      if (rest) this.queues.set(index, rest)
      else this.queues.delete(index)
      const current = this.displayed[index] ?? withText(this.target[index], type, '')
      this.displayed[index] = withText(current, type, textOf(current, type) + shown)
    }
    this.publish(this.displayed)
    if (this.queues.size === 0) {
      this.resolveIdle()
      return
    }
    // browsers throttle timers in hidden tabs to ~1/s - don't let the reveal
    // stall there, just keep draining without the pacing delay
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    const delay = hidden ? 0 : MICRO_CHUNK_DELAY_MS
    this.trickleTimer = setTimeout(this.tickTrickle, delay)
  }

  private cancelFrame() {
    if (this.frame === null) return
    clearTimeout(this.frame)
    this.frame = null
  }

  private cancelTrickle() {
    if (this.trickleTimer === null) return
    clearTimeout(this.trickleTimer)
    this.trickleTimer = null
  }

  private resolveIdle() {
    this.idleResolvers.splice(0).forEach((resolve) => resolve())
  }
}

function pendingCharacterCount(current: StreamingBlock[], target: StreamingBlock[]) {
  return target.reduce((total, block, index) => {
    const shown = current[index]
    if (block.type === 'text') return total + Math.max(0, block.text.length - (shown?.type === 'text' ? shown.text.length : 0))
    if (block.type === 'thinking') return total + Math.max(0, block.thinking.length - (shown?.type === 'thinking' ? shown.thinking.length : 0))
    return total
  }, 0)
}

function hasPendingText(current: StreamingBlock[], target: StreamingBlock[]) {
  return pendingCharacterCount(current, target) > 0
}

function cloneBlocks(blocks: StreamingBlock[]) {
  return blocks.map((block) => ({ ...block }))
}
