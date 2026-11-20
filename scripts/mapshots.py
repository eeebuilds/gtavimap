#!/usr/bin/env python3
"""Read shop positions out of screenshots of the in-game map.

A screenshot of GTA VI's pause map (1920x1080, a category filter switched on) is matched to this site's
map image with SIFT features, which gives a scale-and-shift transform from screenshot pixels to map pixels
(the 5378 x 7502 cropped map used in data/points.json). Icons are then found by template matching and their
pointer tips converted. On the screenshots tried so far the match has well under a pixel of residual error
and the same shop seen in different screenshots lands within about two map pixels.

Usage:
  python3 scripts/mapshots.py --template scripts/icon_templates/gun_shop.png shots/*.jpg > detections.json
  python3 scripts/mapshots.py --template ... --selected shots/one-shop.jpg     # also report the selected shop

--selected: the screenshot was taken with one shop selected in the list. The map then centres on it, so its
position is the middle of the screen. Use this to tie a name to a position.

A template is the 27 x 27 px body of one icon (pointer excluded), cut from any screenshot:
  python3 scripts/mapshots.py --cut shots/a.jpg 1283 102 scripts/icon_templates/clothing.png

Needs: pip install opencv-python-headless numpy
"""
import argparse, json, math, os, sys
import cv2
import numpy as np

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TIP_DY = 15            # an unselected icon's pointer tip sits this many screenshot px below the icon body's centre
SCREEN_CENTRE = (960, 539)
_base = None


def base_features():
    """SIFT features of the site's map at half size (the zoom-2 tiles, 2689 x 3751)."""
    global _base
    if _base is None:
        m = np.zeros((4 * 1024, 3 * 1024, 3), np.uint8)
        for tx in range(3):
            for ty in range(4):
                m[ty * 1024:(ty + 1) * 1024, tx * 1024:(tx + 1) * 1024] = cv2.imread(f"{REPO}/tiles/2/{tx}_{ty}.jpg")
        g = cv2.cvtColor(m[:3751, :2689], cv2.COLOR_BGR2GRAY)
        _base = cv2.SIFT_create(nfeatures=60000, contrastThreshold=0.02).detectAndCompute(g, None)
    return _base


def load(path):
    img = cv2.imread(path)
    if img is None:
        return None
    return img if img.shape[1] == 1920 else cv2.resize(img, (1920, round(img.shape[0] * 1920 / img.shape[1])))


def map_area(shape):
    """Mask of the part of a screenshot that shows map: no list panel, money HUD, button hints or watermark."""
    m = np.zeros(shape[:2], np.uint8)
    m[:, 560:] = 255
    m[100:230, 1650:] = 0
    m[790:, 1620:] = 0
    m[985:1060, 740:1180] = 0
    return m


def register(img):
    """Return (M, info). M is a 2x3 matrix taking screenshot px to map px, or None when the match is too weak."""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    k1, d1 = cv2.SIFT_create(nfeatures=8000, contrastThreshold=0.02).detectAndCompute(g, map_area(img.shape))
    k2, d2 = base_features()
    matcher = cv2.FlannBasedMatcher(dict(algorithm=1, trees=6), dict(checks=80))
    good = [m for m, n in matcher.knnMatch(d1, d2, k=2) if m.distance < 0.78 * n.distance]
    if len(good) < 12:
        return None, {"matches": len(good)}
    src = np.float32([k1[m.queryIdx].pt for m in good])
    dst = np.float32([k2[m.trainIdx].pt for m in good])
    M, inl = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=4.0, maxIters=8000, confidence=0.999)
    if M is None or int(inl.sum()) < 20:
        return None, {"matches": len(good), "inliers": 0 if M is None else int(inl.sum())}
    ok = inl.ravel() == 1
    resid = float(np.abs((src[ok] @ M[:, :2].T + M[:, 2]) - dst[ok]).mean()) * 2
    info = {"inliers": int(ok.sum()), "map_px_per_shot_px": round(float(math.hypot(M[0, 0], M[1, 0])) * 2, 3),
            "rotation_deg": round(math.degrees(math.atan2(M[1, 0], M[0, 0])), 3), "mean_residual_map_px": round(resid, 2)}
    return M * 2.0, info       # half-size map px -> full-size map px


def to_map(M, pts):
    return (np.float32(pts).reshape(-1, 2) @ M[:, :2].T + M[:, 2]).tolist()


def find_icons(img, tpl, threshold=0.6):
    """Centres of icon bodies in the map area, best match first: [(x, y, score), ...]."""
    r = cv2.matchTemplate(img, tpl, cv2.TM_CCOEFF_NORMED)
    mask, out = map_area(img.shape), []
    while True:
        _, v, _, (x, y) = cv2.minMaxLoc(r)
        if v < threshold:
            break
        cx, cy = x + tpl.shape[1] // 2, y + tpl.shape[0] // 2
        if mask[cy, cx]:
            out.append((cx, cy, round(float(v), 2)))
        cv2.rectangle(r, (max(0, x - 20), max(0, y - 20)), (x + 20, y + 20), -1, -1)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--template"); ap.add_argument("--selected", action="store_true")
    ap.add_argument("--threshold", type=float, default=0.6)
    ap.add_argument("--cut", nargs=4, metavar=("IMAGE", "X", "Y", "OUT"))
    ap.add_argument("images", nargs="*")
    a = ap.parse_args()
    if a.cut:
        x, y = int(a.cut[1]), int(a.cut[2])
        cv2.imwrite(a.cut[3], load(a.cut[0])[y - 13:y + 14, x - 13:x + 14])
        return
    tpl = cv2.imread(a.template) if a.template else None
    results = []
    for path in a.images:
        img = load(path)
        if img is None:
            print(f"{os.path.basename(path)}: not an image, skipped", file=sys.stderr)
            continue
        M, info = register(img)
        row = {"image": os.path.basename(path), "match": info, "icons": [], "selected": None}
        if M is not None:
            if tpl is not None:
                hits = find_icons(img, tpl, a.threshold)
                pts = to_map(M, [(x, y + TIP_DY) for x, y, _ in hits]) if hits else []
                row["icons"] = [{"x": round(px, 1), "y": round(py, 1), "score": h[2]} for (px, py), h in zip(pts, hits)]
            if a.selected:
                sx, sy = to_map(M, [SCREEN_CENTRE])[0]
                row["selected"] = {"x": round(sx, 1), "y": round(sy, 1)}
        results.append(row)
        print(f"{row['image']}: {info} -> {len(row['icons'])} icons", file=sys.stderr)
    json.dump(results, sys.stdout, indent=1)


if __name__ == "__main__":
    main()
