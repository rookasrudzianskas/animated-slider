/**
 * Pure geometry + value maths for the age ruler.
 *
 * Every constant here was measured from the reference recording — see
 * REFERENCE.md. Keep this module free of React and of the DOM so it can be
 * unit-tested and reasoned about on its own.
 */

/** First age on the ruler. */
export const MIN_AGE = 5
/** Last age on the ruler. */
export const MAX_AGE = 95
/** Number of ticks, one per year. */
export const TICK_COUNT = MAX_AGE - MIN_AGE + 1
/** Highest valid tick index. */
export const MAX_INDEX = TICK_COUNT - 1

/** Distance between adjacent tick centres, at the reference viewport. */
export const TICK_PITCH = 23.8
/** Tick width — the same for idle ticks and the active one. */
export const TICK_WIDTH = 4
/** Tick height at the exact centre of the ruler. */
export const TICK_MAX_HEIGHT = 90
/** Tick height once a tick is `ENVELOPE_RANGE` or further from the centre. */
export const TICK_MIN_HEIGHT = 12.5
/**
 * Distance from the centre at which a tick reaches `TICK_MIN_HEIGHT`.
 * At the reference viewport this is 262px against a 273px half-window, i.e.
 * 0.96 of the half-window — see `envelopeRangeFor`.
 */
export const ENVELOPE_RANGE = 262
/** Exponent of the height falloff. */
export const ENVELOPE_EXPONENT = 1.55
/** Half the width of the visible tick window at the reference viewport. */
export const HALF_WINDOW = 273

/** Time constant of the exponential follower, in seconds. */
export const FOLLOW_TAU = 0.0792

/**
 * Tick height as a function of the tick's distance from the ruler centre.
 *
 * Fitted over 13 288 tick samples from the recording, RMS error 0.29px.
 */
export function tickHeight(distance: number, range = ENVELOPE_RANGE): number {
  const u = Math.min(Math.abs(distance) / range, 1)
  return (
    TICK_MIN_HEIGHT +
    (TICK_MAX_HEIGHT - TICK_MIN_HEIGHT) * Math.pow(1 - u, ENVELOPE_EXPONENT)
  )
}

/**
 * The envelope range is tied to the visible half-window rather than being an
 * absolute constant, so a narrower ruler keeps the same silhouette.
 */
export function envelopeRangeFor(halfWindow: number): number {
  return halfWindow * (ENVELOPE_RANGE / HALF_WINDOW)
}

/** Continuous tick index for a scroll offset. */
export function indexForOffset(offset: number, pitch = TICK_PITCH): number {
  return offset / pitch
}

/** Scroll offset that puts `index` exactly at the centre. */
export function offsetForIndex(index: number, pitch = TICK_PITCH): number {
  return index * pitch
}

/** The age the label shows for a continuous index. */
export function ageForIndex(index: number): number {
  return clampIndex(Math.round(index)) + MIN_AGE
}

export function clampIndex(index: number): number {
  return Math.min(Math.max(index, 0), MAX_INDEX)
}

/**
 * Which two face images the artwork is blending, and how far between them.
 * The label rounds; the artwork does not — see REFERENCE.md §5.
 */
export function faceBlend(index: number): { lo: number; hi: number; t: number } {
  const clamped = clampIndex(index)
  const lo = Math.floor(clamped)
  const t = clamped - lo
  return { lo, hi: Math.min(lo + 1, MAX_INDEX), t }
}

/** Inclusive range of tick indices that can be visible for a given offset. */
export function visibleRange(
  offset: number,
  halfWindow: number,
  pitch = TICK_PITCH,
): { first: number; last: number } {
  const centreIndex = offset / pitch
  const span = Math.ceil(halfWindow / pitch) + 1
  return {
    first: Math.max(0, Math.floor(centreIndex - span)),
    last: Math.min(MAX_INDEX, Math.ceil(centreIndex + span)),
  }
}

/**
 * Frame-rate-independent exponential follow. Returns the new position.
 *
 * `dt` in seconds. With tau = 79.2ms this reproduces the measured 0.6564
 * velocity ratio per 1/30s frame.
 */
export function follow(current: number, target: number, dt: number, tau = FOLLOW_TAU): number {
  if (tau <= 0) return target
  const alpha = 1 - Math.exp(-dt / tau)
  return current + (target - current) * alpha
}
