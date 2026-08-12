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

// --- taking hold must not teleport the strip --------------------------------
// Pressing the button mid-flight used to snap the ruler to the wheel's pending
// target: up to a screenful of travel in one frame, for a gesture that moved
// nothing.
await page.evaluate(() => window.__slider.setIndex(30))
await settle(300)
const teleport = await page.evaluate(async () => {
  const el = document.querySelector('[role="slider"]')
  el.dispatchEvent(new WheelEvent('wheel', { deltaY: 238, bubbles: true, cancelable: true }))
  await new Promise((r) => setTimeout(r, 60))
  const before = window.__slider.getIndex()
  el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 500, button: 0, bubbles: true }))
  await new Promise((r) => requestAnimationFrame(r))
  const after = window.__slider.getIndex()
  el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 500, bubbles: true }))
  return { before, after }
})
check(
  'pressing the button mid-flight does not teleport the strip',
  Math.abs(teleport.after - teleport.before) < 0.2,
  `index ${teleport.before.toFixed(3)} -> ${teleport.after.toFixed(3)} in one frame`,
)

// --- a second finger must not kill the first --------------------------------
await page.evaluate(() => window.__slider.setIndex(45))
await settle(300)
const twoFinger = await page.evaluate(async () => {
  const el = document.querySelector('[role="slider"]')
  const send = (type, id, x) =>
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, pointerType: 'touch', bubbles: true, isPrimary: id === 1 }))
  el.setPointerCapture = () => {}
  el.releasePointerCapture = () => {}
  el.hasPointerCapture = () => false
  send('pointerdown', 1, 500)
  send('pointermove', 1, 470)
  const afterFirst = window.__slider.getIndex()
  send('pointerdown', 2, 300) // a second finger lands
  send('pointermove', 1, 440) // the first keeps moving
  const afterSecond = window.__slider.getIndex()
  send('pointerup', 2, 300)
  send('pointerup', 1, 440)
  return { afterFirst, afterSecond }
})
check(
  'a second finger does not kill the first finger\'s drag',
  twoFinger.afterSecond - twoFinger.afterFirst > 1,
  `index ${twoFinger.afterFirst.toFixed(3)} -> ${twoFinger.afterSecond.toFixed(3)}`,
)

// --- ctrl+wheel belongs to the browser --------------------------------------
await page.evaluate(() => window.__slider.setIndex(40))
await settle(300)
const zoom = await page.evaluate(() => {
  const el = document.querySelector('[role="slider"]')
  const e = new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true })
  el.dispatchEvent(e)
  return { prevented: e.defaultPrevented, index: window.__slider.getIndex() }
})
await settle(400)
check('ctrl+wheel (pinch zoom) is left to the browser', !zoom.prevented, `defaultPrevented=${zoom.prevented}`)
check('ctrl+wheel does not scrub the age', Math.abs((await idx()) - 40) < 0.01)

// --- line-mode wheels ---------------------------------------------------------
await page.evaluate(() => window.__slider.setIndex(40))
await settle(300)
await page.evaluate(() => {
  const el = document.querySelector('[role="slider"]')
  for (let i = 0; i < 3; i += 1)
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, bubbles: true, cancelable: true }))
})
await settle()
const lineMode = await idx()
check(
  'a line-mode wheel moves a sensible distance',
  lineMode - 40 > 3,
  `3 notches of 3 lines moved ${(lineMode - 40).toFixed(2)} years`,
)

// --- the toggle follows the radiogroup pattern -------------------------------
const toggleKeys = await page.evaluate(() => {
  const radios = [...document.querySelectorAll('[role="radio"]')]
  return { tabIndexes: radios.map((r) => r.tabIndex) }
})
check(
  'the toggle is a single tab stop (roving tabindex)',
  toggleKeys.tabIndexes.filter((t) => t === 0).length === 1,
  `tabIndex ${JSON.stringify(toggleKeys.tabIndexes)}`,
)
await page.getByRole('radio', { name: 'Mono' }).focus()
await page.keyboard.press('ArrowRight')
await settle(200)
check(
  'ArrowRight moves the toggle to Color',
  (await page.getByRole('radio', { name: 'Color' }).getAttribute('aria-checked')) === 'true',
)
await page.keyboard.press('ArrowLeft')
await settle(200)
check(
  'ArrowLeft moves it back to Mono',
  (await page.getByRole('radio', { name: 'Mono' }).getAttribute('aria-checked')) === 'true',
)

// --- the vertical stack lands where the reference's does --------------------
// Sub-pixel measurements of the reference's flat edges, median over 75-93
// columns and agreeing to 0.003 across three frames. Compared against DOM box
// values, which sit ~0.22 above a 50%-crossing of the painted antialiased edge
// — hence the 0.3 tolerance. The painted comparison is compare.mjs --lossless.
const REF_STACK = { capsuleTop: 646.945, capsuleHeight: 30.445, rulerTop: 695.905, rulerBottom: 785.922 }
const stack = await page.evaluate(() => {
  const pill = document.querySelector('[data-pill]').getBoundingClientRect()
  const ruler = document.querySelector('[role="slider"]').getBoundingClientRect()
  return { capsuleTop: pill.top, capsuleHeight: pill.height, rulerTop: ruler.top, rulerBottom: ruler.bottom }
})
for (const [key, expected] of Object.entries(REF_STACK)) {
  check(
    `${key} matches the reference`,
    Math.abs(stack[key] - expected) < 0.3,
    `${stack[key].toFixed(3)} vs ${expected} (Δ ${(stack[key] - expected).toFixed(3)})`,
  )
}

// --- no backwards lurch at the start of a gesture ---------------------------
// `last` is stamped mid-frame in the input handler while the rAF timestamp is
// the frame's start, so the first tick could see a negative dt — which inverts
// the follower and throws the strip away from the target, past the clamp.
const lurches = []
for (const delta of [300, 600, 1200, 2200]) {
  const r = await page.evaluate(async (d) => {
    window.__slider.setIndex(0)
    await new Promise((res) => setTimeout(res, 250))
    const seen = []
    let stop = false
    const t = () => {
      seen.push(window.__slider.getIndex())
      if (!stop) requestAnimationFrame(t)
    }
    requestAnimationFrame(t)
    document
      .querySelector('[role="slider"]')
      .dispatchEvent(new WheelEvent('wheel', { deltaY: d, bubbles: true, cancelable: true }))
    await new Promise((res) => setTimeout(res, 900))
    stop = true
    return { min: Math.min(...seen), max: Math.max(...seen) }
  }, delta)
  lurches.push({ delta, ...r })
}
check(
  'no gesture drives the index below 0',
  lurches.every((l) => l.min >= -0.001),
  lurches.map((l) => `${l.delta}px:${l.min.toFixed(4)}`).join(' '),
)
check(
  'no gesture drives the index above 90',
  lurches.every((l) => l.max <= 90.001),
  lurches.map((l) => `${l.delta}px:${l.max.toFixed(3)}`).join(' '),
)

// --- the capsule and the ruler change on the same frame ---------------------
const sync = await page.evaluate(async () => {
  window.__slider.setIndex(5)
  await new Promise((r) => setTimeout(r, 250))
  const rows = []
  let stop = false
  const t = () => {
    rows.push([window.__slider.getIndex(), document.querySelector('[data-pill]').textContent])
    if (!stop) requestAnimationFrame(t)
  }
  await new Promise((r) => setTimeout(r, 60))
  document
    .querySelector('[role="slider"]')
    .dispatchEvent(new WheelEvent('wheel', { deltaY: 700, bubbles: true, cancelable: true }))
  requestAnimationFrame(t)
  await new Promise((r) => setTimeout(r, 700))
  stop = true
  const bad = rows.filter(
    ([i, txt]) => `Age: ${Math.min(Math.max(Math.round(i), 0), 90) + 5}` !== txt,
  )
  return { frames: rows.length, bad: bad.length }
})
check(
  'the capsule never lags the ruler by a frame',
  sync.bad === 0,
  `${sync.bad} of ${sync.frames} frames disagreed`,
)

// --- the whole instrument fits at WCAG's reflow target -----------------------
const small = await browser.newPage({ viewport: { width: 320, height: 256 }, deviceScaleFactor: 1 })
await small.goto(URL_BASE, { waitUntil: 'networkidle' })
await small.waitForFunction(() => Boolean(window.__slider))
const fits = await small.evaluate(() => {
  const r = document.querySelector('[role="slider"]').getBoundingClientRect()
  const t = document.querySelector('[role="radiogroup"]').getBoundingClientRect()
  return {
    rulerBottom: Math.round(r.bottom),
    rulerTop: Math.round(r.top),
    toggleBottom: Math.round(t.bottom),
    viewport: window.innerHeight,
    hOverflow: document.documentElement.scrollWidth > window.innerWidth,
  }
})
await small.close()
check(
  'the ruler is fully on screen at 320x256 (WCAG reflow)',
  fits.rulerBottom <= fits.viewport && fits.rulerTop >= 0,
  `ruler ${fits.rulerTop}..${fits.rulerBottom} in ${fits.viewport}px`,
)
check('no horizontal overflow at 320x256', !fits.hOverflow)

await browser.close()
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} edge-case checks passed`)
if (failed.length) process.exit(1)
