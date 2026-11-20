#!/usr/bin/env python3
"""Add sharper zoom levels 4 and 5 to the tile pyramid by upscaling the full-size map (zoom 3) four times.

Usage: python3 scripts/upscale_tiles.py path/to/realesrgan-ncnn-vulkan.exe [model]

The poster is 5378 x 7502 px, so past zoom 3 the browser can only stretch it. This runs the zoom-3 tiles through
Real-ESRGAN (https://github.com/xinntao/Real-ESRGAN, the portable ncnn-vulkan build; default model
realesrgan-x4plus-anime, which suits flat map artwork) and cuts the result into zoom 5 (four times the size) and
zoom 4 (the same image halved). Upscaling sharpens edges and lettering; it adds no real detail.

Each 1024 px piece is upscaled together with 32 px of its surroundings and then trimmed, so no seams show between
tiles. Needs opencv-python-headless and numpy. Working files go in work/upscale/ (ignored by git).
"""
import glob, math, os, shutil, subprocess, sys
import cv2
import numpy as np

W, H, TILE, PAD, SCALE = 5378, 7502, 1024, 32, 4
OCEAN = (198, 168, 0)   # BGR; the pad colour scripts/build_tiles.py uses for partial edge tiles
JPEG = [cv2.IMWRITE_JPEG_QUALITY, 80, cv2.IMWRITE_JPEG_PROGRESSIVE, 1, cv2.IMWRITE_JPEG_OPTIMIZE, 1]


def cut(img, z, tx0, ty0, out):
    """Write img as 1024 px tiles of zoom z, its top-left tile being (tx0, ty0)."""
    h, w = img.shape[:2]
    for j in range(math.ceil(h / TILE)):
        for i in range(math.ceil(w / TILE)):
            part = img[j * TILE:(j + 1) * TILE, i * TILE:(i + 1) * TILE]
            tile = np.full((TILE, TILE, 3), OCEAN, np.uint8)
            tile[:part.shape[0], :part.shape[1]] = part
            cv2.imwrite(f'{out}/{z}/{tx0 + i}_{ty0 + j}.jpg', tile, JPEG)


def main(exe, model='realesrgan-x4plus-anime', out='tiles'):
    exe = os.path.abspath(exe)
    full = np.zeros((math.ceil(H / TILE) * TILE, math.ceil(W / TILE) * TILE, 3), np.uint8)
    for f in glob.glob(f'{out}/3/*.jpg'):
        tx, ty = map(int, os.path.basename(f)[:-4].split('_'))
        full[ty * TILE:(ty + 1) * TILE, tx * TILE:(tx + 1) * TILE] = cv2.imread(f)
    full = cv2.copyMakeBorder(full[:H, :W], PAD, PAD, PAD, PAD, cv2.BORDER_REFLECT)

    src, dst = os.path.abspath('work/upscale/in'), os.path.abspath('work/upscale/out')
    for d in (src, dst):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d)
    pieces = []
    for ty in range(math.ceil(H / TILE)):
        for tx in range(math.ceil(W / TILE)):
            w, h = min(TILE, W - tx * TILE), min(TILE, H - ty * TILE)
            cv2.imwrite(f'{src}/{tx}_{ty}.png', full[ty * TILE:ty * TILE + h + 2 * PAD, tx * TILE:tx * TILE + w + 2 * PAD])
            pieces.append((tx, ty, w, h))

    subprocess.run([exe, '-i', src, '-o', dst, '-n', model, '-s', str(SCALE), '-f', 'png',
                    '-m', os.path.join(os.path.dirname(exe), 'models')], check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    for z in (4, 5):
        shutil.rmtree(f'{out}/{z}', ignore_errors=True)
        os.makedirs(f'{out}/{z}')
    for tx, ty, w, h in pieces:
        big = cv2.imread(f'{dst}/{tx}_{ty}.png')
        if big is None or big.shape[:2] != ((h + 2 * PAD) * SCALE, (w + 2 * PAD) * SCALE):
            sys.exit(f'piece {tx}_{ty}: missing or unexpected size {None if big is None else big.shape}')
        big = big[PAD * SCALE:(PAD + h) * SCALE, PAD * SCALE:(PAD + w) * SCALE]
        cut(big, 5, tx * 4, ty * 4, out)
        cut(cv2.resize(big, (w * 2, h * 2), interpolation=cv2.INTER_AREA), 4, tx * 2, ty * 2, out)
    for z in (4, 5):
        files = glob.glob(f'{out}/{z}/*.jpg')
        print(f'zoom {z}: {len(files)} tiles, {sum(map(os.path.getsize, files)) / 1e6:.1f} MB')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(*sys.argv[1:3])
