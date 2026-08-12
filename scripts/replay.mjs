#!/usr/bin/env node
/**
 * Replay a real deceleration from the recording and overlay it on the app's.
 *
 * `behaviour.mjs` fits a time constant; this is the stronger test — it takes an
 * actual settle out of the reference, drives the app with the input that would
 * produce the same starting velocity, and reports the worst per-frame
 * divergence in ticks.
 *
 *   node scripts/replay.mjs
 */
import { chromium } from 'playwright'

import { referenceData, requireReference } from './reference.mjs'

requireReference()
const { index } = referenceData()

/** Contiguous runs of frames where the ruler decelerates to a stop. */
function findSettles(minFrames = 10) {
  const settles = []
  const at = (n) => index[String(n)]
  for (let n = 2; n < 890; n += 1) {
    if (at(n) === undefined || at(n - 1) === undefined) continue
    const v = at(n) - at(n - 1)
    if (Math.abs(v) < 0.15) continue
    // walk forward while the speed keeps dropping
    const trace = [at(n - 1), at(n)]
    let m = n
    while (m < 890 && at(m + 1) !== undefined) {
      const prev = Math.abs(at(m) - at(m - 1))
      const next = Math.abs(at(m + 1) - at(m))
      if (next > prev * 1.02) break
      trace.push(at(m + 1))
      m += 1
      if (next < 0.004) break
    }
    if (trace.length >= minFrames) settles.push({ start: n - 1, trace })
    n = m
  }
  return settles
}

const settles = findSettles().sort((a, b) => b.trace.length - a.trace.length).slice(0, 4)
console.log(`found ${settles.length} usable decelerations in the recording\n`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1090, height: 1080 }, deviceScaleFactor: 1 })
await page.goto(process.env.SLIDER_URL ?? 'http://localhost:3000', { waitUntil: 'networkidle' })
await page.waitForFunction(() => Boolean(window.__slider))

let worstOverall = 0
for (const s of settles) {
  const from = s.trace[0]
  const to = s.trace[s.trace.length - 1]
  // The recording's settle starts with the target already set; reproduce that
  // by jumping to the start and nudging straight to the destination.
  const appTrace = await page.evaluate(
    async ([start, end, frames]) => {
      window.__slider.setIndex(start)
      await new Promise((r) => setTimeout(r, 200))
      const samples = []
      const t0 = performance.now()
      const el = document.querySelector('[role="slider"]')
      const step = () => {
        samples.push([performance.now() - t0, window.__slider.getIndex()])
        if (samples.length < 400) requestAnimationFrame(step)
      }
      step()
      el.dispatchEvent(
        new WheelEvent('wheel', { deltaY: (end - start) * 23.8, bubbles: true, cancelable: true }),
      )
      await new Promise((r) => setTimeout(r, (frames / 30) * 1000 + 120))
      return samples
    },
    [from, to, s.trace.length],
  )

  // resample the app onto the recording's 30fps grid
  const diverge = s.trace.map((refValue, i) => {
    const t = (i / 30) * 1000
    let best = appTrace[0]
    for (const sample of appTrace) if (Math.abs(sample[0] - t) < Math.abs(best[0] - t)) best = sample
    return Math.abs(best[1] - refValue)
  })
  const worst = Math.max(...diverge)
  // The first frames are still under the user's hand in the recording, where
  // the replay applies the whole delta at once. The tail is the part governed
  // purely by the follower, and it is the part this is really testing.
  const tail = Math.max(...diverge.slice(3))
  worstOverall = Math.max(worstOverall, tail)
  console.log(
    `frames ${String(s.start).padStart(3)}..${String(s.start + s.trace.length - 1).padEnd(3)}  ` +
      `${from.toFixed(2)} -> ${to.toFixed(2)} over ${String(s.trace.length).padStart(2)} frames  ` +
      `worst ${worst.toFixed(3)}  tail ${tail.toFixed(3)} ticks (${(tail * 23.8).toFixed(1)} px)`,
  )
}
await browser.close()
console.log(
  `\nworst TAIL divergence across all replays: ${worstOverall.toFixed(3)} ticks ` +
    `= ${(worstOverall * 23.8).toFixed(1)} px`,
)
process.exit(worstOverall > 0.45 ? 1 : 0)
