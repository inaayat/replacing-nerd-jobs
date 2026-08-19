/**
 * Sticky Notes board — pannable/zoomable canvas, drag, resize, rubber-band
 * selection, arrows, action bar, filing animations.
 *
 * Performance rules (docs/sticky-notes-plan.md §4.8): drag/pan/zoom write one
 * transform per rAF; no full re-renders after initial paint — store
 * notifications patch only the touched cards.
 */
import {
  COLOR_KEYS,
  ICON_KEYS,
  ICON_SVGS,
  PIN_SVG,
  VIEWPORT_KEY,
  ZOOM_MAX,
  ZOOM_MIN,
  arrowEndpoints,
  bbox,
  clamp,
  colorHex,
  findFreeSlot,
  fitViewport,
  isLoneUrl,
  legendLabel,
  randomId,
  rectsIntersect,
  screenToWorld,
  urlDomain,
  wipeTargets,
} from './notes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createBoard({ store, els, showToast }) {
  const { viewport, world, arrowLayer, rubber, empty, actionbar } = els;

  let vp = loadViewport();
  let vpFrame = 0;
  const cardEls = new Map(); // note id -> element
  const chipEls = new Map(); // collection id -> element
  const selection = new Set();
  let spaceHeld = false;
  let drag = null; // { kind: 'move'|'pan'|'rubber'|'resize'|'arrow', ... }
  let editingId = null;

  // ------------------------------------------------------------------ helpers

  function boardNotes() {
    return store.state.notes.filter((n) => n.status === 'board');
  }

  function noteById(id) {
    return store.state.notes.find((n) => n.id === id);
  }

  function noteRect(note) {
    const el = cardEls.get(note.id);
    return { x: note.x, y: note.y, w: note.w, h: el ? el.offsetHeight : note.h };
  }

  function loadViewport() {
    try {
      const raw = JSON.parse(localStorage.getItem(VIEWPORT_KEY) || 'null');
      if (raw && Number.isFinite(raw.panX) && Number.isFinite(raw.zoom)) {
        return { panX: raw.panX, panY: raw.panY, zoom: clamp(raw.zoom, ZOOM_MIN, ZOOM_MAX) };
      }
    } catch {
      /* fall through */
    }
    return { panX: 0, panY: 0, zoom: 1 };
  }

  function saveViewport() {
    try {
      localStorage.setItem(VIEWPORT_KEY, JSON.stringify(vp));
    } catch {
      /* ignore */
    }
  }

  function applyViewport() {
    if (vpFrame) return;
    vpFrame = requestAnimationFrame(() => {
      vpFrame = 0;
      world.style.transform = `translate(${vp.panX}px, ${vp.panY}px) scale(${vp.zoom})`;
      if (els.zoomLabel) els.zoomLabel.textContent = `${Math.round(vp.zoom * 100)}%`;
      positionActionBar();
    });
  }

  function viewportWorldRect() {
    const r = viewport.getBoundingClientRect();
    const tl = screenToWorld({ x: 0, y: 0 }, vp);
    return { x: tl.x, y: tl.y, w: r.width / vp.zoom, h: r.height / vp.zoom };
  }

  function toWorld(e) {
    const r = viewport.getBoundingClientRect();
    return screenToWorld({ x: e.clientX - r.left, y: e.clientY - r.top }, vp);
  }

  // ------------------------------------------------------------------ cards

  function renderCard(note) {
    let el = cardEls.get(note.id);
    if (!el) {
      el = document.createElement('article');
      el.className = 'sn-card';
      el.dataset.id = note.id;
      el.innerHTML = `
        <span class="sn-card-color"></span>
        <span class="sn-card-pin">${PIN_SVG}</span>
        <span class="sn-card-icon"></span>
        <div class="sn-card-body"></div>
        <div class="sn-card-source"></div>
        <span class="sn-dot" data-side="n"></span>
        <span class="sn-dot" data-side="e"></span>
        <span class="sn-dot" data-side="s"></span>
        <span class="sn-dot" data-side="w"></span>
        <span class="sn-card-resize" title="Resize"></span>`;
      world.appendChild(el);
      cardEls.set(note.id, el);
    }
    el.style.left = `${note.x}px`;
    el.style.top = `${note.y}px`;
    el.style.width = `${note.w}px`;
    el.style.minHeight = `${note.h}px`;
    el.classList.toggle('is-pinned', note.pinned);
    el.classList.toggle('is-selected', selection.has(note.id));
    const colorBar = el.querySelector('.sn-card-color');
    colorBar.style.background = note.colorKey ? colorHex(note.colorKey) : 'transparent';
    colorBar.title = note.colorKey ? legendLabel(store.state.legend, 'color', note.colorKey) : '';
    const icon = el.querySelector('.sn-card-icon');
    icon.innerHTML = note.iconKey ? ICON_SVGS[note.iconKey] : '';
    icon.title = note.iconKey ? legendLabel(store.state.legend, 'icon', note.iconKey) : '';
    const body = el.querySelector('.sn-card-body');
    if (body.textContent !== note.text && el.dataset.id !== editingId) body.textContent = note.text;
    const source = el.querySelector('.sn-card-source');
    if (note.sourceUrl) {
      source.innerHTML = '';
      const a = document.createElement('a');
      a.href = note.sourceUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = note.sourceTitle || urlDomain(note.sourceUrl);
      source.appendChild(a);
      source.hidden = false;
    } else {
      source.hidden = true;
    }
    return el;
  }

  function removeCard(id, { animate = false } = {}) {
    const el = cardEls.get(id);
    if (!el) return;
    cardEls.delete(id);
    selection.delete(id);
    if (animate) {
      el.classList.add('is-filing');
      setTimeout(() => el.remove(), 230);
    } else {
      el.remove();
    }
  }

  function fullRender() {
    for (const el of cardEls.values()) el.remove();
    cardEls.clear();
    selection.clear();
    for (const note of boardNotes()) renderCard(note);
    renderArrows();
    renderChips();
    renderSelection();
    renderEmpty();
  }

  function renderEmpty() {
    empty.hidden = cardEls.size > 0;
  }

  // ------------------------------------------------------------------ arrows

  function visibleArrows() {
    return store.state.arrows.filter((a) => cardEls.has(a.fromId) && cardEls.has(a.toId));
  }

  function renderArrows() {
    arrowLayer.innerHTML =
      '<defs><marker id="sn-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">' +
      '<path d="M1 1 L7 4 L1 7" fill="none" stroke="currentColor" stroke-width="1.5"/></marker></defs>';
    for (const arrow of visibleArrows()) {
      const g = document.createElementNS(SVG_NS, 'g');
      g.classList.add('sn-arrow');
      g.dataset.id = arrow.id;
      const hit = document.createElementNS(SVG_NS, 'line');
      hit.classList.add('sn-arrow-hit');
      const line = document.createElementNS(SVG_NS, 'line');
      line.classList.add('sn-arrow-line');
      line.setAttribute('marker-end', 'url(#sn-arrowhead)');
      const del = document.createElementNS(SVG_NS, 'g');
      del.classList.add('sn-arrow-del');
      del.innerHTML =
        '<circle r="9"></circle><path d="M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5"></path>';
      del.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        store.dispatch([{ op: 'arrow.delete', ids: [arrow.id] }]);
      });
      g.append(hit, line, del);
      arrowLayer.appendChild(g);
      pathArrow(arrow, g);
    }
  }

  function pathArrow(arrow, g, liveRects = null) {
    const from = liveRects?.get(arrow.fromId) || noteRect(noteById(arrow.fromId));
    const to = liveRects?.get(arrow.toId) || noteRect(noteById(arrow.toId));
    const seg = arrowEndpoints(from, to);
    g.style.display = seg ? '' : 'none';
    if (!seg) return;
    for (const line of g.querySelectorAll('line')) {
      line.setAttribute('x1', seg.x1);
      line.setAttribute('y1', seg.y1);
      line.setAttribute('x2', seg.x2);
      line.setAttribute('y2', seg.y2);
    }
    const del = g.querySelector('.sn-arrow-del');
    del.setAttribute('transform', `translate(${(seg.x1 + seg.x2) / 2}, ${(seg.y1 + seg.y2) / 2})`);
  }

  function repathArrowsTouching(ids, liveRects) {
    const set = new Set(ids);
    for (const arrow of visibleArrows()) {
      if (!set.has(arrow.fromId) && !set.has(arrow.toId)) continue;
      const g = arrowLayer.querySelector(`g[data-id="${arrow.id}"]`);
      if (g) pathArrow(arrow, g, liveRects);
    }
  }

  // ------------------------------------------------------------------ collection chips

  function renderChips() {
    for (const el of chipEls.values()) el.remove();
    chipEls.clear();
    const byCollection = new Map();
    for (const note of boardNotes()) {
      if (!note.collectionId) continue;
      if (!byCollection.has(note.collectionId)) byCollection.set(note.collectionId, []);
      byCollection.get(note.collectionId).push(noteRect(note));
    }
    for (const col of store.state.collections) {
      const rects = byCollection.get(col.id);
      if (!rects) continue;
      const box = bbox(rects);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'sn-chip';
      chip.textContent = col.name;
      chip.style.left = `${box.x}px`;
      chip.style.top = `${box.y - 30}px`;
      chip.addEventListener('pointerdown', (e) => e.stopPropagation());
      chip.addEventListener('click', () => {
        selection.clear();
        for (const n of boardNotes()) if (n.collectionId === col.id) selection.add(n.id);
        renderSelection();
      });
      world.appendChild(chip);
      chipEls.set(col.id, chip);
    }
  }

  // ------------------------------------------------------------------ selection + action bar

  function renderSelection() {
    for (const [id, el] of cardEls) el.classList.toggle('is-selected', selection.has(id));
    renderActionBar();
  }

  function selectedNotes() {
    return [...selection].map(noteById).filter(Boolean);
  }

  function renderActionBar() {
    const notes = selectedNotes();
    if (!notes.length) {
      actionbar.hidden = true;
      return;
    }
    actionbar.hidden = false;
    els.abCount.textContent = notes.length === 1 ? '1 note' : `${notes.length} notes`;
    // swatches
    els.abSwatches.innerHTML = '';
    const activeColor = notes.every((n) => n.colorKey === notes[0].colorKey) ? notes[0].colorKey : undefined;
    for (const key of COLOR_KEYS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sn-ab-swatch';
      b.style.background = colorHex(key);
      b.title = legendLabel(store.state.legend, 'color', key);
      b.setAttribute('aria-pressed', String(key === activeColor));
      b.addEventListener('click', () => {
        const ids = [...selection];
        store.dispatch([
          { op: 'note.categorize', ids, colorKey: key === activeColor ? null : key, ts: new Date().toISOString() },
        ]);
      });
      els.abSwatches.appendChild(b);
    }
    // icon popover
    els.abIconPop.innerHTML = '';
    const activeIcon = notes.every((n) => n.iconKey === notes[0].iconKey) ? notes[0].iconKey : undefined;
    els.abIcon.innerHTML = activeIcon ? ICON_SVGS[activeIcon] : '◇';
    for (const key of ICON_KEYS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sn-ab-icongrid';
      b.innerHTML = ICON_SVGS[key];
      b.title = legendLabel(store.state.legend, 'icon', key);
      b.setAttribute('aria-pressed', String(key === activeIcon));
      b.addEventListener('click', () => {
        els.abIconPop.hidden = true;
        store.dispatch([
          { op: 'note.categorize', ids: [...selection], iconKey: key === activeIcon ? null : key, ts: new Date().toISOString() },
        ]);
      });
      els.abIconPop.appendChild(b);
    }
    // pin
    const allPinned = notes.every((n) => n.pinned);
    els.abPin.setAttribute('aria-pressed', String(allPinned));
    els.abPin.textContent = allPinned ? 'Unpin' : 'Pin';
    // collection name
    const colId = notes[0].collectionId;
    const shared = notes.every((n) => n.collectionId === colId) ? colId : null;
    const col = store.state.collections.find((c) => c.id === shared);
    els.abName.value = col ? col.name : '';
    els.collectionNames.innerHTML = '';
    for (const c of store.state.collections) {
      const opt = document.createElement('option');
      opt.value = c.name;
      els.collectionNames.appendChild(opt);
    }
    positionActionBar();
  }

  function positionActionBar() {
    if (actionbar.hidden) return;
    const notes = selectedNotes();
    if (!notes.length) return;
    const box = bbox(notes.map(noteRect));
    const r = viewport.getBoundingClientRect();
    const x = box.x * vp.zoom + vp.panX + r.left + (box.w * vp.zoom) / 2;
    const y = box.y * vp.zoom + vp.panY + r.top;
    const barW = actionbar.offsetWidth || 420;
    actionbar.style.left = `${clamp(x - barW / 2, 8, window.innerWidth - barW - 8)}px`;
    actionbar.style.top = `${clamp(y - actionbar.offsetHeight - 12, 60, window.innerHeight - 80)}px`;
  }

  function commitCollectionName() {
    const name = els.abName.value.trim();
    const ids = [...selection];
    if (!ids.length) return null;
    const ts = new Date().toISOString();
    if (!name) {
      store.dispatch([{ op: 'collection.assign', ids, collectionId: null, ts }]);
      return null;
    }
    let col = store.state.collections.find((c) => c.name.toLowerCase() === name.toLowerCase());
    const ops = [];
    if (!col) {
      col = { id: randomId(), name };
      ops.push({ op: 'collection.create', id: col.id, name, ts });
    }
    ops.push({ op: 'collection.assign', ids, collectionId: col.id, ts });
    store.dispatch(ops);
    return col.id;
  }

  function fileSelection() {
    const ids = [...selection];
    if (!ids.length) return;
    const colId = commitCollectionName();
    const ts = new Date().toISOString();
    const ops = [];
    if (colId) {
      ops.push({ op: 'file', collectionId: colId, ids, ts });
    } else {
      ops.push({ op: 'file', ids, ts });
    }
    selection.clear();
    store.dispatch(ops, { kind: 'file' });
    showToast(`${ids.length === 1 ? '1 note' : `${ids.length} notes`} filed to memory`, {
      undo: () => store.dispatch(colId ? [{ op: 'restore', collectionId: colId, ids }] : [{ op: 'restore', ids }]),
    });
  }

  function wipe() {
    const targets = wipeTargets(store.state);
    if (!targets.noteIds.length) {
      showToast('Nothing to wipe — pinned notes stay');
      return;
    }
    store.dispatch([{ op: 'wipe', ts: new Date().toISOString() }], { kind: 'file' });
    showToast(`Board wiped — ${targets.noteIds.length} note${targets.noteIds.length === 1 ? '' : 's'} filed`, {
      undo: () => {
        store.dispatch([
          { op: 'restore', ids: targets.noteIds },
          ...targets.collectionIds.map((id) => ({ op: 'restore', collectionId: id })),
        ]);
      },
    });
  }

  // ------------------------------------------------------------------ create + edit

  function createNote({ text = '', at = null, sourceUrl = null } = {}) {
    const region = viewportWorldRect();
    const rects = boardNotes().map(noteRect);
    const spot = at || findFreeSlot(region, rects);
    const note = {
      id: randomId(),
      text: text || 'New note',
      x: spot.x,
      y: spot.y,
      sourceUrl,
    };
    store.dispatch([{ op: 'note.upsert', note }]);
    const saved = noteById(note.id);
    if (!saved) return;
    if (sourceUrl) {
      store.unfurl(sourceUrl).then((title) => {
        if (!title) return;
        const current = noteById(note.id);
        if (current) {
          store.dispatch([{ op: 'note.upsert', note: { ...current, sourceTitle: title, updatedAt: new Date().toISOString() } }]);
        }
      });
    }
    if (!text) startEditing(note.id, { selectAll: true });
  }

  function startEditing(id, { selectAll = false } = {}) {
    const el = cardEls.get(id);
    const note = noteById(id);
    if (!el || !note || editingId) return;
    editingId = id;
    const body = el.querySelector('.sn-card-body');
    el.classList.add('is-editing');
    body.contentEditable = 'plaintext-only';
    body.focus();
    const range = document.createRange();
    range.selectNodeContents(body);
    if (!selectAll) range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const finish = (cancel = false) => {
      body.contentEditable = 'false';
      el.classList.remove('is-editing');
      body.removeEventListener('blur', onBlur);
      body.removeEventListener('keydown', onKey);
      editingId = null;
      const text = cancel ? note.text : body.textContent.trim();
      if (!text) {
        store.dispatch([{ op: 'note.delete', ids: [id] }]);
        return;
      }
      if (text !== note.text) {
        store.dispatch([
          { op: 'note.upsert', note: { ...note, text, updatedAt: new Date().toISOString() } },
        ]);
      } else {
        body.textContent = note.text;
      }
      renderChips();
    };
    const onBlur = () => finish(false);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        body.textContent = note.text;
        finish(true);
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) finish(false);
    };
    body.addEventListener('blur', onBlur);
    body.addEventListener('keydown', onKey);
  }

  // ------------------------------------------------------------------ pointer machinery

  viewport.addEventListener('pointerdown', (e) => {
    if (editingId) return;
    const card = e.target.closest('.sn-card');
    const dot = e.target.closest('.sn-dot');
    const resize = e.target.closest('.sn-card-resize');
    const wantPan = spaceHeld || e.button === 1;

    if (wantPan) {
      drag = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: vp.panX, panY: vp.panY, pointerId: e.pointerId };
      viewport.setPointerCapture(e.pointerId);
      viewport.classList.add('is-panning');
      e.preventDefault();
      return;
    }

    if (dot && card) {
      const fromId = card.dataset.id;
      const ghost = document.createElementNS(SVG_NS, 'line');
      ghost.classList.add('sn-arrow-ghost');
      arrowLayer.appendChild(ghost);
      const from = noteRect(noteById(fromId));
      drag = { kind: 'arrow', fromId, ghost, from, pointerId: e.pointerId };
      viewport.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (resize && card) {
      const note = noteById(card.dataset.id);
      drag = {
        kind: 'resize', id: note.id, el: card, startX: e.clientX, startY: e.clientY,
        w: note.w, h: Math.max(note.h, card.offsetHeight), pointerId: e.pointerId, frame: 0,
      };
      viewport.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (card) {
      if (e.target.closest('button, a')) return;
      const id = card.dataset.id;
      if (e.shiftKey) {
        if (selection.has(id)) selection.delete(id);
        else selection.add(id);
        renderSelection();
        return;
      }
      if (!selection.has(id)) {
        selection.clear();
        selection.add(id);
        renderSelection();
      }
      const ids = [...selection];
      const origins = new Map(ids.map((nid) => {
        const n = noteById(nid);
        return [nid, { x: n.x, y: n.y }];
      }));
      const liveRects = new Map(ids.map((nid) => [nid, noteRect(noteById(nid))]));
      world.appendChild(card);
      drag = {
        kind: 'move', ids, origins, liveRects, startX: e.clientX, startY: e.clientY,
        moved: false, pointerId: e.pointerId, frame: 0, dx: 0, dy: 0,
      };
      viewport.setPointerCapture(e.pointerId);
      return;
    }

    // empty board → rubber band
    selection.clear();
    renderSelection();
    const start = toWorld(e);
    const rects = boardNotes().map((n) => ({ id: n.id, ...noteRect(n) }));
    drag = { kind: 'rubber', start, rects, pointerId: e.pointerId, startClient: { x: e.clientX, y: e.clientY } };
    viewport.setPointerCapture(e.pointerId);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.kind === 'pan') {
      vp.panX = drag.panX + (e.clientX - drag.startX);
      vp.panY = drag.panY + (e.clientY - drag.startY);
      applyViewport();
      return;
    }
    if (drag.kind === 'move') {
      const dx = (e.clientX - drag.startX) / vp.zoom;
      const dy = (e.clientY - drag.startY) / vp.zoom;
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
      drag.moved = true;
      drag.dx = dx;
      drag.dy = dy;
      if (drag.frame) return;
      drag.frame = requestAnimationFrame(() => {
        drag.frame = 0;
        if (!drag.origins) return;
        for (const [id, origin] of drag.origins) {
          const el = cardEls.get(id);
          if (el) {
            el.classList.add('is-dragging');
            el.style.willChange = 'transform';
            el.style.transform = `translate(${drag.dx}px, ${drag.dy}px)`;
          }
          const rect = drag.liveRects.get(id);
          rect.x = origin.x + drag.dx;
          rect.y = origin.y + drag.dy;
        }
        repathArrowsTouching(drag.ids, drag.liveRects);
      });
      return;
    }
    if (drag.kind === 'resize') {
      drag.dw = (e.clientX - drag.startX) / vp.zoom;
      drag.dh = (e.clientY - drag.startY) / vp.zoom;
      if (drag.frame) return;
      drag.frame = requestAnimationFrame(() => {
        drag.frame = 0;
        const w = clamp(drag.w + (drag.dw || 0), 160, 480);
        const h = Math.max(48, drag.h + (drag.dh || 0));
        drag.el.style.width = `${w}px`;
        drag.el.style.minHeight = `${h}px`;
        repathArrowsTouching([drag.id]);
      });
      return;
    }
    if (drag.kind === 'arrow') {
      const p = toWorld(e);
      const from = drag.from;
      drag.ghost.setAttribute('x1', from.x + from.w / 2);
      drag.ghost.setAttribute('y1', from.y + from.h / 2);
      drag.ghost.setAttribute('x2', p.x);
      drag.ghost.setAttribute('y2', p.y);
      return;
    }
    if (drag.kind === 'rubber') {
      const cur = toWorld(e);
      const box = {
        x: Math.min(drag.start.x, cur.x),
        y: Math.min(drag.start.y, cur.y),
        w: Math.abs(cur.x - drag.start.x),
        h: Math.abs(cur.y - drag.start.y),
      };
      rubber.hidden = false;
      const r = viewport.getBoundingClientRect();
      rubber.style.left = `${Math.min(drag.startClient.x, e.clientX) - r.left}px`;
      rubber.style.top = `${Math.min(drag.startClient.y, e.clientY) - r.top}px`;
      rubber.style.width = `${Math.abs(e.clientX - drag.startClient.x)}px`;
      rubber.style.height = `${Math.abs(e.clientY - drag.startClient.y)}px`;
      selection.clear();
      for (const rect of drag.rects) {
        if (rectsIntersect(box, rect)) selection.add(rect.id);
      }
      for (const [id, el] of cardEls) el.classList.toggle('is-selected', selection.has(id));
    }
  });

  function endDrag(e) {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const d = drag;
    drag = null;
    try {
      viewport.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (d.frame) cancelAnimationFrame(d.frame);
    if (d.kind === 'pan') {
      viewport.classList.remove('is-panning');
      saveViewport();
      return;
    }
    if (d.kind === 'move') {
      const ts = new Date().toISOString();
      const ops = [];
      for (const [id, origin] of d.origins) {
        const el = cardEls.get(id);
        if (el) {
          el.classList.remove('is-dragging');
          el.style.willChange = '';
          el.style.transform = '';
        }
        if (d.moved) ops.push({ op: 'note.move', id, x: origin.x + d.dx, y: origin.y + d.dy, ts });
      }
      if (ops.length) store.dispatch(ops);
      else renderActionBar();
      return;
    }
    if (d.kind === 'resize') {
      const w = clamp(d.w + (d.dw || 0), 160, 480);
      const h = Math.max(48, d.h + (d.dh || 0));
      store.dispatch([{ op: 'note.resize', id: d.id, w, h, ts: new Date().toISOString() }]);
      return;
    }
    if (d.kind === 'arrow') {
      d.ghost.remove();
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.sn-card');
      if (target && target.dataset.id !== d.fromId) {
        store.dispatch([
          { op: 'arrow.create', id: randomId(), fromId: d.fromId, toId: target.dataset.id, ts: new Date().toISOString() },
        ]);
      }
      return;
    }
    if (d.kind === 'rubber') {
      rubber.hidden = true;
      renderSelection();
    }
  }

  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const next = clamp(vp.zoom * factor, ZOOM_MIN, ZOOM_MAX);
        const r = viewport.getBoundingClientRect();
        const cx = e.clientX - r.left;
        const cy = e.clientY - r.top;
        vp.panX = cx - ((cx - vp.panX) / vp.zoom) * next;
        vp.panY = cy - ((cy - vp.panY) / vp.zoom) * next;
        vp.zoom = next;
      } else {
        vp.panX -= e.deltaX;
        vp.panY -= e.deltaY;
      }
      applyViewport();
      saveViewport();
    },
    { passive: false },
  );

  viewport.addEventListener('dblclick', (e) => {
    const card = e.target.closest('.sn-card');
    if (card) {
      if (!e.target.closest('a, button')) startEditing(card.dataset.id);
      return;
    }
    const p = toWorld(e);
    createNote({ at: { x: p.x - 110, y: p.y - 24 } });
  });

  // ------------------------------------------------------------------ zoom controls

  function zoomBy(factor) {
    const r = viewport.getBoundingClientRect();
    const cx = r.width / 2;
    const cy = r.height / 2;
    const next = clamp(vp.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    vp.panX = cx - ((cx - vp.panX) / vp.zoom) * next;
    vp.panY = cy - ((cy - vp.panY) / vp.zoom) * next;
    vp.zoom = next;
    applyViewport();
    saveViewport();
  }

  function zoomFit() {
    const rects = boardNotes().map(noteRect);
    const r = viewport.getBoundingClientRect();
    vp = fitViewport(rects, r.width, r.height);
    applyViewport();
    saveViewport();
  }

  // ------------------------------------------------------------------ keyboard

  function isTyping() {
    const el = document.activeElement;
    return (
      editingId ||
      (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable))
    );
  }

  function onKeyDown(e) {
    if (e.code === 'Space' && !isTyping()) {
      spaceHeld = true;
      viewport.classList.add('is-pan-ready');
    }
    if (isTyping()) return;
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      createNote();
    } else if (e.key === 'p' || e.key === 'P') {
      if (selection.size) {
        const allPinned = selectedNotes().every((n) => n.pinned);
        store.dispatch([{ op: 'note.pin', ids: [...selection], pinned: !allPinned, ts: new Date().toISOString() }]);
      }
    } else if (e.key === 'Escape') {
      selection.clear();
      renderSelection();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size) {
      e.preventDefault();
      fileSelection();
    }
  }

  function onKeyUp(e) {
    if (e.code === 'Space') {
      spaceHeld = false;
      viewport.classList.remove('is-pan-ready');
    }
  }

  function onPaste(e) {
    if (isTyping()) return;
    const text = e.clipboardData?.getData('text/plain')?.trim();
    if (!text) return;
    e.preventDefault();
    if (isLoneUrl(text)) createNote({ text, sourceUrl: text });
    else createNote({ text });
  }

  // ------------------------------------------------------------------ store notifications

  store.subscribe((kind, ops, state) => {
    if (kind === 'reset') {
      fullRender();
      applyViewport();
      return;
    }
    let chipsDirty = false;
    let arrowsDirty = false;
    for (const op of ops) {
      switch (op.op) {
        case 'note.upsert': {
          const note = state.notes.find((n) => n.id === op.note?.id);
          if (!note) break;
          if (note.status === 'board') renderCard(note);
          else removeCard(note.id);
          chipsDirty = true;
          arrowsDirty = true;
          break;
        }
        case 'note.move':
        case 'note.resize': {
          const note = state.notes.find((n) => n.id === op.id);
          if (note && cardEls.has(note.id)) renderCard(note);
          chipsDirty = true;
          arrowsDirty = true;
          break;
        }
        case 'note.pin':
        case 'note.categorize':
        case 'collection.assign':
          for (const id of op.ids || []) {
            const note = state.notes.find((n) => n.id === id);
            if (note && cardEls.has(id)) renderCard(note);
          }
          chipsDirty = true;
          break;
        case 'note.delete':
          for (const id of op.ids || []) removeCard(id);
          chipsDirty = true;
          arrowsDirty = true;
          break;
        case 'arrow.create':
        case 'arrow.delete':
          arrowsDirty = true;
          break;
        case 'collection.create':
        case 'collection.rename':
        case 'collection.delete':
          chipsDirty = true;
          break;
        case 'file':
        case 'wipe': {
          const animate = kind === 'file';
          for (const id of [...cardEls.keys()]) {
            const note = state.notes.find((n) => n.id === id);
            if (!note || note.status !== 'board') removeCard(id, { animate });
          }
          chipsDirty = true;
          arrowsDirty = true;
          break;
        }
        case 'restore':
          for (const note of state.notes) {
            if (note.status === 'board' && !cardEls.has(note.id)) renderCard(note);
          }
          chipsDirty = true;
          arrowsDirty = true;
          break;
        default:
          break;
      }
    }
    if (arrowsDirty) renderArrows();
    if (chipsDirty) renderChips();
    renderSelection();
    renderEmpty();
  });

  // ------------------------------------------------------------------ wiring + public API

  els.abPin.addEventListener('click', () => {
    const allPinned = selectedNotes().every((n) => n.pinned);
    store.dispatch([{ op: 'note.pin', ids: [...selection], pinned: !allPinned, ts: new Date().toISOString() }]);
  });
  els.abIcon.addEventListener('click', () => {
    els.abIconPop.hidden = !els.abIconPop.hidden;
  });
  els.abName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitCollectionName();
      els.abName.blur();
    }
  });
  els.abName.addEventListener('change', () => commitCollectionName());
  els.abFile.addEventListener('click', fileSelection);

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('paste', onPaste);

  fullRender();
  applyViewport();

  return {
    createNote,
    wipe,
    zoomIn: () => zoomBy(1.2),
    zoomOut: () => zoomBy(1 / 1.2),
    zoomFit,
    refresh: fullRender,
    clearSelection: () => {
      selection.clear();
      renderSelection();
    },
  };
}
