(function () {
  'use strict';
  // Map image: Rockstar's official printable Leonida map, cropped to its frame. Full size 5378 x 7502 px.
  var W = 5378, H = 7502, UNIT = 8;          // one map unit = 8 full-size px (zoom 3 is full size)
  var PX_PER_MILE = 600;                     // the map's own legend: 2 inches = 1 mile at 300 dpi
  var GRID_X0 = 589, GRID_Y0 = 449;          // first grid line inside the frame; lines repeat every 600 px
  var PLACE_TYPES = { county: 'County', town: 'Town', area: 'Area', place: 'Landmark', nature: 'Nature', island: 'Island' };
  var PLACE_ZOOM = { county: 1, town: 2.5, area: 3, place: 3.25, nature: 2.25, island: 2.75 };
  // Layers for data/points.json. Order here is the order in the layer list.
  var CATS = {
    mission: { label: 'Hidden missions', glyph: '!' },
    money: { label: 'Money', glyph: '$' },
    easter_egg: { label: 'Easter eggs', glyph: '*' },
    trivia: { label: 'Trivia', glyph: '?' },
    collectible: { label: 'Collectibles', glyph: '+' },
    shop: { label: 'Other stores', glyph: 'S' },
    other: { label: 'Useful spots', glyph: 'i' },
    // Shops and services: drawn smaller, and only once the map is zoomed in to SHOP_ZOOM.
    // `total` is the number of locations the cited guide counts; the list says so while a layer is incomplete.
    gun_shop: { label: 'Gun stores', svc: true, total: 24, icon: '<path d="M2 7h18v4h-6.5c-.6 0-1 .4-1.2 1l-.6 2H8.5L7 19H3l1.5-8H2z"/>' },
    pay_n_spray: { label: "Pay 'n' Spray", svc: true, total: 19, icon: '<path d="M8 9h7v12H8z"/><path d="M9.5 5.5h4V8h-4z"/><path d="M16.5 4.5h1.5v1.5h-1.5zM19 3h1.5v1.5H19zM19 6h1.5v1.5H19z"/>' },
    mod_shop: { label: 'Mod shops', svc: true, total: 14, icon: '<path d="M20.5 6.2l-3 3-2.7-.7-.7-2.7 3-3a5 5 0 00-6.300 6.200L3.500 16.300a2 2 0 002.800 2.800l7.300-7.300a5 5 0 006.900-5.600z"/>' },
    garage: { label: 'Garages', svc: true, total: 12, icon: '<path d="M3 10.5L12 4l9 6.500V20h-3v-7H6v7H3z"/><path d="M8 15h8v1.600H8zM8 18h8v2H8z"/>' },
    clothing: { label: 'Clothing stores', svc: true, icon: '<path d="M8.500 3.500L12 5.500l3.500-2L21 7l-2.500 3.500-2-1V20h-9V9.500l-2 1L3 7z"/>' },
    tattoo: { label: 'Tattoo studios', svc: true, glyph: 'T' },
    hair: { label: 'Hair & beauty', svc: true, icon: '<path d="M6.500 3a3 3 0 012.600 4.500L12 10.400l6.500-6.400h3L9.100 16.500A3 3 0 116.500 15c.5 0 1 .1 1.400.3L10.200 13 7.900 10.700A3 3 0 116.500 3zm0 2a1 1 0 100 2 1 1 0 000-2zm0 12a1 1 0 100 2 1 1 0 000-2zM14 13.800l1.800-1.800 5.700 5.700h-3z"/>' }
  };
  var SHOP_ZOOM = 0.75;

  var $ = function (id) { return document.getElementById(id); };
  var ll = function (x, y) { return L.latLng(-y / UNIT, x / UNIT); };
  var xy = function (latlng) { return { x: latlng.lng * UNIT, y: -latlng.lat * UNIT }; };
  var inside = function (p) { return p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= H; };
  var prefs = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem('leonida.' + k)); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { v == null ? localStorage.removeItem('leonida.' + k) : localStorage.setItem('leonida.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  function el(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }

  function gridRef(p) {
    if (!inside(p)) return '–';
    var col = p.x < GRID_X0 ? 1 : Math.min(9, 2 + Math.floor((p.x - GRID_X0) / 600));
    var row = p.y < GRID_Y0 ? 0 : Math.min(12, 1 + Math.floor((p.y - GRID_Y0) / 600));
    return 'ABCDEFGHIJKLM'[row] + col;
  }
  function miles(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) / PX_PER_MILE; }
  function fmtDist(mi) {
    var f = function (n) { return n.toFixed(n < 10 ? 1 : 0); };
    return f(mi) + ' mi (' + f(mi * 1.609344) + ' km)';
  }

  // ---- Map ----
  var bounds = L.latLngBounds(ll(0, H), ll(W, 0));
  var map = L.map('map', {
    crs: L.CRS.Simple, minZoom: -1.25, maxZoom: 4.5, zoomSnap: 0.25, zoomDelta: 0.75, wheelPxPerZoomLevel: 90,
    attributionControl: false, zoomControl: false, maxBounds: bounds.pad(0.2), maxBoundsViscosity: 0.85
  });
  // Leaflet picks the tile level from CSS pixels. On a high-density screen (Retina, Windows scaling above 100 %) that
  // would stretch each tile over two or three times as many device pixels, so there we fetch one level sharper and
  // draw it at half size (two levels, quarter size, above 2.2x) - Leaflet's detectRetina trick, kept inside our
  // zoom 0-3 pyramid.
  var dpr = window.devicePixelRatio || 1, zOff = dpr > 2.2 ? 2 : dpr > 1 ? 1 : 0;
  L.tileLayer('tiles/{z}/{x}_{y}.jpg', {
    tileSize: 1024 >> zOff, zoomOffset: zOff, minNativeZoom: -zOff, maxNativeZoom: 3 - zOff,
    minZoom: -2, maxZoom: 5, bounds: bounds, noWrap: true, keepBuffer: 1
  }).addTo(map);
  map.fitBounds(bounds);

  // Readouts: grid square under the pointer (or the screen centre on touch) and a scale bar in the map's own miles.
  function showGrid(latlng) { $('grid-ref').textContent = gridRef(xy(latlng)); }
  map.on('mousemove', function (e) { showGrid(e.latlng); });
  map.on('move', function () { showGrid(map.getCenter()); });
  function drawScale() {
    var pxPerMile = PX_PER_MILE * Math.pow(2, map.getZoom() - 3);
    var steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5], pick = steps[0];
    for (var i = 0; i < steps.length; i++) if (steps[i] * pxPerMile <= 130) pick = steps[i];
    $('scale-bar').style.width = Math.round(pick * pxPerMile) + 'px';
    $('scale-txt').textContent = pick + ' mi';
  }
  map.on('zoom', drawScale);
  map.on('zoomend', function () { if (points.length) applyLayers(); });
  drawScale(); showGrid(map.getCenter());
  $('zin').onclick = function () { map.zoomIn(); };
  $('zout').onclick = function () { map.zoomOut(); };

  // ---- "My position": one marker the player sets by hand. Kept in this browser only. ----
  var me = null, mePos = null, placing = false;
  function setMe(p, save) {
    mePos = p;
    if (!p) { if (me) { me.remove(); me = null; } }
    else if (me) me.setLatLng(ll(p.x, p.y));
    else {
      me = L.marker(ll(p.x, p.y), { draggable: true, keyboard: false, zIndexOffset: 1000,
        icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(map);
      me.on('click', showMeCard);
      me.on('dragend', function () {
        var q = xy(me.getLatLng());
        setMe({ x: Math.max(0, Math.min(W, q.x)), y: Math.max(0, Math.min(H, q.y)) }, true);
        refreshCard();
      });
    }
    $('locate').classList.toggle('on', !!p);
    if (save) { prefs.set('pos', p); if (!remoteApply) linkSend(p); }
  }
  function setPlacing(on) {
    placing = on;
    $('hint').hidden = !on;
    map.getContainer().classList.toggle('placing', on);
  }
  $('hint-cancel').onclick = function () { setPlacing(false); };
  $('locate').onclick = function () {
    if (!mePos) { setPlacing(!placing); return; }
    map.flyTo(ll(mePos.x, mePos.y), Math.max(map.getZoom(), 2.5), { duration: 0.6 });
    showMeCard();
  };
  map.on('click', function (e) {
    if (!placing) return;
    var p = xy(e.latlng);
    if (!inside(p)) return;
    setPlacing(false); setMe(p, true); showMeCard();
  });

  // ---- Info card: a place, a point from a layer, or the player's own position ----
  var card = $('card'), current = null, pin = null;   // current = { kind: 'place' | 'point' | 'me', item }
  function renderCard(title, parts, actions) {
    card.textContent = '';
    var head = el('div', null, 'head'); head.appendChild(el('h2', title));
    var x = el('button', null, 'icon-btn'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
    x.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    x.onclick = closeCard; head.appendChild(x); card.appendChild(head);
    parts.forEach(function (n) { if (n) card.appendChild(n); });
    if (actions && actions.length) {
      var a = el('div', null, 'actions');
      actions.forEach(function (b) { var n = el('button', b[0], 'btn' + (b[2] ? ' primary' : '')); n.type = 'button'; n.onclick = b[1]; a.appendChild(n); });
      card.appendChild(a);
    }
    card.hidden = false; card.scrollTop = 0;
  }
  function rows(list) {
    var dl = el('dl');
    list.forEach(function (r) { if (!r) return; dl.appendChild(el('dt', r[0])); var dd = el('dd'); typeof r[1] === 'string' ? dd.textContent = r[1] : dd.appendChild(r[1]); dl.appendChild(dd); });
    return dl;
  }
  function clearSelection() {
    if (pin) { pin.remove(); pin = null; }
    if (current && current.kind === 'point' && current.item.marker) setSel(current.item, false);
  }
  function closeCard() { var was = current; clearSelection(); card.hidden = true; current = null; setHash(''); if (was && was.kind === 'point') applyLayers(); }
  function refreshCard() {
    if (!current) return;
    if (current.kind === 'me') showMeCard(); else if (current.kind === 'place') showPlace(current.item, false); else showPoint(current.item, false);
  }
  // On narrow screens the card covers the top of the map, so aim the target at the middle of what is left.
  function flyToVisible(p, zoom, duration) {
    var dy = window.innerWidth <= 560 && !card.hidden ? card.getBoundingClientRect().bottom / 2 : 0;
    var c = map.project(ll(p.x, p.y), zoom).subtract([0, dy]);
    map.flyTo(map.unproject(c, zoom), zoom, { duration: duration });
  }
  function distRow(p) { return mePos ? ['From you', fmtDist(miles(p, mePos)) + ' in a straight line'] : null; }
  function posAction() { return mePos ? [] : [['Set my position', function () { closeCard(); setPlacing(true); }]]; }

  function showPlace(p, fly) {
    var was = current; clearSelection(); current = { kind: 'place', item: p }; setHash(''); if (was && was.kind === 'point') applyLayers();
    pin = L.marker(ll(p.x, p.y), { interactive: false, keyboard: false,
      icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(map);
    renderCard(p.name, [rows([['Type', PLACE_TYPES[p.type]], ['Grid', gridRef(p)], distRow(p)])], posAction());
    if (fly) flyToVisible(p, PLACE_ZOOM[p.type], 0.8);
  }
  function showMeCard() {
    var was = current; clearSelection(); current = { kind: 'me' }; setHash(''); if (was && was.kind === 'point') applyLayers();
    renderCard('Your position', [rows([['Grid', gridRef(mePos)], ['Saved', 'in this browser only']])], [
      ['Move', function () { closeCard(); setPlacing(true); }, true],
      ['Remove', function () { setMe(null, true); closeCard(); }]
    ]);
  }
  function makeIcon(pt) {
    var cat = CATS[pt.category], size = cat.svc ? 24 : 28;
    var d = el('div', isFound(pt) ? '\u2713' : cat.icon ? null : cat.glyph, 'pt' + (cat.svc ? ' svc' : '') + (pt.status === 'confirmed' ? '' : ' unconfirmed') + (isFound(pt) ? ' found' : '') + (pt.sel ? ' sel' : ''));
    if (cat.icon && !isFound(pt)) d.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + cat.icon + '</svg>';
    d.style.background = 'var(--c-' + pt.category + ')';
    return L.divIcon({ className: '', html: d.outerHTML, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }
  function setSel(pt, on) { pt.sel = on; if (pt.marker) pt.marker.setIcon(makeIcon(pt)); }
  // Progress: which points this player has ticked off. Kept in this browser only.
  var found = prefs.get('found', {}), hideFound = prefs.get('hideFound', false);
  function isFound(pt) { return !!found[pt.id]; }
  function toggleFound(pt) {
    if (found[pt.id]) delete found[pt.id]; else found[pt.id] = 1;
    prefs.set('found', found);
    pt.marker.setIcon(makeIcon(pt)); applyLayers(); renderLayers(); showPoint(pt, false);
  }
  // Each point has its own link (#id) so it can be shared.
  function setHash(id) { try { history.replaceState(null, '', id ? '#' + id : location.pathname + location.search); } catch (e) {} }
  function copyLink(pt, btn) {
    var url = location.origin + location.pathname + '#' + pt.id, done = function (t) { btn.textContent = t; };
    try { navigator.clipboard.writeText(url).then(function () { done('Link copied'); }, function () { done(url); }); } catch (e) { done(url); }
  }
  function openFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    var pt = id && points.filter(function (x) { return x.id === id; })[0];
    if (pt && !(current && current.item === pt)) showPoint(pt, true);
  }
  function showPoint(pt, fly) {
    clearSelection(); current = { kind: 'point', item: pt };
    if (!layerOn[pt.category]) { layerOn[pt.category] = true; prefs.set('layers', layerOn); renderLayers(); }
    setSel(pt, true); applyLayers(); setHash(pt.id);
    var badges = el('div', null, 'badges');
    badges.appendChild(el('span', CATS[pt.category].label, 'badge cat'));
    badges.appendChild(pt.status === 'confirmed' ? el('span', 'Confirmed', 'badge ok') : el('span', 'Unconfirmed', 'badge warn'));
    var src = null;
    if (pt.source && /^https:\/\//.test(pt.source.url || '')) {
      src = el('a', pt.source.name || pt.source.url); src.href = pt.source.url; src.target = '_blank'; src.rel = 'noopener noreferrer';
    }
    renderCard(pt.title, [
      badges,
      el('p', pt.text),
      pt.precision === 'area' ? el('p', 'The marker shows the ' + (pt.place ? pt.place + ' ' : '') + 'area, not the exact spot.', 'note') : null,
      pt.precision === 'map' ? el('p', 'Position taken from the in-game map.', 'note') : null,
      rows([['Grid', gridRef(pt)], distRow(pt), src ? ['Source', src] : null])
    ], [
      [isFound(pt) ? 'Found \u2713 (undo)' : 'Mark as found', function () { toggleFound(pt); }, !isFound(pt)],
      ['Copy link', function () { copyLink(pt, this); }]
    ].concat(posAction()));
    if (fly) flyToVisible(pt, pt.precision === 'area' ? 2.75 : 3.5, 0.8);
  }

  // ---- Layers ----
  var places = [], points = [], groups = {}, layerOn = prefs.get('layers', {}), spoilers = prefs.get('spoilers', false);
  function spoilerOk(pt) { return spoilers || !pt.spoiler; }
  function visible(pt) { return spoilerOk(pt) && !(hideFound && isFound(pt)); }
  function applyLayers() {
    var z = map.getZoom();
    Object.keys(groups).forEach(function (c) { layerOn[c] && (!CATS[c].svc || z >= SHOP_ZOOM) ? groups[c].addTo(map) : groups[c].remove(); });
    $('layers').classList.toggle('zoomed-out', z < SHOP_ZOOM);
    // The selected point stays on the map even when a filter would hide it (e.g. opened from a shared link).
    points.forEach(function (pt) { if (!pt.marker) return; visible(pt) || (current && current.item === pt) ? groups[pt.category].addLayer(pt.marker) : groups[pt.category].removeLayer(pt.marker); });
  }
  function renderLayers() {
    var box = $('layers'); box.textContent = '';
    box.appendChild(el('h3', 'Layers'));
    var shopsHead = false;
    Object.keys(CATS).forEach(function (c) {
      var inCat = points.filter(function (pt) { return pt.category === c && spoilerOk(pt); });
      var n = inCat.filter(isFound).length + '/' + inCat.length;
      if (!groups[c]) return;
      if (CATS[c].svc && !shopsHead) {
        shopsHead = true;
        box.appendChild(el('div', null, 'sep'));
        var h = el('h3', 'Shops & services'); h.appendChild(el('span', 'zoom in to see', 'hint')); box.appendChild(h);
      }
      var lab = el('label'), cb = el('input'); cb.type = 'checkbox'; cb.id = 'layer-' + c; cb.checked = !!layerOn[c];
      cb.onchange = function () { layerOn[c] = cb.checked; prefs.set('layers', layerOn); applyLayers(); };
      var dot = el('span', null, 'dot' + (CATS[c].svc ? ' svc' : '')); dot.style.background = 'var(--c-' + c + ')';
      var all = points.filter(function (pt) { return pt.category === c; }).length, name = el('span', CATS[c].label);
      if (CATS[c].total && all < CATS[c].total) name.appendChild(el('span', ' ' + all + ' of ' + CATS[c].total + ' mapped', 'part'));
      lab.appendChild(cb); lab.appendChild(dot); lab.appendChild(name); var cnt = el('span', n, 'cnt'); cnt.title = 'Found / total'; lab.appendChild(cnt);
      box.appendChild(lab);
    });
    box.appendChild(el('div', null, 'sep'));
    var opt = function (id, text, on, change) {
      var lab = el('label'), cb = el('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = on;
      cb.onchange = function () { change(cb.checked); applyLayers(); renderLayers(); };
      lab.appendChild(cb); lab.appendChild(el('span')); lab.appendChild(el('span', text)); lab.appendChild(el('span'));
      box.appendChild(lab);
    };
    opt('layer-hide-found', 'Hide found', hideFound, function (v) { hideFound = v; prefs.set('hideFound', v); });
    if (points.some(function (pt) { return pt.spoiler; })) opt('layer-spoilers', 'Show spoilers', spoilers, function (v) { spoilers = v; prefs.set('spoilers', v); });
  }
  $('layers-btn').onclick = function () { togglePanel('layers'); };
  function addPoints(raw) {
    var byName = {}; places.forEach(function (p) { byName[p.name.toLowerCase()] = p; });
    var stacks = {};
    raw.forEach(function (r) {
      if (!r || !r.title || !CATS[r.category] || !r.source || !r.source.url) return;      // no source, no point
      var pt = Object.assign({}, r), anchor = r.place ? byName[String(r.place).toLowerCase()] : null;
      if (typeof pt.x !== 'number' || typeof pt.y !== 'number') {
        if (!anchor) return;
        pt.precision = 'area';
        // Several area-level points on the same place name fan out around its label instead of stacking.
        var k = stacks[anchor.name] = (stacks[anchor.name] || 0) + 1, a = (k - 1) * 2.4, rad = 46 * Math.sqrt(k - 1);
        pt.x = anchor.x + Math.cos(a) * rad; pt.y = anchor.y + 40 + Math.sin(a) * rad;
      }
      if (!inside(pt)) return;
      points.push(pt);
    });
    points.forEach(function (pt) {
      if (!groups[pt.category]) groups[pt.category] = L.layerGroup();
      if (layerOn[pt.category] == null) layerOn[pt.category] = true;
      pt.marker = L.marker(ll(pt.x, pt.y), { title: pt.title, alt: pt.title, icon: makeIcon(pt) });
      pt.marker.on('click', function () { showPoint(pt, false); });
    });
    if (points.length) { $('layers-btn').hidden = false; applyLayers(); renderLayers(); openFromHash(); }
  }

  // ---- Search over place names and layer points ----
  var q = $('q'), results = $('results'), hits = [], active = 0;
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function search() {
    var t = norm(q.value);
    results.textContent = '';
    if (!t) { results.hidden = true; hits = []; return; }
    var pool = places.map(function (p) { return { kind: 'place', item: p, name: p.name, sub: PLACE_TYPES[p.type] + ' · ' + gridRef(p), hay: norm(p.name) }; })
      .concat(points.filter(spoilerOk).map(function (pt) { return { kind: 'point', item: pt, name: pt.title, sub: CATS[pt.category].label + ' · ' + gridRef(pt), hay: norm(pt.title + ' ' + CATS[pt.category].label + ' ' + (pt.place || '') + ' ' + (pt.text || '')) }; }));
    hits = pool.filter(function (h) { return h.hay.indexOf(t) !== -1; })
      .sort(function (a, b) { return (norm(a.name).indexOf(t) === 0 ? 0 : 1) - (norm(b.name).indexOf(t) === 0 ? 0 : 1) || (norm(a.name).indexOf(t) === -1 ? 1 : 0) - (norm(b.name).indexOf(t) === -1 ? 1 : 0) || a.name.localeCompare(b.name); })
      .slice(0, 8);
    active = 0;
    if (!hits.length) results.appendChild(el('li', 'Nothing on the map matches that search.', 'none'));
    hits.forEach(function (h, i) {
      var li = el('li'), b = el('button', null, i === 0 ? 'active' : ''); b.type = 'button';
      b.appendChild(el('span', h.name, 'nm')); b.appendChild(el('span', h.sub, 'ty'));
      b.onclick = function () { choose(h); };
      li.appendChild(b); results.appendChild(li);
    });
    results.hidden = false;
  }
  function choose(h) { q.value = h.name; results.hidden = true; q.blur(); h.kind === 'place' ? showPlace(h.item, true) : showPoint(h.item, true); }
  q.addEventListener('input', search);
  q.addEventListener('focus', function () { if (q.value) search(); });
  q.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && hits.length) { e.preventDefault(); choose(hits[active]); }
    else if (e.key === 'Escape') { results.hidden = true; q.blur(); }
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && hits.length) {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length;
      Array.prototype.forEach.call(results.querySelectorAll('button'), function (b, i) { b.classList.toggle('active', i === active); });
    }
  });
  map.on('mousedown touchstart', function () { results.hidden = true; });

  // ---- Link devices: the same position on a computer and a phone ----
  // Peer-to-peer over WebRTC (PeerJS). One device hosts a room named by a short code; the others join it.
  // The host relays between guests. Nothing is stored on a server.
  var ROOM = 'liveblip-v1-', ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var link = { role: null, code: null, peer: null, conns: [], status: 'idle', tries: 0 }, remoteApply = false;
  function validCode(c) { return typeof c === 'string' && c.length === 6 && c.split('').every(function (ch) { return ALPHABET.indexOf(ch) !== -1; }); }
  function cleanCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function newCode() {
    var a = new Uint32Array(6), out = '';
    (window.crypto || window.msCrypto).getRandomValues(a);
    for (var i = 0; i < 6; i++) out += ALPHABET[a[i] % ALPHABET.length];
    return out;
  }
  function loadPeer(cb) {
    if (window.Peer) return cb();
    var sc = document.createElement('script'); sc.src = 'vendor/peerjs/peerjs.min.js';
    sc.onload = function () { cb(); }; sc.onerror = function () { cb(new Error('load')); };
    document.head.appendChild(sc);
  }
  function posMsg(p) { return p ? { t: 'pos', x: Math.round(p.x), y: Math.round(p.y) } : { t: 'clear' }; }
  function linkSend(p, except) {
    link.conns.forEach(function (c) { if (c !== except && c.open) { try { c.send(posMsg(p)); } catch (e) {} } });
  }
  function onRemote(d, from) {
    if (!d || typeof d !== 'object') return;
    var p = null;
    if (d.t === 'pos' && typeof d.x === 'number' && typeof d.y === 'number' && inside(d)) p = { x: d.x, y: d.y };
    else if (d.t !== 'clear') return;
    remoteApply = true; setMe(p, true); remoteApply = false;
    if (current && current.kind === 'me' && !p) closeCard(); else refreshCard();
    if (link.role === 'host') linkSend(p, from);          // relay to the other guests
  }
  function addConn(c) {
    c.on('open', function () {
      link.conns.push(c); link.tries = 0;
      if (link.role === 'host') { try { c.send(posMsg(mePos)); } catch (e) {} } else link.status = 'linked';
      renderLink();
    });
    c.on('data', function (d) { onRemote(d, c); });
    var gone = function () {
      var i = link.conns.indexOf(c); if (i !== -1) link.conns.splice(i, 1);
      if (link.role === 'guest' && link.peer) { link.status = 'reconnecting'; retryGuest(); }
      renderLink();
    };
    c.on('close', gone); c.on('error', gone);
  }
  function retryGuest() {
    if (link.role !== 'guest' || !link.peer || link.conns.length) return;
    if (++link.tries > 20) { link.status = 'notfound'; renderLink(); return; }
    setTimeout(function () {
      if (link.role !== 'guest' || !link.peer || link.conns.length) return;
      if (link.peer.disconnected && !link.peer.destroyed) { try { link.peer.reconnect(); } catch (e) {} }
      try { addConn(link.peer.connect(ROOM + link.code, { reliable: true })); } catch (e) {}
    }, 3000);
  }
  function startLink(role, code) {
    stopLink(true);
    link.role = role; link.code = code; link.status = 'connecting'; link.tries = 0;
    prefs.set('link', { role: role, code: code }); renderLink();
    loadPeer(function (err) {
      if (link.role !== role || link.code !== code) return;
      if (err) { link.status = 'loaderror'; renderLink(); return; }
      var peer = link.peer = role === 'host' ? new Peer(ROOM + code, { debug: 0 }) : new Peer({ debug: 0 });
      peer.on('open', function () {
        if (role === 'host') { link.status = 'hosting'; renderLink(); }
        else addConn(peer.connect(ROOM + code, { reliable: true }));
      });
      peer.on('connection', function (c) { if (role === 'host') addConn(c); else c.close(); });
      peer.on('disconnected', function () { if (link.peer === peer && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} } });
      peer.on('error', function (e) {
        if (link.peer !== peer) return;
        if (e.type === 'peer-unavailable') { link.status = link.tries ? 'reconnecting' : 'notfound'; if (link.tries) retryGuest(); }
        else if (e.type === 'unavailable-id') link.status = 'taken';
        else if (!link.conns.length) link.status = 'neterror';
        renderLink();
      });
    });
  }
  function stopLink(keepPref) {
    if (link.peer) { try { link.peer.destroy(); } catch (e) {} }
    link = { role: null, code: null, peer: null, conns: [], status: 'idle', tries: 0 };
    if (!keepPref) prefs.set('link', null);
    renderLink();
  }
  function renderLink() {
    var box = $('link'), btn = $('link-btn');
    btn.classList.toggle('on', link.conns.length > 0);
    box.textContent = '';
    box.appendChild(el('h3', 'Link devices'));
    var actions = function (list) {
      var a = el('div', null, 'actions');
      list.forEach(function (b) { var n = el('button', b[0], 'btn' + (b[2] ? ' primary' : '')); n.type = 'button'; n.onclick = b[1]; a.appendChild(n); });
      box.appendChild(a);
    };
    var failed = { loaderror: 'Could not load the linking module. Check your connection and try again.',
      neterror: 'Could not reach the linking service. Try again in a moment.',
      taken: 'That code is already open in another tab or device.',
      notfound: 'No device is sharing the code ' + link.code + '. Check the code on the other device.' }[link.status];
    if (!link.role || failed) {
      if (failed) box.appendChild(el('p', failed, 'err'));
      box.appendChild(el('p', 'Show the same position on your computer and your phone.'));
      actions([['Create a code', function () { startLink('host', newCode()); }, true]]);
      box.appendChild(el('p', 'Or enter the code shown on your other device:', 'note'));
      var form = el('form', null, 'join'), inp = el('input'), go = el('button', 'Join', 'btn');
      inp.id = 'link-code'; inp.type = 'text'; inp.maxLength = 7; inp.autocomplete = 'off'; inp.spellcheck = false;
      inp.placeholder = 'CODE'; inp.setAttribute('aria-label', 'Code from your other device'); inp.setAttribute('autocapitalize', 'characters');
      go.type = 'submit';
      form.onsubmit = function (e) {
        e.preventDefault();
        var c = cleanCode(inp.value);
        if (validCode(c)) startLink('guest', c); else { inp.value = ''; inp.placeholder = '6 characters'; inp.focus(); }
      };
      form.appendChild(inp); form.appendChild(go); box.appendChild(form);
    } else if (link.role === 'host') {
      box.appendChild(el('p', 'Your code', 'note'));
      box.appendChild(el('div', link.code, 'code'));
      var n = link.conns.length;
      box.appendChild(el('p', link.status === 'connecting' ? 'Starting…' : n === 0 ? 'Waiting for another device…' : n === 1 ? '1 device linked' : n + ' devices linked', 'status' + (n ? ' ok' : '')));
      box.appendChild(el('p', 'On the other device, open liveblip.com, tap Link devices and enter the code.', 'note'));
      actions([['Copy link', function () {
        var url = location.origin + location.pathname + '?link=' + link.code, b = this;
        try { navigator.clipboard.writeText(url).then(function () { b.textContent = 'Link copied'; }, function () { b.textContent = url; }); } catch (e) { b.textContent = url; }
      }], ['Stop', function () { stopLink(); }]]);
    } else {
      box.appendChild(el('p', link.status === 'linked' ? 'Linked with code ' + link.code : link.status === 'reconnecting' ? 'Connection lost. Reconnecting…' : 'Connecting to ' + link.code + '…', 'status' + (link.status === 'linked' ? ' ok' : '')));
      actions([['Leave', function () { stopLink(); }]]);
    }
    box.appendChild(el('p', 'Positions are sent only between your linked devices and are not stored.', 'note'));
  }
  function togglePanel(id) {
    ['layers', 'link'].forEach(function (k) {
      var open = k === id && $(k).hidden;
      $(k).hidden = !open; $(k + '-btn').setAttribute('aria-expanded', String(open));
    });
  }
  $('link-btn').onclick = function () { togglePanel('link'); };

  // ---- Start ----
  var saved = prefs.get('pos', null);
  if (saved && typeof saved.x === 'number' && typeof saved.y === 'number' && inside(saved)) setMe(saved, false);
  window.addEventListener('resize', function () { map.invalidateSize(); });
  window.addEventListener('hashchange', openFromHash);
  renderLink();
  (function () {
    var q = '', stored = prefs.get('link', null);
    try { q = cleanCode(new URLSearchParams(location.search).get('link')); } catch (e) {}
    if (validCode(q)) {
      try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
      startLink('guest', q); togglePanel('link');
    } else if (stored && validCode(stored.code) && (stored.role === 'host' || stored.role === 'guest')) startLink(stored.role, stored.code);
  })();
  function getJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }); }
  getJSON('data/places.json').then(function (d) { places = d; }).catch(function () { places = []; })
    .then(function () { return getJSON('data/points.json'); })
    .then(addPoints).catch(function () {});
})();
