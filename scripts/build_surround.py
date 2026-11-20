#!/usr/bin/env python3
"""Make the four images that carry the poster's sea colour on past its edges.

Usage: python3 scripts/build_surround.py

The poster's sea is not one colour: it is a little lighter and less saturated towards the middle of each side than
the page background, so the poster's edge shows as a faint rectangle. For each side this reads the colour along the
poster's outermost pixels (from the zoom-3 tiles), smooths it along the edge so lettering, grid lines and texture
drop out, and writes a strip that starts in that colour at the edge and fades to the page colour REACH px out.
js/app.js lays the strips around the map. They are smooth, so they are stored at 1/16 size.
Needs opencv-python-headless and numpy.
"""
import glob, math, os
import cv2
import numpy as np

W, H, TILE = 5378, 7502, 1024
PAGE = np.array([198, 168, 0], np.float32)   # BGR of --ocean in css/app.css and of the tiles' padding
REACH, SHRINK, BAND = 2400, 16, 24            # fade distance in map px; output scale; edge pixels sampled


def smooth(profile, k=601):
    """Median then mean along the edge, mirrored at the ends."""
    p = np.pad(profile, ((k, k), (0, 0)), mode='reflect')
    med = np.stack([[np.median(p[i - 75:i + 76, c]) for i in range(k, k + len(profile))] for c in range(3)], 1)
    m = np.pad(med, ((k // 2, k // 2), (0, 0)), mode='reflect')
    return np.stack([np.convolve(m[:, c], np.ones(k) / k, mode='valid') for c in range(3)], 1).astype(np.float32)


def fade(dist):
    t = np.clip(dist / REACH, 0, 1)
    return (1 - t) ** 2 * (1 + 2 * t)   # 1 at the edge, 0 at REACH, flat at both ends


def strip(profile, along0, along1, corners):
    """A strip REACH px deep. profile: edge colours for positions 0..len-1 along the edge; the strip covers
    along0..along1 (beyond the profile's ends when it includes the corners) and is returned edge row first."""
    a = (np.arange(math.ceil((along1 - along0) / SHRINK)) + 0.5) * SHRINK + along0
    d = (np.arange(math.ceil(REACH / SHRINK)) + 0.5) * SHRINK
    edge = profile[np.clip(a, 0, len(profile) - 1).astype(int)]             # nearest edge colour
    past = np.maximum(np.maximum(-a, a - (len(profile) - 1)), 0) if corners else 0
    dist = np.hypot(d[:, None], past[None, :] if corners else 0)
    out = PAGE + (edge[None] - PAGE) * fade(dist)[..., None]
    return np.clip(np.round(out), 0, 255).astype(np.uint8)


def main(tiles='tiles'):
    full = np.zeros((math.ceil(H / TILE) * TILE, math.ceil(W / TILE) * TILE, 3), np.uint8)
    for f in glob.glob(f'{tiles}/3/*.jpg'):
        tx, ty = map(int, os.path.basename(f)[:-4].split('_'))
        full[ty * TILE:(ty + 1) * TILE, tx * TILE:(tx + 1) * TILE] = cv2.imread(f)
    im = full[:H, :W].astype(np.float32)
    left, right = smooth(np.median(im[:, :BAND], 1)), smooth(np.median(im[:, W - BAND:], 1))
    top, bottom = smooth(np.median(im[:BAND], 0)), smooth(np.median(im[H - BAND:], 0))
    os.makedirs(f'{tiles}/surround', exist_ok=True)
    # Side strips run the full height plus the corners; top and bottom fill in between them.
    side = lambda p: strip(p, -REACH, H + REACH, True).transpose(1, 0, 2)    # rows = along the edge, columns = depth
    images = {
        'left': side(left)[:, ::-1],                                          # edge at the right-hand column
        'right': side(right),
        'top': strip(top, 0, W, False)[::-1],                                 # edge at the bottom row
        'bottom': strip(bottom, 0, W, False),
    }
    for name, img in images.items():
        path = f'{tiles}/surround/{name}.png'
        cv2.imwrite(path, img, [cv2.IMWRITE_PNG_COMPRESSION, 9])
        print(f'{name}: {img.shape[1]} x {img.shape[0]} px, {os.path.getsize(path) / 1e3:.1f} kB')
    print('reach', REACH, 'map px; js/app.js must use the same figure')


if __name__ == '__main__':
    main()
