#!/usr/bin/env node
/**
 * Sweep the age capsule's font weight/size/stack and report which combination
 * minimises the pixel difference against the lossless reference frame.
 *
 * Run against a dev server: node scripts/textsweep.mjs
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { chromium } from 'playwright'

import { REFERENCE_DIR, losslessPath, requireReference } from './reference.mjs'

requireReference()
const OUT = path.join(REFERENCE_DIR, 'compare')
const REF = losslessPath('rest_01')

const WEIGHTS = [400, 450, 500]
const SIZES = [14.8, 15, 15.2]
const STACKS = [
  ['system', '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif'],
  ['helvetica', '"Helvetica Neue", Helvetica, Arial, sans-serif'],
  ['arial', 'Arial, Helvetica, sans-serif'],
]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1090, height: 1080 }, deviceScaleFactor: 2 })
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
await page.waitForFunction(() => Boolean(window.__slider))
await page.evaluate(() => window.__slider.setIndex(0))
await page.waitForTimeout(500)

const rows = []
for (const [stackName, stack] of STACKS) {
  for (const weight of WEIGHTS) {
    for (const size of SIZES) {
      await page.evaluate(
        ([s, w, z]) => {
          document.documentElement.style.setProperty('--font-ui', s)
          const pill = document.querySelector('[data-pill]')
          if (pill) {
            pill.style.fontWeight = String(w)
            pill.style.fontSize = `${z}px`
          }
        },
        [stack, weight, size],
      )
      await page.waitForTimeout(60)
      const shot = path.join(OUT, 'sweep.png')
      await page.screenshot({ path: shot })
      const out = execFileSync('python3', [
        '-c',
        `
import numpy as np, json
from PIL import Image
ref=np.asarray(Image.open("${REF}").convert('RGB')).astype(float)
app=np.asarray(Image.open("${shot}").convert('RGB')).astype(float)
d=np.abs(ref-app).mean(axis=2)
s=d[1280:1390, 980:1200]
print(json.dumps({"mean": float(s.mean()), "over30": int((s>30).sum())}))
`,
      ])
      const { mean, over30 } = JSON.parse(out.toString())
      rows.push({ stackName, weight, size, mean, over30 })
    }
  }
}
await browser.close()
rows.sort((a, b) => a.mean - b.mean)
console.log('stack       weight  size    pill mean   px>30')
for (const r of rows) {
  console.log(
    `${r.stackName.padEnd(11)} ${String(r.weight).padEnd(7)} ${String(r.size).padEnd(7)} ${r.mean.toFixed(3).padStart(9)} ${String(r.over30).padStart(7)}`,
  )
}
