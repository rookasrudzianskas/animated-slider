#!/usr/bin/env node
/**
 * Screenshot the running app at the reference viewport, drive it to the same
 * ruler position as a chosen frame of the reference recording, and report the
 * per-region pixel difference.
 *
 * Usage:
 *   node scripts/compare.mjs                 # the default frame set
 *   node scripts/compare.mjs 10 430 870      # specific frame numbers
 *   node scripts/compare.mjs --write         # also write side-by-side PNGs
 *
 * The recording is a DPR-2 capture of a 1090x1080 CSS viewport, so we shoot at
 * exactly that with deviceScaleFactor 2 and compare against the 1090px-wide
 * JPEG frames (1 image px == 1 CSS px).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

const SCRATCH =
  '/private/tmp/claude-501/-Users-rokasrudzianskas-Documents-slider/5e786c9c-4db0-4d85-accf-4c8db887cebf/scratchpad'
const OUT = path.join(SCRATCH, 'compare')
const URL_BASE = process.env.SLIDER_URL ?? 'http://localhost:3000'

/** Frames chosen because the ruler is at rest and the cursor is clear of the UI. */
const DEFAULT_FRAMES = [10, 60, 400, 430, 450, 820, 860]

const REGIONS = {
  toggle: [950, 10, 140, 50],
  face: [380, 250, 330, 380],
  pill: [480, 640, 130, 45],
  ruler: [260, 690, 570, 100],
  full: [0, 0, 1090, 1080],
}

const args = process.argv.slice(2)
const write = args.includes('--write')
const frames = args.filter((a) => /^\d+$/.test(a)).map(Number)
const targets = frames.length ? frames : DEFAULT_FRAMES

mkdirSync(OUT, { recursive: true })

/** Ruler index + colour mode of each reference frame, from the frame analysis. */
function referenceState(frame) {
  const json = execFileSync('python3', [
    '-c',
    `
import json, numpy as np, sys
SP="${SCRATCH}"
d={r["n"]: r for r in json.load(open(SP+"/frames.json"))}
tog=json.load(open(SP+"/toggle.json"))
sc=np.load(SP+"/scroll.npy")
n=${frame}
C=1090.78; S=47.60
r=d[n]
if r["rm"] is not None and r["nr"]<=9:
    idx=(C-r["rm"]+90*S)/S
else:
    idx=sc[n-1]/S
print(json.dumps({"index": float(idx), "mode": tog.get(str(n), "mono")}))
`,
  ])
  return JSON.parse(json.toString())
}

/** Where the mouse pointer is in a reference frame, so it can be masked out. */
const CURSORS = JSON.parse(
  execFileSync('python3', ['-c', `import json;print(open("${SCRATCH}/cursor2.json").read())`]).toString(),
)
function cursorBox(frame) {
  return CURSORS[String(frame)] ?? null
}

const browser = await chromium.launch()
const page = await browser.newPage({
  viewport: { width: 1090, height: 1080 },
  deviceScaleFactor: 2,
})
await page.goto(URL_BASE, { waitUntil: 'networkidle' })
await page.waitForFunction(() => Boolean(window.__slider))

const rows = []
for (const frame of targets) {
  const { index, mode } = referenceState(frame)
  await page.evaluate(
    ([i, m]) => {
      window.__slider.setMode(m)
      window.__slider.setIndex(i)
    },
    [index, mode],
  )
  // let the canvas settle: the face pair may still be decoding
  await page.waitForTimeout(400)
  const shot = path.join(OUT, `app_${String(frame).padStart(4, '0')}.png`)
  await page.screenshot({ path: shot })

  const report = execFileSync('python3', [
    path.join(process.cwd(), 'scripts', 'diff.py'),
    shot,
    path.join(SCRATCH, 'frames_all', `f_${String(frame).padStart(4, '0')}.jpg`),
    JSON.stringify(REGIONS),
    write ? path.join(OUT, `diff_${String(frame).padStart(4, '0')}.png`) : '',
    JSON.stringify(cursorBox(frame) ?? ''),
  ])
  const parsed = JSON.parse(report.toString())
  rows.push({ frame, index: Number(index.toFixed(3)), mode, ...parsed })
}

await browser.close()

const pad = (s, n) => String(s).padEnd(n)
console.log(
  pad('frame', 7) + pad('index', 9) + pad('mode', 7) +
    Object.keys(REGIONS).map((r) => pad(r, 18)).join(''),
)
for (const row of rows) {
  console.log(
    pad(row.frame, 7) + pad(row.index, 9) + pad(row.mode, 7) +
      Object.keys(REGIONS)
        .map((r) => pad(`${row[r].mean.toFixed(2)} / ${row[r].p99.toFixed(0)}`, 18))
        .join(''),
  )
}
console.log('\ncolumns are  mean|Δ| / 99th-percentile|Δ|  in 0-255 luminance')
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(rows, null, 2))
console.log(`\nreport: ${path.join(OUT, 'report.json')}`)
