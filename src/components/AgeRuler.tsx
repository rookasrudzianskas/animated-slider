'use client'

import { useCallback, useEffect, useRef } from 'react'

import {
  MAX_AGE,
  MAX_INDEX,
  MIN_AGE,
  TICK_MAX_HEIGHT,
  TICK_WIDTH,
  clampIndex,
  envelopeRangeFor,
  tickHeight,
  visibleRange,
} from '@/lib/ruler'
import type { RulerEngine } from '@/lib/rulerEngine'

const TICK_IDLE = '#eeeeee'
const TICK_ACTIVE = '#000000'

/** How many <rect>s to keep in the pool — the window plus a little slack. */
const POOL = 32

export interface AgeRulerProps {
  engine: RulerEngine
  /** Half the visible tick window, in px. 273 at the reference viewport. */
  halfWindow: number
  /** Distance between tick centres, in px. 23.8 at the reference viewport. */
  pitch: number
  /** Announced age — kept in React state by the parent. */
  age: number
}

/**
 * The scrolling tick strip.
 *
 * This is not a track-with-a-thumb: the strip translates behind a fixed centre
 * and the tick nearest that centre is recoloured black. Every tick is
 * bottom-aligned and its height is a function of its distance from the centre.
 *
 * Ticks are drawn as SVG rects and written imperatively from the engine's rAF
 * loop — updating `y`/`height` on an SVG rect costs a repaint of this one
 * subtree, where animating CSS `height` on 23 absolutely-positioned divs would
 * cost a layout pass every frame.
 */
export function AgeRuler({ engine, halfWindow, pitch, age }: AgeRulerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const rectsRef = useRef<SVGRectElement[]>([])
  const hostRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: number; x: number } | null>(null)

  const width = halfWindow * 2
  const range = envelopeRangeFor(halfWindow)

  // --- per-frame paint -----------------------------------------------------
  useEffect(() => {
    const rects = rectsRef.current
    if (!rects.length) return

    return engine.subscribe((index, offset) => {
      const { first, last } = visibleRange(offset, halfWindow, pitch)
      const activeIndex = clampIndex(Math.round(index))
      let slot = 0
      for (let i = first; i <= last && slot < rects.length; i += 1, slot += 1) {
        const rect = rects[slot]
        const x = halfWindow + i * pitch - offset
        const d = Math.abs(x - halfWindow)
        const h = tickHeight(d, range)
        rect.setAttribute('x', String(x - TICK_WIDTH / 2))
        rect.setAttribute('y', String(TICK_MAX_HEIGHT - h))
        rect.setAttribute('height', String(h))
        rect.setAttribute('fill', i === activeIndex ? TICK_ACTIVE : TICK_IDLE)
        rect.style.display = ''
      }
      for (; slot < rects.length; slot += 1) rects[slot].style.display = 'none'
    })
  }, [engine, halfWindow, pitch, range])

  // --- wheel ---------------------------------------------------------------
  // Attached natively: React registers `wheel` passively at the root, so an
  // onWheel prop could not preventDefault and the page would scroll instead.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      engine.nudge(delta)
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [engine])

  // --- pointer drag (not in the reference, but required on touch) ----------
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      dragRef.current = { id: e.pointerId, x: e.clientX }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.id !== e.pointerId) return
      const dx = e.clientX - drag.x
      drag.x = e.clientX
      engine.nudge(-dx)
    },
    [engine],
  )

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id !== e.pointerId) return
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }, [])

  // --- keyboard ------------------------------------------------------------
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const current = Math.round(engine.index)
      let next: number | null = null
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowDown':
          next = current - 1
          break
        case 'ArrowRight':
        case 'ArrowUp':
          next = current + 1
          break
        case 'PageDown':
          next = current - 10
          break
        case 'PageUp':
          next = current + 10
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = MAX_INDEX
          break
        default:
          return
      }
      e.preventDefault()
      // Keys move by whole years: a keyboard user cannot express a fraction, so
      // stepping also squares up the fractional offset the wheel may have left.
      engine.stepTo(clampIndex(next))
    },
    [engine],
  )

  return (
    <div
      ref={hostRef}
      role="slider"
      tabIndex={0}
      aria-label="Age"
      aria-valuemin={MIN_AGE}
      aria-valuemax={MAX_AGE}
      aria-valuenow={age}
      aria-valuetext={`Age ${age}`}
      aria-orientation="horizontal"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className="relative touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-black/15 focus-visible:ring-offset-4 focus-visible:ring-offset-[#fdfdfd]"
      style={{ width, height: TICK_MAX_HEIGHT, borderRadius: 4 }}
    >
      <svg
        ref={svgRef}
        width={width}
        height={TICK_MAX_HEIGHT}
        viewBox={`0 0 ${width} ${TICK_MAX_HEIGHT}`}
        className="block overflow-hidden"
        aria-hidden
        focusable="false"
      >
        {Array.from({ length: POOL }, (_, i) => (
          <rect
            key={i}
            ref={(el) => {
              if (el) rectsRef.current[i] = el
            }}
            width={TICK_WIDTH}
            x={-100}
            y={0}
            height={0}
            fill={TICK_IDLE}
          />
        ))}
      </svg>
    </div>
  )
}
