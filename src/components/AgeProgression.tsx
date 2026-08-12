'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { AgePill } from '@/components/AgePill'
import { AgeRuler } from '@/components/AgeRuler'
import { FaceStack } from '@/components/FaceStack'
import { ModeToggle, type ColourMode } from '@/components/ModeToggle'
import { COLUMN_OFFSET_X, FACE_TO_PILL, PILL_TO_RULER, TOGGLE_INSET } from '@/lib/layout'
import { FOLLOW_TAU, MIN_AGE, TICK_PITCH } from '@/lib/ruler'
import { RulerEngine } from '@/lib/rulerEngine'
import { exposeForTesting } from '@/lib/testing'
import { useViewportLayout } from '@/lib/useViewport'

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
  useEffect(() => {
    modeRef.current = setMode
  }, [])

  const layout = useViewportLayout()

  const engine = useMemo(
    () =>
      new RulerEngine(0, {
        pitch: TICK_PITCH,
        // React state carries the announced value and the artwork's text
        // alternative, both of which can lag a frame without anyone noticing.
        // The capsule does NOT go through here — see AgePill.
        onIndexSettled: (index) => setAge(index + MIN_AGE),
      }),
    [],
  )

  // A viewport change alters the tick pitch; the ruler holds its AGE across it
  // rather than its pixel offset.
  useEffect(() => {
    engine.setPitch(layout.pitch)
  }, [engine, layout.pitch])

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
        The column is NOT vertically centred in the reference — the artwork's box
        starts at y 235 in a 1080-tall viewport, where centring would put it at
        265. So it is positioned from the top directly: the spare space is split
        between above and below in the measured 0.387 : 0.613 ratio.
      */}
      <div
        className="flex min-h-dvh flex-col items-center"
        style={{ paddingTop: layout.columnTop }}
      >
        <FaceStack
          engine={engine}
          mono={mode === 'mono'}
          age={age}
          width={layout.faceWidth}
          height={layout.faceHeight}
        />

        <div style={{ marginTop: FACE_TO_PILL, transform: `translateX(${COLUMN_OFFSET_X}px)` }}>
          <AgePill engine={engine} age={age} />
        </div>

        <div style={{ marginTop: PILL_TO_RULER, transform: `translateX(${COLUMN_OFFSET_X}px)` }}>
          <AgeRuler
            engine={engine}
            pitch={layout.pitch}
            latticeOffset={layout.latticeOffset}
            maxHeight={layout.tickMaxHeight}
            minHeight={layout.tickMinHeight}
            age={age}
          />
        </div>
      </div>
    </main>
  )
}
