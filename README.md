# Leonida Map

An unofficial, interactive map of Leonida in GTA VI. Runs in the browser on desktop and mobile.

The site is static: no build step, no server. Serve the repository root with any web server
(`python3 -m http.server`) or publish it as it is.

## What it does

- Zoomable map built on Rockstar's official printable Leonida map.
- Search across place names (`data/places.json`) and layer points (`data/points.json`).
- Grid squares A–M / 1–9 and a scale in miles, both taken from the map's own grid and legend.
- "My position": a marker you set by hand. Stored in your own browser only.
- Layers for hidden missions, money, easter eggs, trivia, collectibles and shops, with a spoiler switch.

Not built yet: live position (reading the in-game minimap), platform choice, pairing a computer with a phone.

## Rule: no point without a source

Every point in `data/points.json` must trace back to a published source. The site does not show
points without one, and `python3 scripts/check_points.py` rejects them.

```json
{
  "id": "short-unique-id",
  "title": "Title",
  "category": "mission | money | easter_egg | trivia | collectible | shop | other",
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
- `status` is `confirmed` only when an established source has verified the find in the released game.
  Rumours, leaks and trailer readings are not added at all.
- `spoiler: true` hides the point until the visitor turns on "Show spoilers".
- Do not copy other sites' marker collections. Individual facts with their own source are fine.

## The map image

`tiles/` is cut from Rockstar's own download ("Leonida Map – Printable" at rockstargames.com/VI/downloads).
Rebuild with `python3 scripts/build_tiles.py Leonida_Map_Poster_Printable.jpg` (needs Pillow).
The names in `data/places.json` are read off the same map; each coordinate is the centre of the label.

The map image belongs to Rockstar Games. This is a fan project with no connection to
Rockstar Games or Take-Two Interactive.

## Other

- Map engine: Leaflet 1.9.4 (`vendor/leaflet`, BSD-2 licence).
- `scripts/make_preview.py` builds a single-file copy of the page for previews.
