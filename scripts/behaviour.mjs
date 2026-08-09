#!/usr/bin/env node
/**
 * Behavioural checks against the numbers measured from the recording.
 *
 * Geometry is checked by scripts/compare.mjs; this checks the things a
 * screenshot cannot see — the follower's time constant, the absence of
 * snapping, the clamps, and the input paths.
 *
 *   npm run dev
 *   node scripts/behaviour.mjs
 */
import { chromium } from 'playwright'

const URL_BASE = process.env.SLIDER_URL ?? 'http://localhost:3000'
const TAU_MS = 79.2 // measured: median velocity ratio 0.6564 per 1/30s frame

const results = []
function check(name, pass, detail) {
  results.push({ name, pass, detail })
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1090, height: 1080 }, deviceScaleFactor: 2 })
await page.goto(URL_BASE, { waitUntil: 'networkidle' })
await page.waitForFunction(() => Boolean(window.__slider))

const ruler = page.locator('[role="slider"]')
const box = await ruler.boundingBox()
const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

// --- 1. the follower's time constant ---------------------------------------
await page.evaluate(() => window.__slider.setIndex(40))
await page.waitForTimeout(200)

const trace = await page.evaluate(async () => {
  const samples = []
  const el = document.querySelector('[role="slider"]')
  const start = performance.now()
  let raf
  const tick = () => {
    samples.push([performance.now() - start, window.__slider.getIndex()])
    if (performance.now() - start < 700) raf = requestAnimationFrame(tick)
  }
  tick()
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 240, bubbles: true, cancelable: true }))
  await new Promise((r) => setTimeout(r, 750))
  cancelAnimationFrame(raf)
  return samples
})

// fit tau to the approach: index(t) = target - (target - start) * exp(-t/tau)
const final = trace[trace.length - 1][1]
const first = trace[0][1]
const fitted = []
for (const [t, v] of trace) {
  const remaining = Math.abs(final - v) / Math.abs(final - first)
  if (remaining < 0.7 && remaining > 0.03 && t > 40) fitted.push(-t / Math.log(remaining))
}
fitted.sort((a, b) => a - b)
const tau = fitted[Math.floor(fitted.length / 2)]
check(
  'follower time constant',
  Math.abs(tau - TAU_MS) < 12,
  `measured tau ${tau.toFixed(1)}ms, reference ${TAU_MS}ms`,
)

const overshoot = Math.max(...trace.map(([, v]) => v)) - final
check('no overshoot', overshoot <= 0.001, `max excursion past rest ${overshoot.toFixed(4)} ticks`)

// --- 2. no snapping ---------------------------------------------------------
await page.evaluate(() => window.__slider.setIndex(18))
await page.waitForTimeout(120)
await page.evaluate(() => {
  document
    .querySelector('[role="slider"]')
    .dispatchEvent(new WheelEvent('wheel', { deltaY: 17.8, bubbles: true, cancelable: true }))
})
await page.waitForTimeout(600)
const rested = await page.evaluate(() => window.__slider.getIndex())
check(
  'comes to rest at a fractional index (no snapping)',
  Math.abs(rested - Math.round(rested)) > 0.05,
  `rested at ${rested.toFixed(4)}`,
)

const restedAge = await page.locator('[data-pill]').innerText()
check(
  'label rounds while the ruler does not move',
  restedAge === `Age: ${Math.round(rested) + 5}`,
  `${restedAge} at index ${rested.toFixed(3)}`,
)

// --- 3. clamps --------------------------------------------------------------
await page.evaluate(() => {
  const el = document.querySelector('[role="slider"]')
  for (let i = 0; i < 40; i += 1)
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true, cancelable: true }))
})
await page.waitForTimeout(1400)
const low = await page.evaluate(() => window.__slider.getIndex())
check('clamps at the young end', Math.abs(low) < 0.002, `index ${low.toFixed(4)} (expect 0)`)
check('shows age 5 at the young end', (await page.locator('[data-pill]').innerText()) === 'Age: 5')

await page.evaluate(() => {
  const el = document.querySelector('[role="slider"]')
  for (let i = 0; i < 40; i += 1)
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 400, bubbles: true, cancelable: true }))
})
await page.waitForTimeout(1400)
const high = await page.evaluate(() => window.__slider.getIndex())
check('clamps at the old end', Math.abs(high - 90) < 0.002, `index ${high.toFixed(4)} (expect 90)`)
check('shows age 95 at the old end', (await page.locator('[data-pill]').innerText()) === 'Age: 95')

// --- 4. the page must not scroll --------------------------------------------
const scrolled = await page.evaluate(() => {
  const before = window.scrollY
  document
    .querySelector('[role="slider"]')
    .dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true }))
  return window.scrollY - before
})
check('wheel does not scroll the page', scrolled === 0)

// --- 5. keyboard ------------------------------------------------------------
await page.evaluate(() => window.__slider.setIndex(20.4))
await ruler.focus()
await page.keyboard.press('ArrowRight')
await page.waitForTimeout(800)
const afterKey = await page.evaluate(() => window.__slider.getIndex())
check(
  'ArrowRight steps one whole year and squares up the fraction',
  Math.abs(afterKey - 21) < 0.002,
  `index ${afterKey.toFixed(4)} from 20.4`,
)
await page.keyboard.press('Home')
await page.waitForTimeout(1400)
check('Home goes to the first tick', Math.abs(await page.evaluate(() => window.__slider.getIndex())) < 0.002)
await page.keyboard.press('End')
await page.waitForTimeout(1400)
check('End goes to the last tick', Math.abs((await page.evaluate(() => window.__slider.getIndex())) - 90) < 0.002)

// --- 6. pointer drag --------------------------------------------------------
await page.evaluate(() => window.__slider.setIndex(45))
await page.waitForTimeout(150)
await page.mouse.move(centre.x, centre.y)
await page.mouse.down()
await page.mouse.move(centre.x - 47.6, centre.y, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(500)
const dragged = await page.evaluate(() => window.__slider.getIndex())
check(
  'dragging left by two pitches advances two years',
  Math.abs(dragged - 47) < 0.15,
  `index ${dragged.toFixed(3)} from 45 after -47.6px`,
)

// --- 7. focus ring only on keyboard focus -----------------------------------
await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
await page.mouse.click(centre.x, centre.y)
const ringAfterClick = await page.evaluate(() =>
  document.querySelector('[role="slider"]').matches(':focus-visible'),
)
check('no focus ring after a pointer interaction', ringAfterClick === false)
await page.keyboard.press('Tab')
await page.keyboard.press('Shift+Tab')

// --- 8. the toggle switches instantly ---------------------------------------
await page.evaluate(() => window.__slider.setMode('mono'))
await page.waitForTimeout(100)
const monoFilter = await page.evaluate(() => getComputedStyle(document.querySelector('canvas')).filter)
await page.getByRole('radio', { name: 'Color' }).click()
await page.waitForTimeout(20)
const colorFilter = await page.evaluate(() => getComputedStyle(document.querySelector('canvas')).filter)
check(
  'Mono/Color switches within one frame',
  monoFilter.includes('grayscale') && !colorFilter.includes('grayscale'),
  `${monoFilter} -> ${colorFilter} after 20ms`,
)

await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} behavioural checks passed`)
if (failed.length) process.exit(1)
