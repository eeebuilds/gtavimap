#!/usr/bin/env python3
"""Check data/points.json against the rules in README.md. Exits non-zero on any violation.

Usage: python3 scripts/check_points.py
"""
import json, sys

CATS = {"mission", "money", "easter_egg", "trivia", "collectible", "shop", "other"}
W, H = 5378, 7502

places = {p["name"].lower() for p in json.load(open("data/places.json", encoding="utf-8"))}
points = json.load(open("data/points.json", encoding="utf-8"))
errors, ids = [], set()
for i, p in enumerate(points):
    tag = f"#{i} {p.get('id', '?')}"
    for key in ("id", "title", "category", "text", "status", "source"):
        if not p.get(key):
            errors.append(f"{tag}: missing {key}")
    if p.get("id") in ids:
        errors.append(f"{tag}: duplicate id")
    ids.add(p.get("id"))
    if p.get("category") not in CATS:
        errors.append(f"{tag}: unknown category {p.get('category')!r}")
    if p.get("status") not in ("confirmed", "unconfirmed"):
        errors.append(f"{tag}: status must be confirmed or unconfirmed")
    src = p.get("source") or {}
    if not src.get("name") or not str(src.get("url", "")).startswith("https://"):
        errors.append(f"{tag}: source needs a name and an https url")
    if not src.get("quote"):
        errors.append(f"{tag}: source.quote missing (the passage that supports the point)")
    has_xy = isinstance(p.get("x"), (int, float)) and isinstance(p.get("y"), (int, float))
    if has_xy:
        if not (0 <= p["x"] <= W and 0 <= p["y"] <= H):
            errors.append(f"{tag}: x/y outside the map")
    elif str(p.get("place", "")).lower() not in places:
        errors.append(f"{tag}: needs x/y or a place name from data/places.json")
print(f"{len(points)} points, {len(errors)} problems")
for e in errors:
    print(" -", e)
sys.exit(1 if errors else 0)
