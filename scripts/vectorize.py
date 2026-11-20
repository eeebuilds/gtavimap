#!/usr/bin/env python3
"""Pilot: turn a crop of the poster into a flat vector map styled like the in-game pause map.

Status: an experiment, not used by the site. Coastlines, parks, sand and highways trace well; streets and buildings
are rough, and whatever sat under a poster label is filled in from its surroundings (a guess). The poster and the
in-game map share geometry but not content, so a map meant to match the game has to be traced from screenshots of
the game's own map instead; the classify -> clean -> trace -> SVG steps here carry over.

Usage: python3 scripts/vectorize.py crop.png X0 Y0 out.svg   (crop: a piece of the full-size map, X0/Y0 its origin
in map px). Needs opencv-python-headless, numpy, scipy.
Steps: classify each pixel to a land-use class (nearest colour in Lab), erase the poster's labels and shields and
fill them from the surrounding classes, clean each class mask, trace contours and write one SVG path per class.
"""
import sys
import cv2
import numpy as np
from scipy import ndimage as ndi

# Poster colours (sRGB hex) -> class. Several poster shades fold into one class.
POSTER = {
    'water': ['00afc9', '2cb8cf', '5fc1d1', '0aa2c0'],
    'land': ['5a9785', '73a8a4', '6aa08c'],
    'park': ['3c8970', '1f7a5a'],
    'sand': ['bfb592', 'd8cc9c'],
    'urban': ['94a3af', '8d9ca8'],
    'street': ['c7d2d9', 'd3dbe2'],
    'building': ['a7b9c3', '62798c', '6f86a0', '8fa9cc'],
    'road': ['f7f9f2', 'e8eef0'],
    'rail': ['7a3042', '8a3a4c', '6b2a3a'],
}
# In-game pause-map palette, sampled from screenshots of the game's map.
GAME = {
    'water': '#3fa3c0', 'land': '#7ba097', 'park': '#56967b', 'sand': '#dad19e', 'urban': '#adb1b9',
    'street': '#cfd2d8', 'building': '#9ba4b3', 'road': '#f4f5f6', 'rail': '#8d7f86',
}
ORDER = ['land', 'park', 'sand', 'urban', 'building', 'street', 'road', 'rail']   # water is the background
PLACES, X0, Y0 = [], 0, 0
# Label box per place type: (px per character, box height), measured on the poster.
BOX = {'county': (64, 170), 'town': (54, 110), 'area': (24, 84), 'island': (24, 84), 'nature': (24, 84), 'place': (16, 64)}
MIN_AREA = {'road': 6, 'rail': 6, 'building': 10, 'street': 12}


def lab(hexes):
    a = np.array([[int(h[i:i + 2], 16) for i in (4, 2, 0)] for h in hexes], np.uint8).reshape(-1, 1, 3)
    return cv2.cvtColor(a, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)


def classify(img):
    L = cv2.cvtColor(cv2.GaussianBlur(img, (3, 3), 0), cv2.COLOR_BGR2LAB).astype(np.float32)
    names, cents = [], []
    for k, hs in POSTER.items():
        for c in lab(hs):
            names.append(k); cents.append(c)
    cents = np.array(cents)
    best = np.zeros(L.shape[:2], np.int32); bd = np.full(L.shape[:2], np.inf, np.float32)
    for i, c in enumerate(cents):
        d = ((L - c) ** 2).sum(-1)
        better = d < bd; bd[better] = d[better]; best[better] = i
    classes = list(POSTER)
    idx = np.array([classes.index(n) for n in names])[best]
    return idx, classes, L


def label_mask(img, L):
    """Pixels that belong to the poster's labels, shields and outlines rather than the land."""
    l, a, b = L[..., 0], L[..., 1] - 128, L[..., 2] - 128
    dark = (l < 100) & (np.abs(a) < 16)                      # near-black/grey outlines of labels
    navy = (l < 110) & (a > 8) & (b < -12)                    # navy/purple landmark labels
    cream = (l > 200) & (b > 22)                             # cream place labels
    shield = ((a > 35) & (l > 90)) | ((b < -35) & (l < 150))  # red / blue interstate shields
    outline = (dark | navy).astype(np.uint8)
    # White letter fills: white components whose rim is mostly label outline. Roads have grey rims.
    white = ((l > 225) & (np.abs(b) < 14)).astype(np.uint8)
    n, lab_, st, _ = cv2.connectedComponentsWithStats(white, 4)
    ring = cv2.dilate(white, np.ones((5, 5), np.uint8)) & (1 - white)
    # rim fraction per component: dilate each label id into the ring and count outline hits there
    grown = ndi.grey_dilation(lab_, size=(5, 5))
    rim = ring.astype(bool)
    tot = np.bincount(grown[rim], minlength=n)
    hit = np.bincount(grown[rim & (outline.astype(bool) | ((l < 135) & (np.abs(a) < 12) & (np.abs(b) < 14)))], minlength=n)
    frac = hit / np.maximum(tot, 1)
    letters = np.zeros(n, bool); letters[1:] = (frac[1:] > 0.5) & (st[1:, cv2.CC_STAT_AREA] < 40000)
    m = outline.astype(bool) | cream | shield | letters[lab_]
    # Around each known label (data/places.json), anything white or neutral grey is label, whatever its rim.
    neutral = (np.abs(a) < 10) & (np.abs(b) < 12) & (l < 140)
    h, w = l.shape
    for p in PLACES:
        cx, cy = p['x'] - X0, p['y'] - Y0
        cw, ch = BOX[p['type']]
        word = max(p['name'].split(' '), key=len)
        bw = (len(p['name']) if p['type'] in ('county', 'town') else max(len(word), len(p['name']) * 0.62)) * cw
        bx0, bx1 = int(max(0, cx - bw / 2 - 8)), int(min(w, cx + bw / 2 + 8))
        by0, by1 = int(max(0, cy - ch / 2)), int(min(h, cy + ch / 2))
        if bx0 < bx1 and by0 < by1:
            m[by0:by1, bx0:bx1] |= neutral[by0:by1, bx0:bx1]
    # The poster's own grid lines (every 600 map px) are thin light lines: erase them too.
    for gx in range(589, 5378, 600):
        x = gx - X0
        if 0 <= x < w:
            m[:, max(0, x - 2):x + 3] |= l[:, max(0, x - 2):x + 3] > 190
    for gy in range(449, 7502, 600):
        y = gy - Y0
        if 0 <= y < h:
            m[max(0, y - 2):y + 3, :] |= l[max(0, y - 2):y + 3, :] > 190
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    m = ndi.binary_fill_holes(m)
    m = cv2.dilate(m.astype(np.uint8), np.ones((5, 5), np.uint8))
    return m.astype(bool)


def fill_from_neighbours(idx, mask):
    _, (iy, ix) = ndi.distance_transform_edt(mask, return_indices=True)
    out = idx.copy()
    out[mask] = idx[iy[mask], ix[mask]]
    return out


def mode_filter(idx, n, k=5):
    votes = np.stack([cv2.blur((idx == c).astype(np.float32), (k, k)) for c in range(n)])
    return votes.argmax(0)


def trace(mask, x0, y0, scale, eps):
    """Smooth a binary mask and return an SVG path (even-odd) in map px."""
    big = cv2.resize(mask.astype(np.uint8) * 255, None, fx=scale, fy=scale, interpolation=cv2.INTER_LINEAR)
    big = cv2.GaussianBlur(big, (0, 0), scale * 0.4)
    _, big = cv2.threshold(big, 127, 255, cv2.THRESH_BINARY)
    cs, _ = cv2.findContours(big, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in cs:
        if cv2.contourArea(c) < 4 * scale * scale:
            continue
        c = cv2.approxPolyDP(c, eps * scale, True).reshape(-1, 2) / scale
        if len(c) < 3:
            continue
        pts = ' '.join(f'{x0 + x:.1f} {y0 + y:.1f}' for x, y in c)
        parts.append('M' + pts + 'Z')
    return ''.join(parts)


def main(src, x0, y0, out):
    global PLACES, X0, Y0
    x0, y0 = int(x0), int(y0)
    X0, Y0 = x0, y0
    import json, os
    PLACES = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../data/places.json')))
    img = cv2.imread(src)
    idx, classes, L = classify(img)
    lm = label_mask(img, L)
    idx = fill_from_neighbours(idx, lm)
    idx = mode_filter(idx, len(classes), 3)
    h, w = idx.shape
    land = cv2.dilate((idx != classes.index('water')).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    paths = [f'<path class="urban" d="{trace(land, x0, y0, 3, 0.9)}"/>']
    for k in ORDER:
        m = idx == classes.index(k)
        n, lab_, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
        keep = np.zeros(n, bool); keep[1:] = st[1:, cv2.CC_STAT_AREA] >= MIN_AREA.get(k, 25)
        m = keep[lab_]
        if k not in ('road', 'rail', 'street', 'building'):
            m = cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        d = trace(m, x0, y0, 3, 0.45 if k in ('road', 'rail', 'street') else 0.8)
        paths.append(f'<path class="{k}" d="{d}"/>')
    style = ''.join(f'.{k}{{fill:{c}}}' for k, c in GAME.items())
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {w} {h}" width="{w}" height="{h}" '
           f'shape-rendering="geometricPrecision"><style>{style}path{{fill-rule:evenodd}}</style>'
           f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="{GAME["water"]}"/>' + ''.join(paths) + '</svg>')
    open(out, 'w').write(svg)
    cv2.imwrite(out + '.labels.png', (lm * 255).astype(np.uint8))
    print(out, f'{len(svg) / 1e6:.1f} MB', {k: int((idx == classes.index(k)).sum()) for k in classes})


if __name__ == '__main__':
    main(*sys.argv[1:5])
