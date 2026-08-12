'use client'

import { useEffect, useRef } from 'react'

import {
  FACE_CSS_H,
  FACE_CSS_W,
  FACE_H,
  FACE_W,
  getFace,
  getNearestFace,
  prefetchAll,
  warmAround,
} from '@/lib/faces'
import { faceBlend } from '@/lib/ruler'
import type { RulerEngine } from '@/lib/rulerEngine'

export interface FaceStackProps {
  engine: RulerEngine
  mono: boolean
  width?: number
  height?: number
}

/**
 * The age artwork.
 *
 * The reference blends continuously with the *fractional* ruler position — two
 * resting states both labelled "Age: 5" show measurably different faces
 * (REFERENCE.md §5) — so this is a crossfade driven by the offset, not a swap
 * driven by the rounded age.
 *
 * Drawn to a canvas whose backing store is exactly the artwork's intrinsic
 * size, so there is no resampling, and so the pair being blended can change
 * every frame without touching the DOM.
 */
export function FaceStack({ engine, mono, width = FACE_CSS_W, height = FACE_CSS_H }: FaceStackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    prefetchAll()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let warmedFor = Number.NaN
    let pendingRaf = 0

    const paint = (index: number) => {
      const { lo, hi, t } = faceBlend(index)
      if (Math.round(index) !== warmedFor) {
        warmedFor = Math.round(index)
        warmAround(index)
      }
      const exact = getFace(lo)
      // Never clear without something to put back: a scrub can outrun decoding,
      // and a single blank frame reads as a flicker.
      const a = exact ?? getNearestFace(index)
      if (!a) {
        schedule()
        return
      }
      const b = lo === hi || !exact ? undefined : getFace(hi)
      ctx.clearRect(0, 0, FACE_W, FACE_H)
      ctx.globalAlpha = 1
      ctx.drawImage(a, 0, 0, FACE_W, FACE_H)
      if (b && t > 0) {
        ctx.globalAlpha = t
        ctx.drawImage(b, 0, 0, FACE_W, FACE_H)
        ctx.globalAlpha = 1
      }
      // The engine stops emitting once the ruler settles, so if either image of
      // the pair was still decoding we keep repainting on our own — otherwise
      // the canvas stays on whatever was ready when it came to rest.
      if (!exact || (b === undefined && lo !== hi)) schedule()
    }

    function schedule() {
      if (pendingRaf) return
      pendingRaf = requestAnimationFrame(() => {
        pendingRaf = 0
        paint(engine.index)
      })
    }

    const unsubscribe = engine.subscribe(paint)
    return () => {
      unsubscribe()
      if (pendingRaf) cancelAnimationFrame(pendingRaf)
    }
  }, [engine])

  return (
    <canvas
      ref={canvasRef}
      width={FACE_W}
      height={FACE_H}
      aria-hidden
      className="block"
      style={{
        width,
        height,
        filter: mono ? 'grayscale(1)' : 'none',
      }}
    />
  )
}
