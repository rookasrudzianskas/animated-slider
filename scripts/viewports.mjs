#!/usr/bin/env node
/** Screenshot the app across viewports so the responsive rules can be eyeballed. */
import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { chromium } from 'playwright'

import { REFERENCE_DIR } from './reference.mjs'

const OUT = path.join(REFERENCE_DIR, 'viewports')
mkdirSync(OUT, { recursive: true })
const SIZES = [
  ['reference', 1090, 1080],
  ['desktop', 1440, 900],
  ['laptop-short', 1280, 620],
  ['tablet', 768, 1024],
  ['phone', 390, 844],
  ['phone-small', 320, 568],
  ['phone-landscape', 844, 390],
]

const browser = await chromium.launch()
for (const [name, width, height] of SIZES) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(window.__slider))
  await page.evaluate(() => window.__slider.setIndex(28.4))
  await page.waitForTimeout(500)
  const info = await page.evaluate(() => {
    const r = document.querySelector('[role="slider"]').getBoundingClientRect()
    const c = document.querySelector('canvas').getBoundingClientRect()
    const ticks = [...document.querySelectorAll('rect')].filter((t) => t.style.display !== 'none').length
    return {
      ruler: [Math.round(r.width), Math.round(r.height), Math.round(r.top)],
      face: [Math.round(c.width), Math.round(c.height), Math.round(c.top)],
      ticks,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    }
  })
  await page.screenshot({ path: path.join(OUT, `vp_${name}.png`) })
  console.log(
    `${name.padEnd(16)} ${String(width).padStart(4)}x${String(height).padEnd(5)} ruler=${info.ruler.join('x')}  face=${info.face.join('x')}  slots=${info.ticks}  hOverflow=${info.overflowX}`,
  )
  await page.close()
}
await browser.close()
