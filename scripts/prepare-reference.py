#!/usr/bin/env python3
"""Rebuild everything the comparison harness needs from the source recording.

    python3 scripts/prepare-reference.py [path/to/video.mp4]

Writes to `.reference/` in the repo (gitignored). Re-runnable and idempotent;
skips stages whose output already exists unless --force is passed.

The harness used to read these out of a session temp directory, which is exactly
the sort of thing that disappears between runs and takes the ability to verify
anything with it.

Stages
------
frames   every frame at 1090px wide (1 image px == 1 CSS px)
lossless full-resolution PNGs of the frames worth diffing against
strips   full-resolution crops of the pill+ruler band and of the toggle
geometry per-frame tick/indicator measurements            -> frames.json
toggle   which colour mode is active per frame            -> toggle.json
cursor   the mouse pointer's bbox per frame               -> cursor2.json
index    the ruler's continuous position per frame        -> index.json

Requires: ffmpeg, tesseract, python3 with pillow/numpy/scipy.
"""
import json
import os
import re
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, ".reference")
DEFAULT_VIDEO = os.path.expanduser(
    "~/Downloads/Adi_-_I_made_an_Age_Progression_slider._Not_perfect_i_ran_out_of_patience_w4nH4b.mp4"
)

BG = 253.0
S = 47.60        # tick pitch, device px
C = 1090.78      # ruler centre, device px
N_FRAMES = 892
# Frames the harness diffs against, and what they are.
LOSSLESS = {"rest_01": 10, "rest_02": 430, "rest_03": 870, "color_active": 500}

force = "--force" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("--")]
VIDEO = args[0] if args else DEFAULT_VIDEO


def run(cmd):
    subprocess.run(cmd, check=True)


def stage(name, marker):
    path = os.path.join(OUT, marker)
    if os.path.exists(path) and not force:
        print(f"  {name}: already present")
        return False
    print(f"  {name}: building…")
    return True


def main():
    if not os.path.exists(VIDEO):
        sys.exit(f"source recording not found: {VIDEO}\npass its path as the first argument")
    for tool in ("ffmpeg", "tesseract"):
        if not shutil.which(tool):
            sys.exit(f"{tool} is required and was not found on PATH")
    os.makedirs(OUT, exist_ok=True)

    # ---- frames -----------------------------------------------------------
    frames_dir = os.path.join(OUT, "frames")
    if stage("frames", "frames/f_0892.jpg"):
        os.makedirs(frames_dir, exist_ok=True)
        run(["ffmpeg", "-v", "error", "-y", "-i", VIDEO, "-vf", "fps=30,scale=1090:-1",
             "-q:v", "2", os.path.join(frames_dir, "f_%04d.jpg")])

    strip_dir = os.path.join(OUT, "strip")
    if stage("pill+ruler strips", "strip/s_0892.png"):
        os.makedirs(strip_dir, exist_ok=True)
        run(["ffmpeg", "-v", "error", "-y", "-i", VIDEO, "-vf", "crop=2180:350:0:1270",
             os.path.join(strip_dir, "s_%04d.png")])

    tog_dir = os.path.join(OUT, "toggle")
    if stage("toggle crops", "toggle/t_0892.png"):
        os.makedirs(tog_dir, exist_ok=True)
        run(["ffmpeg", "-v", "error", "-y", "-i", VIDEO, "-vf", "crop=280:90:1900:20",
             os.path.join(tog_dir, "t_%04d.png")])

    png_dir = os.path.join(OUT, "png")
    if stage("lossless frames", f"png/{list(LOSSLESS)[-1]}.png"):
        os.makedirs(png_dir, exist_ok=True)
        expr = "+".join(f"eq(n\\,{n - 1})" for n in LOSSLESS.values())
        tmp = os.path.join(png_dir, "tmp_%02d.png")
        run(["ffmpeg", "-v", "error", "-y", "-i", VIDEO, "-vf", f"select='{expr}'",
             "-vsync", "0", tmp])
        for i, name in enumerate(sorted(LOSSLESS, key=lambda k: LOSSLESS[k]), start=1):
            os.replace(os.path.join(png_dir, f"tmp_{i:02d}.png"), os.path.join(png_dir, f"{name}.png"))

    # ---- per-frame tick + indicator geometry ------------------------------
    if stage("ruler geometry", "frames.json"):
        out = []
        for n in range(1, N_FRAMES + 1):
            lum = np.asarray(Image.open(os.path.join(strip_dir, f"s_{n:04d}.png")).convert("RGB")).astype(float).mean(axis=2)
            band = lum[115:310, :]
            dark = (band < 100).sum(axis=0)
            cols = np.where(dark > 110)[0]
            rec = dict(n=n, ind=None, nl=0, nr=0, lm=None, rm=None)
            if len(cols):
                x0, x1 = cols.min() - 4, cols.max() + 5
                seg = np.clip(BG - band[:, x0:x1], 0, None).sum(axis=0)
                ind = float((np.arange(x0, x1) * seg).sum() / seg.sum())
                ink = np.clip(BG - band, 0, None)
                colink = ink.sum(axis=0)
                colink[max(0, x0 - 2): x1 + 2] = 0
                cand = np.where(colink > 25)[0]
                cand = cand[(cand > 400) & (cand < 1790)]
                ticks = []
                if len(cand):
                    groups, cur = [], [cand[0]]
                    for c in cand[1:]:
                        if c <= cur[-1] + 3:
                            cur.append(c)
                        else:
                            groups.append(cur)
                            cur = [c]
                    groups.append(cur)
                    for g in groups:
                        if len(g) > 22:
                            continue
                        a0, a1 = g[0], g[-1]
                        w = colink[a0:a1 + 1]
                        sub = ink[:, a0:a1 + 1]
                        if sub.max() > 60:
                            continue
                        ticks.append(float((np.arange(a0, a1 + 1) * w).sum() / w.sum()))
                left = [t for t in ticks if t < ind - 15]
                right = [t for t in ticks if t > ind + 15]
                rec = dict(n=n, ind=round(ind, 3), nl=len(left), nr=len(right),
                           lm=min(left) if left else None, rm=max(right) if right else None)
            out.append(rec)
        json.dump(out, open(os.path.join(OUT, "frames.json"), "w"))

    # ---- colour mode per frame -------------------------------------------
    if stage("toggle state", "toggle.json"):
        st = {}
        for n in range(1, N_FRAMES + 1):
            a = np.asarray(Image.open(os.path.join(tog_dir, f"t_{n:04d}.png")).convert("RGB")).astype(float).mean(axis=2)
            st[str(n)] = "mono" if a[25:70, 30:120].mean() < a[25:70, 150:240].mean() else "color"
        json.dump(st, open(os.path.join(OUT, "toggle.json"), "w"))

    # ---- mouse pointer per frame -----------------------------------------
    # The recording has a cursor and a screenshot does not, so those pixels have
    # to be excluded from every diff.
    if stage("cursor track", "cursor2.json"):
        res = {}
        for n in range(1, N_FRAMES + 1):
            a = np.asarray(Image.open(os.path.join(frames_dir, f"f_{n:04d}.jpg")).convert("L")).astype(float)
            dark = a < 90
            dark[:60, :] = False        # toggle: white text on black
            dark[640:690, :] = False    # age capsule: same
            lab, cnt = ndimage.label(dark)
            best = None
            for i in range(1, cnt + 1):
                ys, xs = np.where(lab == i)
                h, w = int(ys.max() - ys.min() + 1), int(xs.max() - xs.min() + 1)
                if not (10 <= h <= 30 and 6 <= w <= 20) or not (40 <= len(ys) <= 320):
                    continue
                if a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].max() < 245:
                    continue        # the arrow has a white interior
                if best is None or len(ys) > best[0]:
                    best = (len(ys), int(xs.min()), int(ys.min()), w, h)
            res[str(n)] = [int(v) for v in best[1:]] if best else None
        json.dump(res, open(os.path.join(OUT, "cursor2.json"), "w"))

    # ---- the ruler's continuous position per frame -----------------------
    if stage("ruler index", "index.json"):
        frames = {r["n"]: r for r in json.load(open(os.path.join(OUT, "frames.json")))}
        pill_dir = os.path.join(OUT, "pill")
        os.makedirs(pill_dir, exist_ok=True)
        if not os.path.exists(os.path.join(pill_dir, f"{N_FRAMES:04d}.png")) or force:
            from PIL import ImageOps
            for n in range(1, N_FRAMES + 1):
                im = Image.open(os.path.join(strip_dir, f"s_{n:04d}.png")).convert("L").crop((980, 18, 1200, 92))
                im = ImageOps.invert(im).resize((im.width * 3, im.height * 3), Image.LANCZOS)
                im.save(os.path.join(pill_dir, f"{n:04d}.png"))
        raw = subprocess.run(
            ["bash", "-c",
             f'cd {pill_dir} && ls *.png | xargs -P 8 -I{{}} sh -c '
             f'\'printf "%s|%s\\n" "{{}}" "$(tesseract {{}} - --psm 8 2>/dev/null | tr -d "\\n\\r")"\''],
            capture_output=True, text=True, check=True).stdout

        ocr = {}
        for line in raw.splitlines():
            fn, _, txt = line.partition("|")
            if not fn[:4].isdigit():
                continue
            t = txt.replace(" ", "")
            m = re.search(r"[AaR]?[cCgG][eE][:;.]?(\d{1,3})", t) or re.search(r"(\d{1,3})", t)
            if m and 5 <= int(m.group(1)) <= 95:
                ocr[int(fn[:4])] = int(m.group(1))

        # Geometry first: when fewer than ten ticks sit on one side, the count
        # gives the age outright and no OCR is involved.
        age = {}
        for n, r in frames.items():
            if r["ind"] is None:
                continue
            if r["nl"] <= 9:
                age[n] = r["nl"] + 5
            elif r["nr"] <= 9:
                age[n] = 95 - r["nr"]

        def local_median(n, radius=4):
            vals = [ocr[m] for m in range(n - radius, n + radius + 1) if m in ocr]
            return float(np.median(vals)) if len(vals) >= 5 else None

        # OCR only where it sits on the trend of the MEDIAN-filtered series:
        # tesseract drops a digit for two frames in a row around n=652 ("58" ->
        # "5"), which a plain outlier trim survives and a median filter does not.
        for n in sorted(ocr):
            if n in age:
                continue
            xs = [m for m in range(n - 4, n + 5) if local_median(m) is not None]
            if len(xs) < 5:
                continue
            slope, intercept = np.polyfit(np.array(xs, float),
                                          np.array([local_median(m) for m in xs], float), 1)
            if abs(ocr[n] - (slope * n + intercept)) <= 1.5:
                age[n] = ocr[n]

        # The encoder flashes a tinted frame roughly every 4 seconds and tick
        # detection goes to pieces on those. The giveaway is not the tint — that
        # is a borderline call — but that NO ticks are found on either side of
        # the indicator, which cannot happen on a real frame.
        artifact = {n for n, r in frames.items() if r["nl"] + r["nr"] == 0}

        index = {}
        for n, a in age.items():
            if n in artifact:
                continue
            phase = (C - frames[n]["ind"]) / S
            value = (a - 5) + phase
            if abs(phase) <= 0.55 and -0.5 <= value <= 90.5:
                index[str(n)] = round(value, 4)
        json.dump(index, open(os.path.join(OUT, "index.json"), "w"))
        print(f"    {len(index)} of {N_FRAMES} frames have a trusted index")

    print(f"\nreference data ready in {OUT}")


if __name__ == "__main__":
    main()
