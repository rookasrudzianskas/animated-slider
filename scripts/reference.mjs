/**
 * Shared access to the reference data produced by scripts/prepare-reference.py.
 *
 * It lives in `.reference/` inside the repo rather than a session temp
 * directory — the temp directory disappears between runs and takes the ability
 * to verify anything with it.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const REFERENCE_DIR = path.join(process.cwd(), '.reference')

export function requireReference() {
  const needed = ['frames.json', 'toggle.json', 'cursor2.json', 'index.json', 'frames', 'png']
  const missing = needed.filter((f) => !existsSync(path.join(REFERENCE_DIR, f)))
  if (missing.length) {
    console.error(
      `Reference data missing (${missing.join(', ')}).\n` +
        `Build it once with:\n\n    python3 scripts/prepare-reference.py [path/to/video.mp4]\n`,
    )
    process.exit(2)
  }
}

const read = (name) => JSON.parse(readFileSync(path.join(REFERENCE_DIR, name), 'utf8'))

export const framePath = (n) => path.join(REFERENCE_DIR, 'frames', `f_${String(n).padStart(4, '0')}.jpg`)
export const losslessPath = (name) => path.join(REFERENCE_DIR, 'png', `${name}.png`)

let cache
export function referenceData() {
  cache ??= {
    frames: read('frames.json'),
    toggle: read('toggle.json'),
    cursors: read('cursor2.json'),
    index: read('index.json'),
  }
  return cache
}

/** Ruler index + colour mode of a reference frame, or null if it is not trusted. */
export function stateOf(frame) {
  const { index, toggle } = referenceData()
  const i = index[String(frame)]
  if (i === undefined) return null
  return { index: i, mode: toggle[String(frame)] ?? 'mono' }
}

/** Pointer bbox in a reference frame, for masking it out of a diff. */
export function cursorOf(frame) {
  return referenceData().cursors[String(frame)] ?? null
}

/**
 * Frames where the index is trusted and the ruler is close enough to at rest
 * that a still comparison is meaningful.
 */
export function restingFrames(maxVelocity = 0.05) {
  const { index, toggle } = referenceData()
  const out = []
  for (const key of Object.keys(index)) {
    const n = Number(key)
    const prev = index[String(n - 1)]
    const next = index[String(n + 1)]
    if (prev === undefined || next === undefined) continue
    if (Math.abs(next - prev) / 2 > maxVelocity) continue
    out.push({ frame: n, index: index[key], mode: toggle[key] ?? 'mono' })
  }
  return out
}
