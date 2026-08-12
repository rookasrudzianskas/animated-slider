#!/usr/bin/env node
/**
 * Edge cases the reference cannot show but a real user will hit.
 *
 *   npm run dev && node scripts/edgecases.mjs
 */
import { chromium } from 'playwright'

const URL_BASE = process.env.SLIDER_URL ?? 'http://localhost:3000'
const results = []
const check = (name, pass, detail) => {
  results.push({ name, pass })
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
// deviceScaleFactor 1 on purpose: Playwright divides `mouse.wheel` deltas by the
// scale factor, so at DPR 2 a requested 238px arrives as 119 and every wheel
// expectation below would be silently halved. Geometry is checked elsewhere.
const page = await browser.newPage({ viewport: { width: 1090, height: 1080 }, deviceScaleFactor: 1 })
await page.goto(URL_BASE, { waitUntil: 'networkidle' })
await page.waitForFunction(() => Boolean(window.__slider))

const ruler = page.locator('[role="slider"]')
const rbox = await ruler.boundingBox()
const centre = { x: rbox.x + rbox.width / 2, y: rbox.y + rbox.height / 2 }

const idx = () => page.evaluate(() => window.__slider.getIndex())
const settle = (ms = 900) => page.waitForTimeout(ms)

// --- wheel is scoped to the ruler -------------------------------------------
await page.evaluate(() => window.__slider.setIndex(30))
await settle(300)
await page.mouse.move(545, 400) // over the artwork
await page.mouse.wheel(0, 300)
await settle(400)
check('wheel over the artwork does not move the ruler', Math.abs((await idx()) - 30) < 0.01)

await page.mouse.move(120, 900) // empty page
await page.mouse.wheel(0, 300)
await settle(400)
check('wheel over empty page does not move the ruler', Math.abs((await idx()) - 30) < 0.01)

await page.mouse.move(centre.x, centre.y)
await page.mouse.wheel(0, 238)
await settle()
check('wheel over the ruler moves it', Math.abs((await idx()) - 40) < 0.05, `index ${(await idx()).toFixed(3)}`)

// --- axes --------------------------------------------------------------------
await page.evaluate(() => window.__slider.setIndex(40))
await settle(300)
await page.mouse.wheel(238, 0)
await settle()
check('horizontal wheel works too', Math.abs((await idx()) - 50) < 0.05, `index ${(await idx()).toFixed(3)}`)

await page.evaluate(() => window.__slider.setIndex(40))
await settle(300)
await page.mouse.wheel(238, 60) // diagonal: the dominant axis wins
await settle()
check('diagonal wheel follows the dominant axis', Math.abs((await idx()) - 50) < 0.05)

// --- fast bursts never leave the range --------------------------------------
let outOfRange = false
for (let i = 0; i < 60; i += 1) {
  await page.mouse.wheel(0, i % 2 ? 900 : -900)
  const v = await idx()
  if (v < -0.001 || v > 90.001) outOfRange = true
}
await settle(1500)
check('60 alternating fast bursts never leave 0..90', !outOfRange)

const ageText = await page.locator('[data-pill]').innerText()
check('label is still a valid age after the burst', /^Age: (\d{1,2})$/.test(ageText), ageText)

// --- ticks never appear beyond the ends -------------------------------------
for (const target of [0, 90]) {
  await page.evaluate((t) => window.__slider.setIndex(t), target)
  await settle(300)
  const sides = await page.evaluate(() => {
    const rects = [...document.querySelectorAll('rect')].filter((r) => r.style.display !== 'none')
    const svg = document.querySelector('svg').getBoundingClientRect()
    const mid = svg.width / 2
    const xs = rects.map((r) => Number(r.getAttribute('x')) + Number(r.getAttribute('width')) / 2)
    return { left: xs.filter((x) => x < mid - 6).length, right: xs.filter((x) => x > mid + 6).length }
  })
  check(
    `no ticks past the ${target === 0 ? 'young' : 'old'} end`,
    target === 0 ? sides.left === 0 : sides.right === 0,
    `left ${sides.left} / right ${sides.right}`,
  )
}

// --- drag edge cases --------------------------------------------------------
await page.evaluate(() => window.__slider.setIndex(45))
await settle(300)
await page.mouse.move(centre.x, centre.y)
await page.mouse.down()
await page.mouse.move(centre.x + 4000, centre.y, { steps: 12 }) // drag far past the young end
await page.mouse.up()
await settle()
check('dragging far past the young end clamps', Math.abs(await idx()) < 0.01, `index ${(await idx()).toFixed(4)}`)

// releasing outside the window must not leave the drag stuck on
await page.evaluate(() => window.__slider.setIndex(45))
await settle(300)
await page.mouse.move(centre.x, centre.y)
await page.mouse.down()
await page.mouse.move(centre.x - 60, centre.y, { steps: 5 })
await page.mouse.move(-50, -50) // leaves the viewport
await page.mouse.up()
await settle(300)
const before = await idx()
await page.mouse.move(centre.x + 200, centre.y) // moving with no button down
await settle(300)
check('a released drag does not keep tracking the pointer', Math.abs((await idx()) - before) < 0.01)

// --- selection and image drag ------------------------------------------------
const selectable = await page.evaluate(() => {
  const r = document.querySelector('[role="slider"]')
  const sel = getComputedStyle(r).userSelect
  const canvas = document.querySelector('canvas')
  return { ruler: sel, canvasDraggable: canvas.draggable, pillSelect: getComputedStyle(document.querySelector('[data-pill]')).userSelect }
})
check('the ruler is not text-selectable', selectable.ruler === 'none', selectable.ruler)
check('the artwork is not drag-and-droppable', selectable.canvasDraggable === false)

// --- double-click and right-click --------------------------------------------
await page.evaluate(() => window.__slider.setIndex(30))
await settle(300)
await page.mouse.dblclick(centre.x, centre.y)
await settle(400)
check('double-clicking the ruler does nothing', Math.abs((await idx()) - 30) < 0.01)
await page.mouse.click(centre.x, centre.y, { button: 'right' })
await settle(300)
check('right-clicking the ruler does nothing', Math.abs((await idx()) - 30) < 0.01)

// --- the toggle must not disturb the ruler -----------------------------------
await page.evaluate(() => window.__slider.setIndex(37.31))
await settle(400)
const beforeToggle = await idx()
await page.getByRole('radio', { name: 'Color' }).click()
await page.getByRole('radio', { name: 'Mono' }).click()
await settle(300)
check('toggling colour mode leaves the ruler exactly where it was', Math.abs((await idx()) - beforeToggle) < 1e-9)

// --- keyboard auto-repeat -----------------------------------------------------
await page.evaluate(() => window.__slider.setIndex(40))
await ruler.focus()
for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowRight')
await settle(1200)
check('12 ArrowRight presses land exactly 12 years on', Math.abs((await idx()) - 52) < 0.01, `index ${(await idx()).toFixed(3)}`)

// --- the artwork never blanks mid-scrub ---------------------------------------
await page.evaluate(() => window.__slider.setIndex(5))
await settle(400)
const blanks = await page.evaluate(async () => {
  const canvas = document.querySelector('canvas')
  const ctx = canvas.getContext('2d')
  let blank = 0
  for (let i = 0; i < 45; i += 1) {
    window.__slider.setIndex(5 + i * 1.7)
    await new Promise((r) => requestAnimationFrame(r))
    const d = ctx.getImageData(canvas.width / 2 - 40, canvas.height / 2 - 40, 80, 80).data
    let opaque = 0
    for (let p = 3; p < d.length; p += 4) if (d[p] > 200) opaque += 1
    if (opaque < 80 * 80 * 0.5) blank += 1
  }
  return blank
})
check('the artwork never blanks during a fast scrub', blanks === 0, `${blanks} blank frames of 45`)

await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} edge-case checks passed`)
if (failed.length) process.exit(1)
