'use client'

import { TOGGLE } from '@/lib/layout'

export type ColourMode = 'mono' | 'color'

export interface ModeToggleProps {
  value: ColourMode
  onChange: (value: ColourMode) => void
}

const OPTIONS: { value: ColourMode; label: string }[] = [
  { value: 'mono', label: 'Mono' },
  { value: 'color', label: 'Color' },
]

/**
 * Mono / Color segmented control.
 *
 * The reference switches this **instantly** — frames 426→427 and 824→825 flip
 * the pill, both label colours and the artwork's grayscale within a single
 * 33ms video frame, with no intermediate state anywhere in the recording. So
 * there is deliberately no transition here.
 */
export function ModeToggle({ value, onChange }: ModeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Colour mode"
      className="flex items-center rounded-full border border-solid"
      style={{
        width: TOGGLE.width,
        height: TOGGLE.height,
        borderColor: TOGGLE.border,
        borderWidth: TOGGLE.borderWidth,
        padding: TOGGLE.padding,
        gap: TOGGLE.gap,
      }}
    >
      {OPTIONS.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className="flex-1 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-black/25"
            style={{
              height: TOGGLE.segmentHeight,
              fontSize: TOGGLE.fontSize,
              lineHeight: 1,
              fontWeight: 400,
              background: active ? '#000' : 'transparent',
              color: active ? '#fff' : TOGGLE.idleLabel,
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
