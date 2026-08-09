'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { AgePill } from '@/components/AgePill'
import { AgeRuler } from '@/components/AgeRuler'
import { FaceStack } from '@/components/FaceStack'
import { ModeToggle, type ColourMode } from '@/components/ModeToggle'
import {
  COLUMN_LIFT,
  RULER_OFFSET_X,
  FACE,
  FACE_TO_PILL,
  PILL_TO_RULER,
  TOGGLE_INSET,
} from '@/lib/layout'
import { FOLLOW_TAU, HALF_WINDOW, MIN_AGE, TICK_PITCH } from '@/lib/ruler'
import { RulerEngine } from '@/lib/rulerEngine'
import { exposeForTesting } from '@/lib/testing'

/**
 * The whole scene: artwork, age capsule, ruler, and the Mono/Color toggle.
 *
 * The ruler's continuous offset lives in `RulerEngine` and is written straight
 * to the DOM every frame; the only thing that re-renders React here is the
 * rounded age.
 */
export function AgeProgression() {
  const [age, setAge] = useState(MIN_AGE)
  const [mode, setMode] = useState<ColourMode>('mono')
  const modeRef = useRef(setMode)
  modeRef.current = setMode

  const engine = useMemo(
    () =>
      new RulerEngine(0, {
        pitch: TICK_PITCH,
        onIndexSettled: (index) => setAge(index + MIN_AGE),
      }),
    [],
  )

  useEffect(() => () => engine.stop(), [engine])

  // Honour reduced motion by collapsing the follower rather than removing the
  // behaviour: the ruler still tracks the input, it just stops lagging behind.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => engine.setTau(query.matches ? 0 : FOLLOW_TAU)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [engine])

  useEffect(
    () => exposeForTesting(engine, { setMode: (next) => modeRef.current(next) }),
    [engine],
  )

  return (
    <main className="relative min-h-dvh w-full overflow-hidden">
      <div className="absolute z-10" style={{ top: TOGGLE_INSET.top, right: TOGGLE_INSET.right }}>
        <ModeToggle value={mode} onChange={setMode} />
      </div>

      {/*
        The column is not on the viewport's vertical centre in the reference —
        it sits COLUMN_LIFT above it. Padding the bottom of the centring box by
        twice that lift reproduces the measured position exactly.
      */}
      <div
        className="flex min-h-dvh flex-col items-center justify-center"
        style={{ paddingBottom: COLUMN_LIFT * 2 }}
      >
        <FaceStack engine={engine} mono={mode === 'mono'} width={FACE.width} height={FACE.height} />

        <div style={{ marginTop: FACE_TO_PILL }}>
          <AgePill age={age} />
        </div>

        <div style={{ marginTop: PILL_TO_RULER, transform: `translateX(${RULER_OFFSET_X}px)` }}>
          <AgeRuler engine={engine} halfWindow={HALF_WINDOW} pitch={TICK_PITCH} age={age} />
        </div>
      </div>
    </main>
  )
}
