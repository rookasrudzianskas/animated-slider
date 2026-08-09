#!/usr/bin/env python3
"""Measure the same geometry from any 2180x2160 DPR-2 image.

Run it on a reference frame and on an app screenshot and diff the numbers —
far more reliable than looking at two crops side by side.

    python3 scripts/measure.py <image.png> [--json]

All outputs are CSS px (device px / 2).
"""
import json
import sys

import numpy as np
from PIL import Image

BG = 253.0


def sub_edges(v, frac=0.5, bg=BG):
    ink = np.clip(bg - np.asarray(v, dtype=float), 0, None)
    mx = ink.max()
    if mx <= 1:
        return None
    t = mx * frac
    idx = np.where(ink >= t)[0]
    i0, i1 = idx.min(), idx.max()
    left = i0 - 1 + (t - ink[i0 - 1]) / (ink[i0] - ink[i0 - 1]) if i0 > 0 and ink[i0 - 1] < t else float(i0)
    right = i1 + 1 - (t - ink[i1 + 1]) / (ink[i1] - ink[i1 + 1]) if i1 < len(ink) - 1 and ink[i1 + 1] < t else float(i1)
    return left, right, float(mx)


def measure(path):
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(float)
    if rgb.shape[:2] != (2160, 2180):
        img = Image.open(path).convert("RGB").resize((2180, 2160), Image.LANCZOS)
        rgb = np.asarray(img).astype(float)
    lum = rgb.mean(axis=2)
    out = {}
    css = lambda v: round(float(v) / 2, 2)

    out["page_bg"] = [int(v) for v in np.median(rgb[200:520, 60:520].reshape(-1, 3), axis=0)]

    # ---- toggle -----------------------------------------------------------
    band = lum[0:140, 1700:2180]
    ink = np.clip(BG - band, 0, None)
    cols = np.where(ink.max(axis=0) > 3)[0]
    rows = np.where(ink.max(axis=1) > 3)[0]
    if len(cols) and len(rows):
        x0, x1 = 1700 + cols.min(), 1700 + cols.max()
        y0, y1 = rows.min(), rows.max()
        out["toggle_box"] = dict(
            left=css(x0), right=css(x1 + 1), top=css(y0), bottom=css(y1 + 1),
            width=css(x1 - x0 + 1), height=css(y1 - y0 + 1),
            right_inset=css(2180 - x1 - 1), top_inset=css(y0),
        )
        mid = (y0 + y1) // 2
        border = np.clip(BG - lum[mid, x0 - 3 : x0 + 6], 0, None)
        out["toggle_border_peak_ink"] = float(border.max())
        out["toggle_border_width_css"] = css(float(border.sum() / max(border.max(), 1e-6)))
        # active black segment
        dark = lum[y0:y1, x0:x1] < 60
        dc = np.where(dark.sum(axis=0) > 5)[0]
        dr = np.where(dark.sum(axis=1) > 5)[0]
        if len(dc) and len(dr):
            out["toggle_active"] = dict(
                left=css(x0 + dc.min()), width=css(dc.max() - dc.min() + 1),
                top=css(y0 + dr.min()), height=css(dr.max() - dr.min() + 1),
            )
        # inactive label colour: darkest pixel right of the black segment
        if len(dc):
            seg = lum[y0:y1, x0 + dc.max() + 6 : x1]
            out["toggle_idle_label_min"] = int(seg.min()) if seg.size else None

    # ---- age pill ---------------------------------------------------------
    # Stop well short of the ruler: the indicator starts at device y 1392 and
    # would otherwise be counted as part of the capsule.
    strip = lum[1240:1380, :]
    dark = strip < 60
    pc = np.where(dark.sum(axis=0) > 4)[0]
    pr = np.where(dark.sum(axis=1) > 4)[0]
    if len(pc) and len(pr):
        py0, py1 = 1240 + pr.min(), 1240 + pr.max()
        out["pill"] = dict(
            left=css(pc.min()), right=css(pc.max() + 1), width=css(pc.max() - pc.min() + 1),
            top=css(py0), bottom=css(py1 + 1),
            height=css(pr.max() - pr.min() + 1), centre_x=css((pc.min() + pc.max() + 1) / 2),
        )
        # White text extent. Inset past the rounded corners so the page showing
        # through them is not mistaken for glyphs.
        inset = (py1 - py0) // 2
        inner = rgb[py0 + 4 : py1 - 3, pc.min() + inset : pc.max() - inset].mean(axis=2)
        text = inner > 150
        tc = np.where(text.sum(axis=0) > 0)[0]
        tr = np.where(text.sum(axis=1) > 0)[0]
        if len(tc) and len(tr):
            out["pill_text"] = dict(
                width=css(tc.max() - tc.min() + 1),
                cap_height=css(tr.max() - tr.min() + 1),
                left=css(pc.min() + inset + tc.min()),
                pad_left=css(inset + tc.min()),
                pad_right=css((pc.max() - pc.min()) - (inset + tc.max())),
            )

    # ---- ruler ------------------------------------------------------------
    band = lum[1370:1600, :]
    ink = np.clip(BG - band, 0, None)
    dc = (band < 100).sum(axis=0)
    ic = np.where(dc > 110)[0]
    if len(ic):
        e = sub_edges(lum[1500, ic.min() - 8 : ic.max() + 9])
        base = ic.min() - 8
        out["indicator"] = dict(
            width=css(e[1] - e[0]), centre=css(base + (e[0] + e[1]) / 2),
        )
        col = lum[1370:1600, int(round(base + (e[0] + e[1]) / 2))]
        ev = sub_edges(col)
        out["indicator"]["top"] = css(1370 + ev[0])
        out["indicator"]["bottom"] = css(1370 + ev[1])
        out["indicator"]["height"] = css(ev[1] - ev[0])

    colink = ink.sum(axis=0)
    if len(ic):
        colink[max(0, ic.min() - 3) : ic.max() + 4] = 0
    cand = np.where(colink > 25)[0]
    cand = cand[(cand > 380) & (cand < 1800)]
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
            if len(g) > 22 or len(g) < 3:
                continue
            a0, a1 = g[0], g[-1]
            w = colink[a0 : a1 + 1]
            cx = float((np.arange(a0, a1 + 1) * w).sum() / w.sum())
            sub = ink[:, a0 : a1 + 1]
            if sub.max() > 60:
                continue
            rr = np.where((sub > 4).any(axis=1))[0]
            if not len(rr):
                continue
            ticks.append((cx, float(rr.max() - rr.min() + 1), float(sub.max())))
    if len(ticks) >= 6:
        xs = np.array([t[0] for t in ticks])
        out["tick_count"] = len(ticks)
        out["tick_pitch"] = css(float(np.median(np.diff(xs))))
        out["tick_extent"] = [css(xs.min()), css(xs.max())]
        out["tick_peak_ink"] = round(float(np.median([t[2] for t in ticks])), 1)
        out["tick_colour_lum"] = round(BG - float(np.median([t[2] for t in ticks])), 1)
        c = out["indicator"]["centre"] * 2 if "indicator" in out else 1090.78
        env = sorted(((abs(t[0] - c) / 2, t[1] / 2) for t in ticks))
        out["envelope"] = [[round(d, 1), round(h, 1)] for d, h in env]
    return out


if __name__ == "__main__":
    data = measure(sys.argv[1])
    if "--json" in sys.argv:
        print(json.dumps(data))
    else:
        print(json.dumps(data, indent=1))
