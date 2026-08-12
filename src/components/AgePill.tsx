'use client'

import { useEffect, useRef } from 'react'

import { PILL } from '@/lib/layout'
import { MIN_AGE, clampIndex } from '@/lib/ruler'
import type { RulerEngine } from '@/lib/rulerEngine'

export interface AgePillProps {
  engine: RulerEngine
  /** Age at render time — the initial text, and what the server emits. */
  age: number
}

/**
 * The black "Age: N" capsule under the artwork.
 *
 * The text is written straight to the DOM from the engine's rAF callback — the
 * same place, and the same frame, the tick turns black. Routing it through
 * React state instead leaves the capsule a year behind at every boundary:
 * React commits in a scheduler task that runs after the frame has painted, so
 * the tick and the number disagree for one frame every time the value changes,
 * and continuously during a flick fast enough to cross a year per frame.
 *
 * It is `aria-hidden`: the ruler announces the value through its own
 * `aria-valuetext`, and exposing this as well would read the age twice.
 */
export function AgePill({ engine, age }: AgePillProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let shown = -1
    return engine.subscribe((index) => {
      const next = clampIndex(Math.round(index)) + MIN_AGE
      if (next === shown) return
      shown = next
      el.textContent = `Age: ${next}`
    })
  }, [engine])

  return (
    <div
      ref={ref}
      aria-hidden
      data-pill
      data-chrome
      className="flex items-center justify-center rounded-full bg-black text-white"
      style={{
        height: PILL.height,
        paddingInline: PILL.paddingInline,
        fontSize: PILL.fontSize,
        lineHeight: 1,
        fontWeight: 400,
        letterSpacing: 0,
        // The reference sets "Age: 17" and "Age: 24" to the SAME 80.5px width,
        // so its figures are tabular. With proportional figures the capsule
        // visibly breathes as you scrub past every 1.
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {`Age: ${age}`}
    </div>
  )
}
