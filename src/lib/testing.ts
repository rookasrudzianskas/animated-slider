/**
 * A tiny handle on the running app so the comparison harness can drive it to an
 * exact ruler position and diff the result against a frame of the reference
 * recording. See REFERENCE.md §8 and scripts/compare.mjs.
 *
 * This is not a debug backdoor for behaviour: it only sets the same state the
 * user's own input would set.
 */
import type { RulerEngine } from './rulerEngine'

export interface SliderTestHandle {
  /** Jump to an exact continuous tick index with no animation. */
  setIndex(index: number): void
  /** Jump to an exact age (5..95). */
  setAge(age: number): void
  /** Current continuous tick index. */
  getIndex(): number
  /** Feed a wheel delta exactly as the browser would. */
  wheel(deltaPx: number): void
  setMode(mode: 'mono' | 'color'): void
}

declare global {
  interface Window {
    __slider?: SliderTestHandle
  }
}

export function exposeForTesting(
  engine: RulerEngine,
  hooks: { setMode: (mode: 'mono' | 'color') => void },
): () => void {
  if (typeof window === 'undefined') return () => {}
  window.__slider = {
    setIndex: (index) => engine.jumpTo(index),
    setAge: (age) => engine.jumpTo(age - 5),
    getIndex: () => engine.index,
    wheel: (deltaPx) => engine.nudge(deltaPx),
    setMode: hooks.setMode,
  }
  return () => {
    delete window.__slider
  }
}
