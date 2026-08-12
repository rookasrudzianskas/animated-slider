'use client'

import { PILL } from '@/lib/layout'

export interface AgePillProps {
  age: number
}

/**
 * The black "Age: N" capsule under the artwork.
 *
 * It is a live region rather than a plain label: it is the only textual
 * expression of the slider's value, and the ruler itself is announced through
 * its own `aria-valuetext`, so this is marked `aria-hidden` to avoid the value
 * being read twice.
 */
export function AgePill({ age }: AgePillProps) {
  return (
    <div
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
