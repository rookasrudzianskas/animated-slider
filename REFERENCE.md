# Reference spec — Age Progression slider

Everything below was measured frame-by-frame from the source recording
(`Adi_-_I_made_an_Age_Progression_slider...mp4`, 2180×2160, 30 fps, 892 frames).

The recording is a **DPR-2 capture of a 1090 × 1080 CSS viewport**, so
`CSS px = device px / 2`. All numbers below are **CSS px at that viewport**.
Measurement uncertainty is ≈ ±0.25 px unless stated.

Reference frames live in the scratchpad:
`/private/tmp/claude-501/-Users-rokasrudzianskas-Documents-slider/5e786c9c-4db0-4d85-accf-4c8db887cebf/scratchpad/`
- `frames_all/f_0001.jpg … f_0892.jpg` — every frame, 1090 px wide (= 1 CSS px per px)
- `png/rest_01.png` — lossless full-res frame 10 (initial resting state)
- `strip/s_NNNN.png` — full-res crop of the pill+ruler band (y 1270…1620 device)
- `frames.json` — per-frame extracted tick/indicator geometry
- `faces_manifest.json` — provenance of every generated face asset

---

## 1. Canvas

| property | value |
|---|---|
| page background | `#FDFDFD` (measured 253,253,253 uniformly; white text measures 255 and black measures 0, so the range is not clipped — the off-white is real) |
| layout | single centred column, horizontal centre at x = 545.4 in a 1090-wide viewport (i.e. exactly centred) |
| no scrollbars, no other chrome | |

Vertical anchors (CSS px from the top of a 1080-tall viewport):

| element | top | bottom | height |
|---|---|---|---|
| Mono/Color toggle | 15.5 | 48.5 | 33.5 |
| face artwork (ink bbox varies by age) | ≈266 | ≈610 | — |
| “Age: N” pill | 647.0 | 677.5 | 31.0 |
| ruler ticks (baseline is flat) | 696.0 (tallest tick top) | 785.9 (shared baseline) | 90 max |

---

## 2. Mono / Color toggle (top-right)

```
outer pill   117.5 × 33.5, border-radius 9999px
             1.30px border #E4E4E4, transparent/page-coloured fill
             offset: top 15.5, right 15.5   (≈16 / 16)
padding      ≈3–4 px around the inner segment
active seg   53.0 × 25.1 (for “Mono”), border-radius 9999px, fill #000000
active text  #FFFFFF
idle  text   #949494
cursor       pointer  (hand cursor visible in the recording)
```

**Switch is instantaneous.** Frame 426 → 427 and 824 → 825 flip the active pill,
both label colours and the face’s grayscale in a single 33 ms video frame — there
is no slide, no crossfade, no intermediate state anywhere in the recording.

`Mono` applies a **full** `grayscale(1)` to the face (measured chroma spread 0.0).
`Color` shows the source image (chroma spread ≈38).

---

## 3. “Age: N” pill

```
height        31.0
width         hugs content (72.2 for “Age: 5”, 80.0 for “Age: 33”)
border-radius 9999px  (corner sweep measured 14 px ≈ height/2)
fill          #000000
text          #FFFFFF, "Age: {value}"
centre        x = 545.4  (page centre), top = 647.0
```

---

## 4. The ruler — geometry

The ruler is a **scrolling tick strip behind a fixed centre**. It is *not* a
track-with-a-thumb.

```
tick pitch        23.80 px          (fit over 22 gaps: (1626.44−579.24)/22 /2)
tick width        4 px              (ink-sum/peak = 3.72; indicator measures 3.98)
tick fill         #ECECEC           (measured luminance 236–238 on a 253 page)
active tick fill  #000000
baseline          y = 785.9  — every tick is BOTTOM-ALIGNED to this line
clip window       543.4 px = `23P - w`, i.e. exactly 23 ticks. Measured from
                  where ticks appear and disappear across all 892 frames: the
                  leftmost inked column pins at device x 544 (93 frames) and the
                  rightmost at 1631 (173 frames), never beyond. Wide enough that
                  a tick at half phase is fully excluded, so the visible count
                  alternates 23 <-> 22 and never reaches 24.
range             ages 5 … 95  → 91 ticks
```

### Tick height envelope

Height depends on the tick’s **continuous distance from the container centre**,
not on its index. Fitted over 13 288 tick samples (RMS error **0.29 px**):

```
d = |tickCentreX − containerCentreX|            // CSS px
h = 12.5 + 77.5 * (1 − min(d / 262, 1)) ** 1.55
```

so `h(0) = 90`, `h(262+) = 12.5`. Spot values (d → h):
`24→79.5, 48→70.0, 96→50.5, 144→36.3, 192→23.9, 240→14.9, 262→12.5`.

The **active tick uses the same formula** — it is only recoloured, never resized.
Measured active-tick height at d≈0 is 90.01 px, exactly `h(0)`.

There is **no opacity gradient and no edge mask**: every tick, including the
outermost, measures the same luminance. The “fade” at the edges is purely the
height falloff. Ticks are simply clipped by the container.

### Which tick is active

The active (black) tick is the one nearest the centre, so its on-screen x drifts
within **±11.9 px** (half a pitch) of the centre as the strip scrolls. Measured
indicator x spans 1066.998 … 1114.636 device = a 47.64 px range = exactly one pitch.

---

## 5. The ruler — behaviour

### Value

```
index  = scrollOffset / 23.80          // continuous, NOT snapped
age    = clamp(round(index), 0, 90) + 5
```

**There is no snapping.** The strip comes to rest at arbitrary fractional
positions — measured resting states include index `0.010`, `0.335`, `18.747`
and `42.108`, held for 30–80 frames each. The label rounds; the strip does not move.

`index` is clamped so the value stays in range (the recording never shows a tick
position outside ages 5…95, and the initial state rests at index 0.000).

### Input — it is a WHEEL scroll, not a drag

This is the single most important behavioural fact and it is easy to get wrong.

The mouse cursor was tracked in all 892 frames. **In the 484 frames where the
ruler moved by more than 3 px, the cursor moved by more than 2 px in only 18
(3.7 %) — and all 18 are frames where the cursor was travelling to or from the
toggle.** The pointer simply parks over the ruler at ≈ (545, 750) and stays there
while hundreds of pixels of ruler travel happen.

So every value change in the recording is a **trackpad / wheel scroll over the
ruler**, with `preventDefault` (the page never scrolls). There is no drag, no
click-to-seek, and no keyboard use anywhere in the recording.

```ts
// wheel handler on the ruler
const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
target += d                     // 1:1, sign: scroll down/right → older
```

Pointer-drag, touch and keyboard are **not** demonstrated by the reference but
are logically required for a working control — implement them so they feel like
the same instrument, and never let them alter the wheel behaviour.

### Motion — exponential follower

The strip **lags the input target** through a first-order exponential filter,
during input and after it stops. Measured across 140 decay samples from every
deceleration in the recording:

```
velocity ratio per 1/30 s frame = 0.6564   (median; mean 0.669)
→ time constant  τ = 79.2 ms
→ half-life        = 54.9 ms
→ per-frame alpha  = 1 − exp(−dt / 0.0792)      (0.190 at 60 fps)
```

Implement frame-rate-independently:
```ts
offset += (target - offset) * (1 - Math.exp(-dt / 0.0792))
```

Characteristics confirmed in the data:
- **No overshoot, no oscillation** — a pure exponential, not an underdamped spring.
- **No momentum/flick of its own** — the strip only ever decays toward the target
  the wheel has already accumulated; it never coasts past it.
- The decay is far too fast (τ = 79 ms) to be macOS trackpad inertia, so the
  smoothing is the app’s own, applied to a wheel-accumulated target.

### The face

The face is a **continuous crossfade driven by the fractional index**, not a
discrete swap:

> Two resting states both labelled “Age: 5” (index 0.010 and index 0.335) show
> faces that differ by 0.795 mean-abs-luminance, against a 0.02–0.04 noise floor.
> The crossfade is therefore position-driven, not time-driven, and it does not
> settle to a “pure” image.

```
i  = floor(index);  f = index - i
face = crossfade(faces[i], faces[i+1], f)
```

The label rounds while the face blends — at index 18.747 the label reads
“Age: 24” while the artwork is 75 % of the way from 23 to 24.

### Cursor

The recording shows the **default arrow** over the ruler at all times, including
while it is being scrolled. Only the toggle shows a pointer/hand cursor.
Match this — do not add `cursor: grab`.

---

## 6. Face assets

`public/faces/{5..95}.webp` — 620 × 820 px (renders at 310 × 410 CSS, i.e. 2×),
RGBA cut-outs un-multiplied from the page background.

Provenance (`scratchpad/faces_manifest.json`):
- **77 of 91** are real frames lifted straight from the recording’s Color mode.
- **8** (ages 27, 79–85) are cross-fades of the two nearest real frames — the
  recording never dwells there in Color mode.
- **6** (ages 90–95) repeat the age-89 artwork: **the recording never reaches
  past age ≈ 89**, so there is no reference for them. This is the one place the
  result cannot be 1:1, and it is invisible unless the user drags to the very end.

Draw position, matching the recording:
```
width 310, height 410, centred on x = 545.4, top = 235
```

---

## 7. Things the recording does NOT show

Implement the sane minimum, keep it invisible unless used, and never let it
change anything the recording *does* show:

- keyboard interaction (no focus ring is ever visible in the recording)
- hover states on the ruler
- pointer drag and touch
- click-to-seek on the track
- viewport sizes other than 1090 × 1080

## 8. Verification protocol

The recording is the oracle. To check any change:

1. `npm run dev`, then screenshot at **exactly 1090 × 1080, deviceScaleFactor 2**.
2. Drive the app to the same ruler position as a reference frame (the app exposes
   `window.__slider` for this — see `src/lib/testing.ts`).
3. Diff against `scratchpad/frames_all/f_NNNN.jpg` (1090 px wide = 1 CSS px per px).
4. `scripts/compare.mjs` does 1–3 and prints per-region pixel deltas.

---

## 9. Corrections applied after the first pass

Four numbers in the sections above were revised once the capture's point-spread
(sigma ≈ 0.44 device px, measured on the black tick edge, the grey tick edge and
the toggle's black segment edge — the same for high and low contrast) was
modelled rather than ignored. Reading "the darkest pixel" of a feature thinner
than ~4 device px systematically returns a colour that is too light and a width
that is too wide.

| what | first pass | corrected | why |
|---|---|---|---|
| toggle border | 1px #E5E5E5 | **1.30px #E4E4E4** | the radial ink profile's model-free FWHM is 2.599 device px, and no pixel on the 234×66 ring exceeds 25.9 ink — a 1px border carrying the measured total ink would have to peak at 33.5 |
| toggle idle label | #909090 | **#949494** | the *same glyphs* appear white-on-black and grey-on-page, so `(253−v_idle)/v_active = (253−G)/W` independently of blur; least-squares slope 0.4093/0.4086 for the two labels ⇒ G = 148.6 |
| ruler ticks | #ECECEC | **#EEEEEE** | fitted amplitude 15.0 ± 0.2 below 253 over 2609 cross-sections; the core plateau is 4 device px wide so it does reach the true value |
| tick caps | rounded, r=2 | **square, r=0** | the last partially-covered row at a tick's top is a *uniform* 0.605 × a full row across the entire 8-device-px width. A 2px round cap would make that row 2.1px wide, not 8 |

Also confirmed, with evidence rather than assumption:

- **No box-shadow anywhere.** Ring means outside the toggle border: +0.51, −0.01,
  +0.30, +0.01, and exactly 0.0000 at 6–10px, on both the 494-frame MONO median
  and the 398-frame COLOR median. Same for the pill and the ticks.
- **Every capsule is fully rounded** (`border-radius: 9999px`), not a fixed
  radius: corner sweeps fit true circular arcs with rms 0.05–0.07 device px, and
  radius = height/2 to within 1.2%.
- **Both tick states are 4.00 CSS px wide.** Active 4.015 ± 0.025 (n=105),
  inactive 3.97 ± 0.05 (n=2609). The active tick is the same element recoloured.
- **The ruler's horizontal quantities are all lattice multiples**: the clip
  window is `23P − w`, the envelope range is exactly `11P`. So `D/halfWindow`
  is a constant and the silhouette survives a change of pitch — which is why the
  responsive rule shrinks the pitch and keeps all 23 ticks.
