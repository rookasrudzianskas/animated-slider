#!/usr/bin/env python3
"""Region-wise pixel diff between an app screenshot and a reference frame.

argv: <app.png (2180x2160)> <reference.jpg (1090x1080)> <regions json> [out.png] [cursor json]

`cursor json` is [x, y, w, h] of the mouse pointer in the reference frame. The
recording has a cursor and a screenshot does not, so those pixels are excluded
rather than being counted as a difference.

The screenshot is DPR-2 so it is downsampled to 1090x1080 to match the frame
grid. Diffs are reported in 0-255 luminance.
"""
import json
import sys

import numpy as np
from PIL import Image

app_path, ref_path, regions_json = sys.argv[1], sys.argv[2], sys.argv[3]
out_path = sys.argv[4] if len(sys.argv) > 4 else ""

app = Image.open(app_path).convert("RGB")
ref = Image.open(ref_path).convert("RGB")
if app.size != ref.size:
    app = app.resize(ref.size, Image.LANCZOS)

a = np.asarray(app).astype(float)
b = np.asarray(ref).astype(float)
delta = np.abs(a - b).mean(axis=2)

valid = np.ones(delta.shape, bool)
cursor = json.loads(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5] else None
if isinstance(cursor, list) and len(cursor) == 4:
    cx, cy, cw, ch = cursor
    pad = 6
    valid[max(0, cy - pad) : cy + ch + pad, max(0, cx - pad) : cx + cw + pad] = False

regions = json.loads(regions_json)
report = {}
for name, (x, y, w, h) in regions.items():
    sub = delta[y : y + h, x : x + w]
    ok = valid[y : y + h, x : x + w]
    vals = sub[ok]
    if vals.size == 0:
        vals = sub.ravel()
    report[name] = {
        "mean": float(vals.mean()),
        "p99": float(np.percentile(vals, 99)),
        "max": float(vals.max()),
        "masked_px": int((~ok).sum()),
    }

if out_path:
    heat = np.clip(delta * 6, 0, 255).astype(np.uint8)
    strip = Image.new("RGB", (ref.size[0], ref.size[1] * 3))
    strip.paste(ref, (0, 0))
    strip.paste(app, (0, ref.size[1]))
    strip.paste(Image.fromarray(heat).convert("RGB"), (0, ref.size[1] * 2))
    strip.save(out_path)

print(json.dumps(report))
