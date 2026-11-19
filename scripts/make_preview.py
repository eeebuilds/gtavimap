#!/usr/bin/env python3
"""Build a single-file copy of the page for hosts that wrap the page in their own HTML skeleton
and only allow scripts from public CDNs (used for the private preview). Output: work/preview/index.html,
to be published together with tiles/ and data/.

Usage: python3 scripts/make_preview.py
"""
import os, re

html = open("index.html", encoding="utf-8").read()
body = re.search(r"<!-- app:start -->(.*)<!-- app:end -->", html, re.S).group(1).strip()
fonts = re.search(r'<link rel="stylesheet" href="(https://fonts\.googleapis\.com[^"]+)">', html).group(1)
css = open("css/app.css", encoding="utf-8").read()
js = open("js/app.js", encoding="utf-8").read()
out = f"""<title>LiveBlip</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="{fonts}">
<style>
{css}</style>

{body}

<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
{js}</script>
"""
os.makedirs("work/preview", exist_ok=True)
open("work/preview/index.html", "w", encoding="utf-8").write(out)
print("work/preview/index.html", len(out), "bytes")
