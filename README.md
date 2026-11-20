# LiveBlip

An unofficial, interactive map of Leonida in GTA VI, live at https://liveblip.com. Runs in the browser on desktop and mobile.

The site is static: no build step, no server. Serve the repository root with any web server
(`python3 -m http.server`) or publish it as it is.

## What it does

- Zoomable map built on Rockstar's official printable Leonida map.
- Search across place names (`data/places.json`) and layer points (`data/points.json`).
- Grid squares A–M / 1–9 and a scale in miles, both taken from the map's own grid and legend.
- "My position": a marker you set by hand. Stored in your own browser only.
- Layers for hidden missions, money, easter eggs, trivia, collectibles and shops, with a spoiler switch.
- Shops and services (gun stores, Pay 'n' Spray, mod shops, garages so far) with exact positions. They appear once the map is zoomed in
  and each layer can be switched off.
- Found-tracking per point, a "Hide found" filter and a shareable link per point (`#point-id`).
- Link devices: the position marker is shared between a computer and a phone through a six-character code.
  It runs peer-to-peer over WebRTC (PeerJS and its public signalling server); nothing is stored on a server.

Not built yet: live position (reading the in-game minimap) and platform choice.

## Rule: no point without a source

Every point in `data/points.json` must trace back to a published source. The site does not show
points without one, and `python3 scripts/check_points.py` rejects them.

```json
{
  "id": "short-unique-id",
  "title": "Title",
  "category": "mission | money | easter_egg | trivia | collectible | shop | other | gun_shop | pay_n_spray | mod_shop | garage | clothing | tattoo | hair",
  "text": "What the source says. Nothing beyond the source.",
  "place": "A name from data/places.json",
  "x": 3668, "y": 3913,
  "status": "confirmed | unconfirmed",
  "spoiler": false,
  "source": { "name": "Publisher", "url": "https://…", "quote": "The passage that supports the point, verbatim." },
  "added": "2026-11-20"
}
```

- `x`/`y` are pixels in the cropped map image (5378 × 7502). Set them only when the exact spot is documented.
  Without `x`/`y` the point sits at the place name in `place` and is shown as "the area", not an exact spot.
- `precision: "map"` marks a position read from a screenshot of the in-game map: the screenshot is matched to this
  map image automatically and the icon's pointer is converted to map pixels (a pixel or two of error).
- `status` is `confirmed` only when an established source has verified the find in the released game.
  Rumours, leaks and trailer readings are not added at all.
- `spoiler: true` hides the point until the visitor turns on "Show spoilers".
- Do not copy other sites' marker collections. Individual facts with their own source are fine.

## The map image

`tiles/` is cut from Rockstar's own download ("Leonida Map – Printable" at rockstargames.com/VI/downloads).
Rebuild with `python3 scripts/build_tiles.py Leonida_Map_Poster_Printable.jpg` (needs Pillow).
Zoom levels 4 and 5 are that same image upscaled with [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) so it
stays sharp when zoomed in: `python3 scripts/upscale_tiles.py path/to/realesrgan-ncnn-vulkan.exe` (needs
opencv-python-headless and numpy). Upscaling sharpens edges and lettering; it adds no real detail.
The names in `data/places.json` are read off the same map; each coordinate is the centre of the label.

The map image belongs to Rockstar Games. This is a fan project with no connection to
Rockstar Games or Take-Two Interactive.

## Other

- Map engine: Leaflet 1.9.4 (`vendor/leaflet`, BSD-2 licence).
- Device linking: PeerJS 1.5.4 (`vendor/peerjs`, MIT licence), loaded only when linking is used.
- `scripts/make_preview.py` builds a single-file copy of the page for previews.
- `scripts/mapshots.py` reads shop positions out of screenshots of the in-game map (needs `opencv-python-headless` and `numpy`).
