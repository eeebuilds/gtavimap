(function () {
  'use strict';
  // Map image: Rockstar's official printable Leonida map, cropped to its frame. Full size 5378 x 7502 px.
  var W = 5378, H = 7502, UNIT = 8;          // one map unit = 8 full-size px (zoom 3 is full size)
  var PX_PER_MILE = 600;                     // the map's own legend: 2 inches = 1 mile at 300 dpi
  var GRID_X0 = 589, GRID_Y0 = 449;          // first grid line inside the frame; lines repeat every 600 px
  var PLACE_TYPES = { county: 'County', town: 'Ort', area: 'Område', place: 'Plats', nature: 'Natur', island: 'Ö' };
  var PLACE_ZOOM = { county: 1, town: 2.5, area: 3, place: 3.25, nature: 2.25, island: 2.75 };
  // Layers for data/points.json. Order here is the order in the layer list.
  var CATS = {
    mission: { label: 'Dolda uppdrag', glyph: '!' },
    money: { label: 'Pengar', glyph: '$' },
    easter_egg: { label: 'Påskägg', glyph: '*' },
    trivia: { label: 'Trivia', glyph: '?' },
    collectible: { label: 'Samlarobjekt', glyph: '+' },
    shop: { label: 'Butiker', glyph: 'B' },
    other: { label: 'Övrigt', glyph: '·' }
  };

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
    var f = function (n) { return n.toFixed(n < 10 ? 1 : 0).replace('.', ','); };
    return f(mi) + ' mi (' + f(mi * 1.609344) + ' km)';
  }

  // ---- Map ----
  var bounds = L.latLngBounds(ll(0, H), ll(W, 0));
  var map = L.map('map', {
    crs: L.CRS.Simple, minZoom: -1.25, maxZoom: 4.5, zoomSnap: 0.25, zoomDelta: 0.75, wheelPxPerZoomLevel: 90,
    attributionControl: false, zoomControl: false, maxBounds: bounds.pad(0.2), maxBoundsViscosity: 0.85
  });
  L.tileLayer('tiles/{z}/{x}_{y}.jpg', { tileSize: 1024, minZoom: -2, maxZoom: 5, minNativeZoom: 0, maxNativeZoom: 3, bounds: bounds, noWrap: true, keepBuffer: 1 }).addTo(map);
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
    $('scale-txt').textContent = String(pick).replace('.', ',') + ' mi';
  }
  map.on('zoom', drawScale);
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
    if (save) prefs.set('pos', p);
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
    var x = el('button', null, 'icon-btn'); x.type = 'button'; x.setAttribute('aria-label', 'Stäng');
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
  function closeCard() { clearSelection(); card.hidden = true; current = null; }
  function refreshCard() {
    if (!current) return;
    if (current.kind === 'me') showMeCard(); else if (current.kind === 'place') showPlace(current.item, false); else showPoint(current.item, false);
  }
  function distRow(p) { return mePos ? ['Från dig', fmtDist(miles(p, mePos)) + ' fågelvägen'] : null; }
  function posAction() { return mePos ? [] : [['Sätt min position', function () { closeCard(); setPlacing(true); }]]; }

  function showPlace(p, fly) {
    clearSelection(); current = { kind: 'place', item: p };
    pin = L.marker(ll(p.x, p.y), { interactive: false, keyboard: false,
      icon: L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(map);
    renderCard(p.name, [rows([['Typ', PLACE_TYPES[p.type]], ['Ruta', gridRef(p)], distRow(p)])], posAction());
    if (fly) map.flyTo(ll(p.x, p.y), PLACE_ZOOM[p.type], { duration: 0.8 });
  }
  function showMeCard() {
    clearSelection(); current = { kind: 'me' };
    renderCard('Din position', [rows([['Ruta', gridRef(mePos)], ['Sparas', 'bara i den här webbläsaren']])], [
      ['Flytta', function () { closeCard(); setPlacing(true); }, true],
      ['Ta bort', function () { setMe(null, true); closeCard(); }]
    ]);
  }
  function setSel(pt, on) { var n = pt.marker && pt.marker.getElement(); if (n && n.firstChild) n.firstChild.classList.toggle('sel', on); }
  function showPoint(pt, fly) {
    clearSelection(); current = { kind: 'point', item: pt };
    if (!layerOn[pt.category]) { layerOn[pt.category] = true; prefs.set('layers', layerOn); applyLayers(); renderLayers(); }
    setSel(pt, true);
    var badges = el('div', null, 'badges');
    badges.appendChild(el('span', CATS[pt.category].label, 'badge cat'));
    badges.appendChild(pt.status === 'confirmed' ? el('span', 'Bekräftad', 'badge ok') : el('span', 'Obekräftad', 'badge warn'));
    var src = null;
    if (pt.source && /^https:\/\//.test(pt.source.url || '')) {
      src = el('a', pt.source.name || pt.source.url); src.href = pt.source.url; src.target = '_blank'; src.rel = 'noopener noreferrer';
    }
    renderCard(pt.title, [
      badges,
      el('p', pt.text),
      pt.precision === 'area' ? el('p', 'Markören visar området' + (pt.place ? ' ' + pt.place : '') + '. Den exakta platsen är inte belagd.', 'note') : null,
      rows([['Ruta', gridRef(pt)], distRow(pt), src ? ['Källa', src] : null])
    ], posAction());
    if (fly) map.flyTo(ll(pt.x, pt.y), pt.precision === 'area' ? 2.75 : 3.5, { duration: 0.8 });
  }

  // ---- Layers ----
  var places = [], points = [], groups = {}, layerOn = prefs.get('layers', {}), spoilers = prefs.get('spoilers', false);
  function visible(pt) { return spoilers || !pt.spoiler; }
  function applyLayers() {
    Object.keys(groups).forEach(function (c) { layerOn[c] ? groups[c].addTo(map) : groups[c].remove(); });
    points.forEach(function (pt) { if (!pt.marker) return; visible(pt) ? groups[pt.category].addLayer(pt.marker) : groups[pt.category].removeLayer(pt.marker); });
  }
  function renderLayers() {
    var box = $('layers'); box.textContent = '';
    box.appendChild(el('h3', 'Lager'));
    Object.keys(CATS).forEach(function (c) {
      var n = points.filter(function (pt) { return pt.category === c && visible(pt); }).length;
      if (!groups[c]) return;
      var lab = el('label'), cb = el('input'); cb.type = 'checkbox'; cb.id = 'layer-' + c; cb.checked = !!layerOn[c];
      cb.onchange = function () { layerOn[c] = cb.checked; prefs.set('layers', layerOn); applyLayers(); };
      var dot = el('span', null, 'dot'); dot.style.background = 'var(--c-' + c + ')';
      lab.appendChild(cb); lab.appendChild(dot); lab.appendChild(el('span', CATS[c].label)); lab.appendChild(el('span', String(n), 'cnt'));
      box.appendChild(lab);
    });
    if (points.some(function (pt) { return pt.spoiler; })) {
      box.appendChild(el('div', null, 'sep'));
      var lab = el('label'), cb = el('input'); cb.type = 'checkbox'; cb.id = 'layer-spoilers'; cb.checked = spoilers;
      cb.onchange = function () { spoilers = cb.checked; prefs.set('spoilers', spoilers); applyLayers(); renderLayers(); if (current && current.kind === 'point' && !visible(current.item)) closeCard(); };
      lab.appendChild(cb); lab.appendChild(el('span')); lab.appendChild(el('span', 'Visa spoilers')); lab.appendChild(el('span'));
      box.appendChild(lab);
    }
  }
  $('layers-btn').onclick = function () {
    var open = $('layers').hidden;
    $('layers').hidden = !open; $('layers-btn').setAttribute('aria-expanded', String(open));
  };
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
        var k = stacks[anchor.name] = (stacks[anchor.name] || 0) + 1, a = (k - 1) * 2.4, rad = k === 1 ? 0 : 70 + 12 * k;
        pt.x = anchor.x + Math.cos(a) * rad; pt.y = anchor.y + 46 + Math.sin(a) * rad;
      }
      if (!inside(pt)) return;
      points.push(pt);
    });
    points.forEach(function (pt) {
      if (!groups[pt.category]) groups[pt.category] = L.layerGroup();
      if (layerOn[pt.category] == null) layerOn[pt.category] = true;
      var d = el('div', CATS[pt.category].glyph, 'pt' + (pt.status === 'confirmed' ? '' : ' unconfirmed'));
      d.style.background = 'var(--c-' + pt.category + ')';
      pt.marker = L.marker(ll(pt.x, pt.y), { title: pt.title, alt: pt.title,
        icon: L.divIcon({ className: '', html: d.outerHTML, iconSize: [28, 28], iconAnchor: [14, 14] }) });
      pt.marker.on('click', function () { showPoint(pt, false); });
    });
    if (points.length) { $('layers-btn').hidden = false; applyLayers(); renderLayers(); }
  }

  // ---- Search over place names and layer points ----
  var q = $('q'), results = $('results'), hits = [], active = 0;
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function search() {
    var t = norm(q.value);
    results.textContent = '';
    if (!t) { results.hidden = true; hits = []; return; }
    var pool = places.map(function (p) { return { kind: 'place', item: p, name: p.name, sub: PLACE_TYPES[p.type] + ' · ' + gridRef(p), hay: norm(p.name) }; })
      .concat(points.filter(visible).map(function (pt) { return { kind: 'point', item: pt, name: pt.title, sub: CATS[pt.category].label + ' · ' + gridRef(pt), hay: norm(pt.title + ' ' + CATS[pt.category].label + ' ' + (pt.place || '') + ' ' + (pt.text || '')) }; }));
    hits = pool.filter(function (h) { return h.hay.indexOf(t) !== -1; })
      .sort(function (a, b) { return (norm(a.name).indexOf(t) === 0 ? 0 : 1) - (norm(b.name).indexOf(t) === 0 ? 0 : 1) || (norm(a.name).indexOf(t) === -1 ? 1 : 0) - (norm(b.name).indexOf(t) === -1 ? 1 : 0) || a.name.localeCompare(b.name); })
      .slice(0, 8);
    active = 0;
    if (!hits.length) results.appendChild(el('li', 'Inget på kartan matchar sökningen.', 'none'));
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

  // ---- Start ----
  var saved = prefs.get('pos', null);
  if (saved && typeof saved.x === 'number' && typeof saved.y === 'number' && inside(saved)) setMe(saved, false);
  window.addEventListener('resize', function () { map.invalidateSize(); });
  function getJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }); }
  getJSON('data/places.json').then(function (d) { places = d; }).catch(function () { places = []; })
    .then(function () { return getJSON('data/points.json'); })
    .then(addPoints).catch(function () {});
})();
