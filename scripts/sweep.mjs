#!/usr/bin/env node
/**
 * Frame-by-frame sweep: drive the app to the reconstructed ruler position of
 * many reference frames and diff each one.
 *
 * `compare.mjs` checks a handful of hand-picked frames; this checks a sample
 * spread across the whole age range, taken from every frame whose reference
 * position is trusted and whose ruler is close enough to at rest that a still
 * comparison means anything.
 *
 *   node scripts/sweep.mjs [sampleCount]
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

import { REFERENCE_DIR, cursorOf, framePath, requireReference, restingFrames } from './reference.mjs'

const OUT = path.join(REFERENCE_DIR, 'sweep')
const REGIONS = {
  face: [380, 250, 330, 380],
  pill: [480, 640, 130, 45],
  ruler: [260, 690, 570, 100],
  full: [0, 0, 1090, 1080],
}

requireReference()
mkdirSync(OUT, { recursive: true })

const limit = Number(process.argv[2] ?? 60)
const resting = restingFrames().sort((a, b) => a.index - b.index)
// spread the picks over the age range rather than clustering on the long rests
const step = Math.max(1, Math.floor(resting.length / limit))
const picks = resting.filter((_, i) => i % step === 0).slice(0, limit)
console.log(`${resting.length} near-rest frames with a trusted index; sampling ${picks.length}`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1090, height: 1080 }, deviceScaleFactor: 2 })
await page.goto(process.env.SLIDER_URL ?? 'http://localhost:3000', { waitUntil: 'networkidle' })
await page.waitForFunction(() => Boolean(window.__slider))

const rows = []
for (const p of picks) {
  await page.evaluate(
    ([i, m]) => {
      window.__slider.setMode(m)
      window.__slider.setIndex(i)
    },
    [p.index, p.mode],
  )
  await page.waitForTimeout(260)
  const shot = path.join(OUT, `a_${String(p.frame).padStart(4, '0')}.png`)
  await page.screenshot({ path: shot })
  const report = JSON.parse(
    execFileSync('python3', [
      path.join(process.cwd(), 'scripts', 'diff.py'),
      shot,
      framePath(p.frame),
      JSON.stringify(REGIONS),
      '',
      JSON.stringify(cursorOf(p.frame) ?? ''),
    ]).toString(),
  )
  rows.push({ ...p, ...report })
}
await browser.close()

const stat = (key) => {
  const v = rows.map((r) => r[key].mean).sort((a, b) => a - b)
  return { median: v[Math.floor(v.length / 2)], p90: v[Math.floor(v.length * 0.9)], max: v[v.length - 1] }
}
console.log('\nregion    median      p90      max   (mean |Δ| per frame, 0-255)')
for (const key of ['ruler', 'pill', 'face', 'full']) {
  const s = stat(key)
  console.log(
    `${key.padEnd(9)} ${s.median.toFixed(2).padStart(6)} ${s.p90.toFixed(2).padStart(8)} ${s.max.toFixed(2).padStart(8)}`,
  )
}
const worst = [...rows].sort((a, b) => b.full.mean - a.full.mean).slice(0, 6)
console.log('\nworst frames by full-viewport mean:')
for (const w of worst) {
  console.log(
    `  frame ${String(w.frame).padStart(4)}  index ${w.index.toFixed(2).padStart(6)}  ${w.mode.padEnd(5)}` +
      `  full ${w.full.mean.toFixed(2)}  ruler ${w.ruler.mean.toFixed(2)}  face ${w.face.mean.toFixed(2)}`,
  )
}
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(rows, null, 2))
