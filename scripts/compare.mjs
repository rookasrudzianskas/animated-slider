#!/usr/bin/env node
/**
 * Screenshot the running app at the reference viewport, drive it to the same
 * ruler position as a chosen frame of the reference recording, and report the
 * per-region pixel difference.
 *
 *   node scripts/compare.mjs                 # the default frame set
 *   node scripts/compare.mjs 10 430 870      # specific frames
 *   node scripts/compare.mjs --write         # also write ref/app/heatmap strips
 *   node scripts/compare.mjs --lossless      # diff at full res against the PNGs
 *
 * The recording is a DPR-2 capture of a 1090x1080 CSS viewport, so we shoot at
 * exactly that with deviceScaleFactor 2. The 1090px-wide JPEG frames are then
 * one image px per CSS px; --lossless instead compares the four full-resolution
 * PNGs, which is the stricter test because it has no JPEG noise in it.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

import { REFERENCE_DIR, cursorOf, framePath, losslessPath, requireReference, stateOf } from './reference.mjs'

const OUT = path.join(REFERENCE_DIR, 'compare')
const URL_BASE = process.env.SLIDER_URL ?? 'http://localhost:3000'

/** Frames chosen because the ruler is at rest and the artwork has settled. */
const DEFAULT_FRAMES = [10, 60, 400, 430, 450, 820, 860]
/** Frames that also have a full-resolution PNG. */
const LOSSLESS_FRAMES = { 10: 'rest_01', 430: 'rest_02', 870: 'rest_03', 500: 'color_active' }

const REGIONS_CSS = {
  toggle: [950, 10, 140, 50],
  face: [380, 250, 330, 380],
  pill: [480, 640, 130, 45],
  ruler: [260, 690, 570, 100],
  full: [0, 0, 1090, 1080],
}
const REGIONS_DEVICE = Object.fromEntries(
  Object.entries(REGIONS_CSS).map(([k, v]) => [k, v.map((n) => n * 2)]),
)

requireReference()
const args = process.argv.slice(2)
const write = args.includes('--write')
const lossless = args.includes('--lossless')
const asked = args.filter((a) => /^\d+$/.test(a)).map(Number)
const targets = asked.length ? asked : lossless ? Object.keys(LOSSLESS_FRAMES).map(Number) : DEFAULT_FRAMES

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1090, height: 1080 },
  deviceScaleFactor: 2,
})
await page.goto(URL_BASE, { waitUntil: 'networkidle' })
await page.waitForFunction(() => Boolean(window.__slider))

const rows = []
for (const frame of targets) {
  const state = stateOf(frame)
  if (!state) {
    console.warn(`frame ${frame}: no trusted reference index, skipping`)
    continue
  }
  await page.evaluate(
    ([i, m]) => {
      window.__slider.setMode(m)
      window.__slider.setIndex(i)
    },
    [state.index, state.mode],
  )
  // let the artwork's decode settle before shooting
  await page.waitForTimeout(400)
  const shot = path.join(OUT, `app_${String(frame).padStart(4, '0')}.png`)
  await page.screenshot({ path: shot })

  const useLossless = lossless && LOSSLESS_FRAMES[frame]
  const cursor = cursorOf(frame)
  const report = JSON.parse(
    execFileSync('python3', [
      path.join(process.cwd(), 'scripts', 'diff.py'),
      shot,
      useLossless ? losslessPath(LOSSLESS_FRAMES[frame]) : framePath(frame),
      JSON.stringify(useLossless ? REGIONS_DEVICE : REGIONS_CSS),
      write ? path.join(OUT, `diff_${String(frame).padStart(4, '0')}.png`) : '',
      JSON.stringify(cursor && useLossless ? cursor.map((n) => n * 2) : (cursor ?? '')),
    ]).toString(),
  )
  rows.push({ frame, index: Number(state.index.toFixed(3)), mode: state.mode, ...report })
}

await browser.close()

const pad = (s, n) => String(s).padEnd(n)
console.log(
  pad('frame', 7) + pad('index', 9) + pad('mode', 7) +
    Object.keys(REGIONS_CSS).map((r) => pad(r, 18)).join(''),
)
for (const row of rows) {
  console.log(
    pad(row.frame, 7) + pad(row.index, 9) + pad(row.mode, 7) +
      Object.keys(REGIONS_CSS)
        .map((r) => pad(`${row[r].mean.toFixed(2)} / ${row[r].p99.toFixed(0)}`, 18))
        .join(''),
  )
}
console.log(
  `\ncolumns are  mean|Δ| / 99th-percentile|Δ|  in 0-255 luminance` +
    `\ncompared against ${lossless ? 'the full-resolution PNGs' : 'the 1090px JPEG frames'}`,
)
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(rows, null, 2))
console.log(`report: ${path.join(OUT, 'report.json')}`)
