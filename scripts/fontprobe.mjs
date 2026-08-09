import { chromium } from 'playwright'

const CANDIDATES = [
  ['SF Pro Text', '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif'],
  ['SF Pro Display', '"SF Pro Display", sans-serif'],
  ['Helvetica Neue', '"Helvetica Neue", sans-serif'],
  ['Helvetica', 'Helvetica, sans-serif'],
  ['Arial', 'Arial, sans-serif'],
  ['system-ui', 'system-ui, sans-serif'],
  ['Geist', 'Geist, sans-serif'],
  ['Inter', 'Inter, sans-serif'],
  ['Roboto', 'Roboto, sans-serif'],
  ['Avenir Next', '"Avenir Next", sans-serif'],
]

// Reference ink measurements, CSS px at DPR 2 (see REFERENCE.md).
const TARGETS = [
  { text: 'Mono', size: 12, width: 29.0, height: 9.0, note: 'toggle active label (cap height)' },
  { text: 'Color', size: 12, width: 30.5, height: 9.5, note: 'toggle idle label (ascender)' },
  { text: 'Age: 5', size: 15, width: 42.0, height: 13.0, note: 'age pill (cap+descender)' },
  { text: 'Age: 33', size: 15, width: 51.0, height: 13.0, note: 'age pill, two digits' },
]

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2 })
await page.setContent(`<!doctype html><html><head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Inter:wght@300..700&family=Roboto:wght@300;400;500&display=block" rel="stylesheet">
</head><body><canvas id="c"></canvas></body></html>`)
try {
  await page.waitForFunction(() => document.fonts.status === 'loaded', { timeout: 15000 })
} catch {
  console.warn('! webfonts may not have loaded (offline?) — local families are still valid')
}

const rows = await page.evaluate(
  ([candidates, targets]) => {
    const ctx = document.getElementById('c').getContext('2d')
    const out = []
    for (const [name, stack] of candidates) {
      // does the family actually resolve, or is it silently falling back?
      const probe = (family) => {
        ctx.font = `12px ${family}`
        return ctx.measureText('MonoColorAge: 5').width
      }
      const available = probe(stack) !== probe('monospace') || /monospace/.test(stack)
      const cells = []
      for (const t of targets) {
        ctx.font = `400 ${t.size}px ${stack}`
        const m = ctx.measureText(t.text)
        const w = m.actualBoundingBoxRight + m.actualBoundingBoxLeft
        const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
        cells.push({ text: t.text, w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100 })
      }
      out.push({ name, stack, available, cells })
    }
    return out
  },
  [CANDIDATES, TARGETS],
)

const detected = await page.evaluate(() => Array.from(document.fonts).map((f) => f.family))
console.log('loaded webfonts:', [...new Set(detected)].join(', ') || '(none)')
console.log()
const pad = (s, n) => String(s).padEnd(n)
console.log(pad('font', 18) + TARGETS.map((t) => pad(`${t.text} w/h`, 22)).join(''))
console.log(pad('TARGET', 18) + TARGETS.map((t) => pad(`${t.width} / ${t.height}`, 22)).join(''))
console.log('-'.repeat(18 + 22 * TARGETS.length))

const scored = rows.map((r) => {
  let err = 0
  r.cells.forEach((c, i) => {
    err += Math.abs(c.w - TARGETS[i].width) + Math.abs(c.h - TARGETS[i].height) * 2
  })
  return { ...r, err }
})
scored.sort((a, b) => a.err - b.err)
for (const r of scored) {
  console.log(
    pad(r.name, 18) +
      r.cells.map((c, i) => pad(`${c.w} / ${c.h}${Math.abs(c.w - TARGETS[i].width) < 0.6 ? ' *' : ''}`, 22)).join('') +
      `  err=${r.err.toFixed(2)}`,
  )
}
await browser.close()
