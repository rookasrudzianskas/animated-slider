/**
 * Measured layout constants, in CSS px at the reference viewport (1090 x 1080).
 * See REFERENCE.md §1.
 */

export const REFERENCE_VIEWPORT = { width: 1090, height: 1080 } as const

/** Page background. Measured 253,253,253 — it is deliberately off-white. */
export const PAGE_BG = '#fdfdfd'

/**
 * The reference's three stacked elements are not on a single axis: measured in
 * a 1090-wide viewport the ruler centres on 545.37, the artwork on 545.00 and
 * the age capsule on 543.75 — consistently, in every frame and at both capsule
 * widths. The artwork sets the shared centre; the other two carry their offset.
 */
export const RULER_OFFSET_X = 0.84

/** Face artwork box. */
export const FACE = { width: 310, height: 410, top: 235 } as const

/** Gap between the bottom of the face box and the top of the age pill. */
export const FACE_TO_PILL = 2
/** Gap between the bottom of the age pill and the top of the ruler box. */
export const PILL_TO_RULER = 17.9

/**
 * Age pill. Measured: 30 tall, 71.5 wide for "Age: 5" with 42.0px of text ink,
 * so 14.75 of padding a side.
 */
export const PILL = {
  height: 30,
  paddingInline: 14.25,
  fontSize: 15,
  /**
   * The capsule is centred 1.62px left of the ruler's centre in the reference —
   * consistently, across every frame and both text widths. Reproduced rather
   * than tidied away.
   */
  offsetX: -1.12,
} as const

/**
 * Toggle offsets from the top-right corner. The reference's border ink starts
 * at y 15.5 and ends at x 1074.5; these are the insets that land on those exact
 * device rows/columns at DPR 2.
 */
export const TOGGLE_INSET = { top: 15.5, right: 15.5 } as const

/**
 * Segmented Mono/Color control. Measured at the reference viewport:
 * outer 117.5 x 33.5; the two segments 53.0 and 52.5 wide, 25 tall; "Mono" ink
 * 29.0 wide with a cap height of 8.5.
 *
 * The outer box is sized explicitly and the segments share it equally
 * (52.75 each) rather than being sized by their text. Two reasons: the measured
 * 53.0/52.5 split is equal-within-noise, and it makes the control's width
 * independent of how wide a particular font happens to set "Mono" — which is
 * the one place where the recreation cannot match the reference exactly.
 */
export const TOGGLE = {
  width: 117.5,
  height: 33.5,
  borderWidth: 1.3,
  border: '#e4e4e4',
  padding: 3.25,
  gap: 3.5,
  segmentHeight: 25,
  fontSize: 12,
  idleLabel: '#949494',
} as const

/**
 * Total height of the centred column: face + pill + ruler and their gaps.
 * 410 + 2 + 31 + 17.9 + 90 = 550.9
 */
export const COLUMN_HEIGHT = FACE.height + FACE_TO_PILL + PILL.height + PILL_TO_RULER + 90

/**
 * The column is NOT on the vertical centre of the reference viewport: it sits
 * 29.5px above it (measured top 235 against a centred 264.55). Reproduced as an
 * explicit lift rather than pretending the reference used `justify-center`.
 */
export const COLUMN_LIFT =
  (REFERENCE_VIEWPORT.height - COLUMN_HEIGHT) / 2 - FACE.top
