'use client'

import { useCallback, useRef } from 'react'

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
 * the pill, both label colours and the artwork's grayscale within a single 33ms
 * video frame, with no intermediate state anywhere in the recording. So there is
 * deliberately no transition here.
 *
 * Keyboard follows the ARIA radiogroup pattern: one tab stop for the whole
 * group (roving tabindex) and arrow keys to move between the segments. The
 * recording never shows the control being keyed, but claiming `radiogroup`
 * without those behaviours is worse than not claiming it.
 */
export function ModeToggle({ value, onChange }: ModeToggleProps) {
  const groupRef = useRef<HTMLDivElement>(null)

  const focusAndSelect = useCallback(
    (next: ColourMode) => {
      onChange(next)
      const index = OPTIONS.findIndex((o) => o.value === next)
      groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus()
    },
    [onChange],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const current = OPTIONS.findIndex((o) => o.value === value)
      let next: number | null = null
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next = (current + 1) % OPTIONS.length
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          next = (current - 1 + OPTIONS.length) % OPTIONS.length
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = OPTIONS.length - 1
          break
        default:
          return
      }
      e.preventDefault()
      focusAndSelect(OPTIONS[next].value)
    },
    [focusAndSelect, value],
  )

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      data-chrome
      aria-label="Colour mode"
      onKeyDown={onKeyDown}
      className="flex cursor-pointer items-center rounded-full border border-solid select-none"
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
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className="flex-1 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#6b6b6b]"
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
