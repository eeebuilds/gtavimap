#!/usr/bin/env python3
"""Cut Rockstar's printable Leonida map into the tile pyramid the site uses.

Usage: python3 scripts/build_tiles.py path/to/Leonida_Map_Poster_Printable.jpg

The source file is Rockstar's own download (rockstargames.com/VI/downloads, "Leonida Map - Printable",
5775 x 7900 px, CMYK). It is converted to sRGB, cropped to the inside of the printed frame and cut into
1024 px JPEG tiles for zoom levels 0-3 (3 = full size). Needs Pillow.
"""
import io, math, os, sys
from PIL import Image, ImageCms

Image.MAX_IMAGE_PIXELS = None
FRAME = (198, 198, 5576, 7700)   # inside edge of the map's printed frame, in source pixels
OCEAN = (0, 168, 198)            # pad colour for partial edge tiles
TILE = 1024


def main(src, out="tiles"):
    im = Image.open(src)
    if im.size != (5775, 7900):
        sys.exit(f"unexpected image size {im.size}; FRAME and the grid constants in js/app.js assume 5775x7900")
    if im.mode == "CMYK":
        icc = im.info.get("icc_profile")
        if icc:
            im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)), ImageCms.createProfile("sRGB"), outputMode="RGB")
        else:
            im = im.convert("RGB")
    im = im.crop(FRAME)
    w0, h0 = im.size
    for z in range(3, -1, -1):
        s = 2 ** (3 - z)
        w, h = math.ceil(w0 / s), math.ceil(h0 / s)
        lvl = im if s == 1 else im.resize((w, h), Image.LANCZOS)
        os.makedirs(f"{out}/{z}", exist_ok=True)
        for ty in range(math.ceil(h / TILE)):
            for tx in range(math.ceil(w / TILE)):
                t = Image.new("RGB", (TILE, TILE), OCEAN)
                t.paste(lvl.crop((tx * TILE, ty * TILE, min(w, (tx + 1) * TILE), min(h, (ty + 1) * TILE))), (0, 0))
                t.save(f"{out}/{z}/{tx}_{ty}.jpg", quality=80, progressive=True, optimize=True)
        print(f"zoom {z}: {w}x{h}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(*sys.argv[1:3])
