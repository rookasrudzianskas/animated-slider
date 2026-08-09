/**
 * How the piece adapts away from the reference viewport.
 *
 * The reference only exists at 1090 x 1080, so the rule is: at that size every
 * value below reduces to the measured one exactly, and elsewhere the instrument
 * keeps its identity. There are no media queries — every quantity is a clamp
 * over the viewport, so there is no width at which the ruler jumps.
 */
import { COLUMN_HEIGHT, FACE, FACE_TO_PILL, PILL, PILL_TO_RULER, TOGGLE } from './layout'
import {
  CLIP_WIDTH,
  LATTICE_OFFSET,
  TICK_MAX_HEIGHT,
  TICK_MIN_HEIGHT,
  TICK_PITCH,
  TICK_WIDTH,
} from './ruler'

/** Minimum breathing room either side of the ruler. */
const SIDE_MARGIN = 24
/** The pitch below which ticks stop reading as a ruler. */
const MIN_PITCH = 10
const MIN_VERTICAL_GAP = 24
const MIN_TICK_HEIGHT = 56
const MIN_FACE_HEIGHT = 160

/** Height the toggle occupies at the top, including its inset. */
const TOGGLE_BAND = 15.5 + TOGGLE.height

/**
 * Share of the spare vertical space that sits above the column. Derived, not
 * chosen: at the reference the face top measures 235, which is 186 below the
 * toggle band out of 481.1 spare.
 */
const TOP_SHARE = 186 / (1080 - TOGGLE_BAND - COLUMN_HEIGHT)

export interface ResponsiveLayout {
  pitch: number
  latticeOffset: number
  tickMaxHeight: number
  tickMinHeight: number
  faceWidth: number
  faceHeight: number
  /** Distance from the top of the viewport to the top of the artwork. */
  columnTop: number
}

/**
 * The ruler keeps its 23 ticks and shrinks the pitch, rather than keeping the
 * pitch and showing fewer ticks.
 *
 * The silhouette *is* the control: the envelope range is exactly 11 pitches and
 * the window exactly `23P - w`, so tick heights depend only on `d / P`. Shrink
 * the pitch and the hill keeps its shape, just smaller. Keep the pitch and drop
 * ticks and the hill gets truncated into a different object.
 */
export function layoutFor(width: number, height: number): ResponsiveLayout {
  const usableWidth = Math.max(width - 2 * SIDE_MARGIN, MIN_PITCH * 23 - TICK_WIDTH)
  const pitch = Math.max(MIN_PITCH, Math.min(TICK_PITCH, (usableWidth + TICK_WIDTH) / 23))
  const scale = pitch / TICK_PITCH

  // The ruler only gives up height on genuinely short viewports.
  const tickMaxHeight = Math.max(MIN_TICK_HEIGHT, Math.min(TICK_MAX_HEIGHT, height * 0.18))

  // The artwork is the readout, not the instrument, so it is what flexes.
  const chrome = FACE_TO_PILL + PILL.height + PILL_TO_RULER + tickMaxHeight
  const roomForFace = height - TOGGLE_BAND - chrome - 2 * MIN_VERTICAL_GAP
  const byHeight = Math.max(MIN_FACE_HEIGHT, Math.min(FACE.height, roomForFace))
  const byWidth = ((width - 2 * SIDE_MARGIN) * FACE.height) / FACE.width
  const faceHeight = Math.min(byHeight, Math.max(MIN_FACE_HEIGHT, byWidth))
  const faceWidth = (faceHeight * FACE.width) / FACE.height

  const columnHeight = faceHeight + chrome
  const spare = Math.max(0, height - TOGGLE_BAND - columnHeight)
  const topGap = Math.max(MIN_VERTICAL_GAP, spare * TOP_SHARE)

  return {
    pitch,
    latticeOffset: LATTICE_OFFSET * scale,
    tickMaxHeight,
    tickMinHeight: TICK_MIN_HEIGHT * (tickMaxHeight / TICK_MAX_HEIGHT),
    faceWidth,
    faceHeight,
    columnTop: TOGGLE_BAND + topGap,
  }
}

/** The clip window a pitch implies — always 23 ticks wide. */
export function clipWidth(pitch: number): number {
  return Math.min(CLIP_WIDTH, 23 * pitch - TICK_WIDTH)
}
