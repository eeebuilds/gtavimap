# LiveBlip

Unofficial interactive map of Leonida (GTA VI) at https://liveblip.com. A static site: no build step, no server.
Read `README.md` for what the site does and for the `data/points.json` schema.

## Working agreements

- The site, code and comments are in English. Report to the owner in Swedish.
- **A push to `main` goes straight to production** (Vercel deploys it to liveblip.com). Test first.
- "Looks good" is not verification. Before reporting something as done: run `python3 scripts/check_points.py`,
  load the page in a browser at desktop and phone size (Playwright is available), and check the live site after the push.
- Keep the "unofficial fan map, not affiliated with Rockstar Games or Take-Two" notice on the page.

## Rules for map data

1. **No point without a source.** Every point carries a source link and the passage that supports it. Nothing from
   memory, no rumours, leaks or trailer readings. `scripts/check_points.py` enforces the schema.
2. **Positions come from the in-game map**, read out of screenshots with `scripts/mapshots.py`. Screenshots may be
   the owner's own or ones the owner downloaded by hand.
3. **Do not get around bot checks or paywalls**, and do not copy another site's marker database. If a site answers
   with a challenge page, stop and tell the owner.
4. A point without an exact position sits at a place name and is shown as "the area". Do not guess coordinates.
5. Mark a point `unconfirmed` when its only source is weak, hedged, or sources disagree. `spoiler: true` for story content.

## Layout

- `index.html`, `css/app.css`, `js/app.js`: the whole app. Layers are defined in `CATS` at the top of `js/app.js`.
- `data/places.json`: place names read off the official map. `data/points.json`: everything shown in the layers.
- `tiles/`: the map image (Rockstar's printable Leonida map, cropped to 5378 x 7502, zoom 0-3). Rebuild with `scripts/build_tiles.py`.
  Zoom 4 and 5 are the same image upscaled with Real-ESRGAN (`scripts/upscale_tiles.py`): sharper, but no added detail.
  `tiles/surround/` holds four strips that carry the poster's sea colour on past its edges (`scripts/build_surround.py`);
  `js/app.js` lays them and a continuation of the poster's grid around the map so the page reads as one sheet.
- `scripts/mapshots.py`: matches a pause-map screenshot to the map image and converts icon positions to map pixels.
  `scripts/icon_templates/` holds one 27 x 27 icon per category; cut new ones with `--cut`.
- `vendor/`: Leaflet and PeerJS. `vercel.json`: redirects to liveblip.com and tile caching.

## State on 2026-11-20

Live: map (sharp to full zoom since the upscaled levels 4-5), place search, 44 sourced finds (area-level positions), shops with exact positions (23 of 24 gun stores,
16 of 19 Pay 'n' Sprays, 10 of 14 mod shops, 7 of 12 garages; all but the gun stores named), shop layers that appear
when zoomed in, found-tracking, a link per point, and device linking (peer-to-peer through PeerJS's public server).

Open, roughly in the owner's order of interest:

1. **More shops.** Missing: Pay 'n' Spray Key Lento, Grayson, Millport; garages Vela Rota Drive, Persistence Road,
   Wyatt Motors, Bonita Court, Store n' Bolt; mod shops Lowballers Customs, Rideout Customs, Stockyard Speedshop,
   Ledford Motorcycle Workshop; 1 gun store and names for the gun stores; all clothing, tattoo and hair stores.
   PowerPyx's guide pages show one in-game map screenshot per shop with that shop selected in the list; the map
   centres on it and its name shows in the label, so `mapshots.py --selected` gives name and position together.
   PowerPyx sometimes answers with a "One moment, please..." challenge page (the clothing and Ammu-Nation pages, and
   the map images for the shops above did): stop and let the owner download those by hand. Screenshots go in `work/`
   (git- and deploy-ignored); they are PowerPyx's images and are not published.
2. **Live position.** Not started. The idea: the player's console picture reaches a computer (Remote Play or a capture
   card) and the page reads the position from the picture. Needs gameplay screenshots that show the minimap. The
   in-game map matches the site's map closely, so `mapshots.py` is the starting point.
3. **Exact positions for the 44 finds.**
4. **A page per point** so search engines can find them; today the site is one script-driven page.
5. **Accounts / follow a friend.** Needs a real backend. Supabase was planned but the owner's free plan already has
   two projects.
6. **Ads.** Take-Two's policy tolerates non-commercial fan use; ad funding is outside that. The owner knows and has
   not decided. Replacing Rockstar's poster with an own-drawn base map would lower the risk.
7. The redirects in `vercel.json` are temporary (307); make them permanent once the domain is settled.

Hosting: Vercel project `gtavimap` in the team `galaxxyeriks-projects`; `liveblip.com` is registered through Vercel
with auto-renew on.
