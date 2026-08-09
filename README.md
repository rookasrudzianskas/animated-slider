# Age Progression slider

A pixel-level recreation of the age-progression slider from the reference
recording: a scrolling tick ruler that morphs a face from 5 to 95.

![age 5](public/faces/5.webp)

## What it is

The control is **not** a track with a thumb. It is a strip of 91 ticks — one per
year — that scrolls behind a fixed centre, with the tick nearest the centre
drawn black. Tick height is a continuous function of distance from that centre,
so the strip reads as a shallow hill that the value slides through.

Three things about it are easy to get wrong, and all three are measured facts
rather than guesses (see [REFERENCE.md](REFERENCE.md)):

- **It is driven by the wheel, not by dragging.** The mouse cursor was tracked in
  all 892 frames of the recording: in the 484 frames where the ruler moved, the
  pointer moved in 18 — and all 18 were trips to the toggle.
- **It does not snap.** The strip comes to rest at arbitrary fractional
  positions; the label rounds, the ruler does not move.
- **The face blends on the fraction, not the rounded age.** Two resting states
  both labelled "Age: 5" show measurably different artwork.

Motion is a first-order exponential follower with τ = 79 ms, fitted across every
deceleration in the recording (140 samples, median velocity ratio 0.6564 per
1/30 s frame). No overshoot, no momentum.

## Running it

```bash
npm install
npm run dev
```

Next.js 16 · React 19 · Tailwind v4 · TypeScript.

## Verifying it against the source

The recording is the oracle. `scripts/compare.mjs` screenshots the app at the
reference viewport (1090×1080 at DPR 2), drives it to the same ruler position as
a chosen frame, and reports per-region pixel deltas; `scripts/measure.py` pulls
the same geometry out of any frame or screenshot so the two can be diffed as
numbers rather than eyeballed.

```bash
npm run dev
node scripts/compare.mjs           # default frame set
node scripts/compare.mjs 10 430 --write
```

Against the lossless reference frame the whole viewport currently differs by a
mean of 0.23/255. What is left is anti-aliasing weight in the two text runs —
same face, same size, same position, sub-pixel.

## Layout

```
src/lib/ruler.ts        pure geometry + value maths (no React, no DOM)
src/lib/rulerEngine.ts  the rAF follower; the offset never enters React state
src/lib/faces.ts        artwork loading, decode window, LRU
src/lib/layout.ts       every measured constant, with what it was measured from
src/components/         AgeRuler, FaceStack, AgePill, ModeToggle
scripts/                comparison harness against the recording
```

## Artwork

`public/faces/{5..95}.webp` are cut out of the recording itself. 72 of the 91 are
real frames; 13 are cross-fades of the two nearest real frames where the
recording never dwells in Color mode; 6 (ages 90–95) repeat the age-89 artwork
because **the recording never goes past age ≈ 89**. That last group is the one
place this cannot be 1:1, and it only shows at the very end of the ruler.
