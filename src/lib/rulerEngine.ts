/**
 * The animation engine behind the ruler.
 *
 * The ruler's position is a continuous scroll offset that chases an input
 * target through a first-order exponential filter (REFERENCE.md §5). That
 * offset changes every frame, so it is deliberately kept OUT of React state:
 * subscribers are called synchronously from the rAF loop and write to the DOM
 * themselves. React only re-renders when the *rounded age* changes.
 */
import { FOLLOW_TAU, MAX_INDEX, TICK_PITCH, clampIndex, follow } from './ruler'

export type RulerSubscriber = (index: number, offset: number) => void

export interface RulerEngineOptions {
  /** Pixels between tick centres. Changes with the viewport. */
  pitch?: number
  /** Follower time constant in seconds. 0 disables smoothing. */
  tau?: number
  /** Called when the rounded index (i.e. the displayed age) changes. */
  onIndexSettled?: (index: number) => void
}

export class RulerEngine {
  private target: number
  private offset: number
  private pitch: number
  private tau: number
  private raf = 0
  private last = 0
  private running = false
  private subs = new Set<RulerSubscriber>()
  private roundedIndex: number
  private dragging = false
  private onIndexSettled?: (index: number) => void

  constructor(initialIndex = 0, opts: RulerEngineOptions = {}) {
    this.pitch = opts.pitch ?? TICK_PITCH
    this.tau = opts.tau ?? FOLLOW_TAU
    this.onIndexSettled = opts.onIndexSettled
    this.target = clampIndex(initialIndex) * this.pitch
    this.offset = this.target
    this.roundedIndex = Math.round(initialIndex)
  }

  /** Continuous tick index right now. */
  get index(): number {
    return this.offset / this.pitch
  }

  get offsetPx(): number {
    return this.offset
  }

  subscribe(fn: RulerSubscriber): () => void {
    this.subs.add(fn)
    fn(this.index, this.offset)
    return () => {
      this.subs.delete(fn)
    }
  }

  /**
   * Re-scale the engine when the viewport changes the tick pitch, keeping the
   * ruler on the same age rather than the same pixel offset.
   */
  setPitch(pitch: number) {
    if (pitch === this.pitch || pitch <= 0) return
    const ratio = pitch / this.pitch
    this.pitch = pitch
    this.target *= ratio
    this.offset *= ratio
    this.emit()
  }

  /**
   * Direct manipulation bypasses the follower entirely. On release the strip is
   * already where the pointer left it, so nothing coasts — matching the
   * reference's complete absence of momentum.
   */
  setDragging(dragging: boolean) {
    this.dragging = dragging
    if (dragging) {
      this.offset = this.target
      this.emit()
    }
  }

  setTau(tau: number) {
    this.tau = tau
    if (tau <= 0) {
      this.offset = this.target
      this.emit()
    }
  }

  /** Move the input target by `deltaPx`, clamped to the ends of the ruler. */
  nudge(deltaPx: number) {
    this.setTargetPx(this.target + deltaPx)
  }

  /** Jump to a whole tick index — used by the keyboard, which cannot express a fraction. */
  stepTo(index: number) {
    this.setTargetPx(clampIndex(index) * this.pitch)
  }

  /** Set the target and, if not smoothing, the position too. */
  setTargetPx(px: number) {
    this.target = Math.min(Math.max(px, 0), MAX_INDEX * this.pitch)
    if (this.effectiveTau <= 0) this.offset = this.target
    this.start()
  }

  /** Snap position and target to an exact index with no animation. */
  jumpTo(index: number) {
    this.target = clampIndex(index) * this.pitch
    this.offset = this.target
    this.emit()
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  stop() {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private tick = (now: number) => {
    if (!this.running) return
    // Clamp dt so a backgrounded tab does not teleport the ruler on return.
    const dt = Math.min((now - this.last) / 1000, 0.1)
    this.last = now
    this.offset = follow(this.offset, this.target, dt, this.effectiveTau)
    if (Math.abs(this.target - this.offset) < 0.01) {
      this.offset = this.target
      this.emit()
      this.running = false
      this.raf = 0
      return
    }
    this.emit()
    this.raf = requestAnimationFrame(this.tick)
  }

  private get effectiveTau(): number {
    return this.dragging ? 0 : this.tau
  }

  private emit() {
    const index = this.index
    for (const fn of this.subs) fn(index, this.offset)
    const rounded = clampIndex(Math.round(index))
    if (rounded !== this.roundedIndex) {
      this.roundedIndex = rounded
      this.onIndexSettled?.(rounded)
    }
  }
}
