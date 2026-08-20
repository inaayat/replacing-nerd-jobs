/**
 * Sticky Notes board — pannable/zoomable canvas, drag, resize, rubber-band
 * selection, arrows, note chrome, filing animations.
 *
 * Two tiers of chrome (docs/sticky-notes-plan.md):
 *   1. The edit bar rides the note being edited, in screen space, and exists
 *      only while that note is open. Idle notes are just notes.
 *   2. The selection bar is docked at the bottom of the canvas and appears
 *      only when something is selected.
 *
 * Performance rules (§4.8): drag/pan/zoom write one transform per rAF; no full
 * re-renders after initial paint — store notifications patch only the touched
 * cards.
 */
import {
  COLOR_KEYS,
  ICON_KEYS,
  ICON_SVGS,
  PIN_SVG,
  TAG_SVG,
  TRASH_SVG,
  VIEWPORT_KEY,
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
  zoomAt,
} from './notes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Touch fingers wobble; a mouse does not.
const SLOP_MOUSE = 4;
const SLOP_TOUCH = 8;
const LONG_PRESS_MS = 400;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_PX = 28;

export function createBoard({ store, els, showToast, onEdit }) {
  const { viewport, world, arrowLayer, rubber, empty, actionbar, editbar } = els;

  let vp = loadViewport();
  let vpFrame = 0;
  const cardEls = new Map(); // note id -> element
  const chipEls = new Map(); // collection id -> element
  const selection = new Set();
  let spaceHeld = false;
  let drag = null; // { kind: 'move'|'pan'|'rubber'|'resize'|'arrow'|'pinch', ... }
  let editingId = null;
  let endEdit = null; // commit/cancel the open edit from outside startEditing

  const pointers = new Map(); // live pointerId -> client point, for pinch
  let longPressTimer = 0;
  let selectMode = false; // touch: long-press opened a multi-select session
  let lastTap = null;
  let lastPointerType = 'mouse';

  const coarse = () => window.matchMedia('(pointer: coarse)').matches;

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
        return { panX: raw.panX, panY: raw.panY, zoom: clamp(raw.zoom, 0.4, 2) };
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
      positionEditBar();
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

  /**
   * The slice of the window the user can actually see. A phone keyboard eats
   * the bottom of the visual viewport without changing the layout viewport,
   * so every "is this on screen" question has to ask visualViewport.
   */
  function visibleBounds() {
    const vv = window.visualViewport;
    if (!vv) return { top: 0, bottom: window.innerHeight };
    return { top: vv.offsetTop, bottom: vv.offsetTop + vv.height };
  }

  function keyboardInset() {
    const vv = window.visualViewport;
    if (!vv) return 0;
    return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
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
      chip.innerHTML = `${TAG_SVG}<span></span>`;
      chip.querySelector('span').textContent = col.name;
      chip.title = `Collection “${col.name}” — ${rects.length} note${rects.length === 1 ? '' : 's'}. Select them all, then File to send the collection to memory.`;
      chip.style.left = `${box.x}px`;
      chip.style.top = `${box.y - 30}px`;
      chip.addEventListener('pointerdown', (e) => e.stopPropagation());
      chip.addEventListener('click', () => {
        if (editingId) endEdit?.(false);
        selection.clear();
        for (const n of boardNotes()) if (n.collectionId === col.id) selection.add(n.id);
        // On touch this is the entry point to multi-select, so stay in it.
        if (coarse()) setSelectMode(true);
        renderSelection();
      });
      world.appendChild(chip);
      chipEls.set(col.id, chip);
    }
  }

  // ------------------------------------------------------------------ selection + bars

  function renderSelection() {
    for (const [id, el] of cardEls) el.classList.toggle('is-selected', selection.has(id));
    renderActionBar();
  }

  function selectedNotes() {
    return [...selection].map(noteById).filter(Boolean);
  }

  function setSelectMode(on) {
    selectMode = on;
    viewport.classList.toggle('is-selecting', on);
  }

  function exitSelectMode() {
    if (!selectMode) return;
    setSelectMode(false);
    selection.clear();
    renderSelection();
  }

  /** Tier 2 — docked at the bottom of the canvas whenever a selection exists. */
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
      b.setAttribute('aria-label', `Colour: ${legendLabel(store.state.legend, 'color', key)}`);
      b.setAttribute('aria-pressed', String(key === activeColor));
      onPress(b, () => {
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
      onPress(b, () => {
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
    els.abHint.hidden = !selectMode;
    if (selectMode) els.abHint.textContent = 'Tap more notes to add · tap the board when you’re done';
  }

  /** Keep the docked bar above a phone keyboard while the collection input is live. */
  function liftActionBar() {
    const lift = document.activeElement === els.abName ? keyboardInset() : 0;
    actionbar.style.bottom = lift ? `${lift + 12}px` : '';
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
    setSelectMode(false);
    store.dispatch(ops, { kind: 'file' });
    showToast(`${ids.length === 1 ? '1 note' : `${ids.length} notes`} filed to memory`, {
      undo: () => store.dispatch(colId ? [{ op: 'restore', collectionId: colId, ids }] : [{ op: 'restore', ids }]),
    });
  }

  /**
   * The board's one destructive action. `note.delete` really removes the rows
   * — filing only moves them to memory — so it leans on a 10s undo rather than
   * a confirm dialog. Undo re-upserts the notes and redraws their arrows.
   */
  function deleteNotes(ids) {
    const notes = ids.map(noteById).filter(Boolean);
    if (!notes.length) return;
    const gone = new Set(notes.map((n) => n.id));
    const arrows = store.state.arrows.filter((a) => gone.has(a.fromId) || gone.has(a.toId));
    if (editingId && gone.has(editingId)) endEdit?.(true);
    for (const id of gone) selection.delete(id);
    store.dispatch([{ op: 'note.delete', ids: [...gone] }]);
    renderSelection();
    showToast(notes.length === 1 ? 'Note deleted' : `${notes.length} notes deleted`, {
      ms: 10000,
      undo: () => {
        store.dispatch([
          ...notes.map((note) => ({ op: 'note.upsert', note })),
          ...arrows.map((a) => ({
            op: 'arrow.create', id: a.id, fromId: a.fromId, toId: a.toId, ts: a.createdAt,
          })),
        ]);
      },
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

  // ------------------------------------------------------------------ edit bar (tier 1)

  function renderEditBar() {
    const note = editingId ? noteById(editingId) : null;
    if (!note) {
      editbar.hidden = true;
      els.ebPalette.hidden = true;
      return;
    }
    editbar.hidden = false;
    els.ebPin.setAttribute('aria-pressed', String(note.pinned));
    els.ebPin.title = note.pinned ? 'Unpin' : 'Pin — survives a wipe';
    const dot = els.ebColor.querySelector('.sn-eb-dot');
    dot.style.background = note.colorKey ? colorHex(note.colorKey) : 'transparent';
    els.ebColor.title = note.colorKey
      ? `Colour: ${legendLabel(store.state.legend, 'color', note.colorKey)}`
      : 'Colour';
    if (!els.ebPalette.hidden) renderPalette(note);
    positionEditBar();
  }

  function renderPalette(note) {
    els.ebPalette.innerHTML = '';
    for (const key of COLOR_KEYS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sn-eb-swatch';
      b.style.background = colorHex(key);
      const label = legendLabel(store.state.legend, 'color', key);
      b.title = label;
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', String(note.colorKey === key));
      onPress(b, () => {
        store.dispatch([
          {
            op: 'note.categorize',
            ids: [note.id],
            colorKey: note.colorKey === key ? null : key,
            ts: new Date().toISOString(),
          },
        ]);
        els.ebPalette.hidden = true;
      });
      els.ebPalette.appendChild(b);
    }
  }

  function positionEditBar() {
    if (editbar.hidden || !editingId) return;
    const el = cardEls.get(editingId);
    if (!el) return;
    const card = el.getBoundingClientRect();
    const vr = viewport.getBoundingClientRect();
    const seen = visibleBounds();
    const w = editbar.offsetWidth || 124;
    const h = editbar.offsetHeight || 32;
    const minTop = Math.max(vr.top, seen.top) + 4;
    const maxTop = Math.min(vr.bottom, seen.bottom) - h - 4;
    let top = card.top - h - 8;
    if (top < minTop) top = card.bottom + 8;
    editbar.style.top = `${clamp(top, minTop, Math.max(minTop, maxTop))}px`;
    editbar.style.left = `${clamp(
      card.left + card.width / 2 - w / 2,
      vr.left + 4,
      Math.max(vr.left + 4, vr.right - w - 4),
    )}px`;
  }

  /**
   * Keep the note being typed into on screen. On touch the keyboard claims the
   * bottom half, so the note is pulled into the top third of what is left.
   */
  function revealCard(el) {
    const vr = viewport.getBoundingClientRect();
    const seen = visibleBounds();
    const top = Math.max(vr.top, seen.top) + 44; // room for the edit bar above
    const bottom = Math.min(vr.bottom, seen.bottom) - 12;
    const card = el.getBoundingClientRect();
    if (card.top >= top && card.bottom <= bottom) return;
    // Touch parks the note near the top of what the keyboard leaves visible;
    // a mouse gets the smallest nudge that brings it fully into view.
    let dy = top - card.top;
    if (!coarse()) {
      dy = card.bottom > bottom ? bottom - card.bottom : 0;
      if (card.top + dy < top) dy = top - card.top;
    }
    if (!dy) return;
    vp.panY += dy;
    applyViewport();
    saveViewport();
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

  /** Caret at a screen point, across the two vendor spellings of the API. */
  function caretRangeAt(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (!pos) return null;
      const range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
      return range;
    }
    return null;
  }

  function startEditing(id, { selectAll = false, caretAt = null } = {}) {
    const el = cardEls.get(id);
    const note = noteById(id);
    if (!el || !note || editingId) return;
    editingId = id;
    const body = el.querySelector('.sn-card-body');
    el.classList.add('is-editing');
    try {
      body.contentEditable = 'plaintext-only';
    } catch {
      body.contentEditable = 'true';
    }
    body.focus();
    let range = caretAt ? caretRangeAt(caretAt.x, caretAt.y) : null;
    if (!range || !body.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(body);
      if (!selectAll) range.collapse(false);
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    renderEditBar();
    revealCard(el);
    onEdit?.();

    // The phone keyboard slides in after focus, so re-measure when it lands.
    const onVisualResize = () => {
      revealCard(el);
      positionEditBar();
      liftActionBar();
    };
    window.visualViewport?.addEventListener('resize', onVisualResize);
    window.visualViewport?.addEventListener('scroll', onVisualResize);

    const finish = (cancel = false) => {
      body.contentEditable = 'false';
      el.classList.remove('is-editing');
      body.removeEventListener('blur', onBlur);
      body.removeEventListener('keydown', onKey);
      window.visualViewport?.removeEventListener('resize', onVisualResize);
      window.visualViewport?.removeEventListener('scroll', onVisualResize);
      editingId = null;
      endEdit = null;
      els.ebPalette.hidden = true;
      editbar.hidden = true;
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
    endEdit = finish;
    const onBlur = (e) => {
      // Chrome buttons keep focus by cancelling mousedown; anything that does
      // reach here (tab away, tap elsewhere) commits.
      if (e.relatedTarget && (editbar.contains(e.relatedTarget) || actionbar.contains(e.relatedTarget))) return;
      finish(false);
    };
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

  function clearLongPress() {
    if (!longPressTimer) return;
    clearTimeout(longPressTimer);
    longPressTimer = 0;
  }

  /** Drop an in-flight gesture without committing it (a second finger landed). */
  function abortDrag() {
    if (!drag) return;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    if (drag.kind === 'move' && drag.origins) {
      for (const id of drag.origins.keys()) {
        const el = cardEls.get(id);
        if (!el) continue;
        el.classList.remove('is-dragging');
        el.style.willChange = '';
        el.style.transform = '';
      }
    }
    if (drag.kind === 'arrow') drag.ghost.remove();
    if (drag.kind === 'rubber') rubber.hidden = true;
    viewport.classList.remove('is-panning');
    drag = null;
  }

  /** Pointer capture is best-effort: a synthetic or already-released pointer throws. */
  function capturePointer(e) {
    try {
      viewport.setPointerCapture(e.pointerId);
    } catch {
      /* the gesture still works without capture */
    }
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  /**
   * Chrome buttons act on pointerdown, with the default prevented, so pressing
   * one never moves focus out of the note being edited — a blur would commit
   * the edit and tear the bar down before the press resolved. `click` stays
   * bound for keyboard activation, guarded against firing twice.
   */
  function onPress(el, handler) {
    let pressedAt = 0;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pressedAt = performance.now();
      handler(e);
    });
    el.addEventListener('click', (e) => {
      e.preventDefault();
      if (performance.now() - pressedAt < 700) return;
      handler(e);
    });
  }

  viewport.addEventListener('pointerdown', (e) => {
    lastPointerType = e.pointerType;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two fingers: pinch to zoom, wherever they landed.
    if (e.pointerType === 'touch' && pointers.size === 2) {
      clearLongPress();
      abortDrag();
      const [a, b] = [...pointers.values()];
      drag = { kind: 'pinch', lastDist: dist(a, b), lastMid: mid(a, b) };
      return;
    }
    if (pointers.size > 1) return;

    const card = e.target.closest('.sn-card');
    if (editingId) {
      // Inside the note being edited the pointer belongs to the caret and to
      // native text selection. Anywhere else commits, then behaves normally —
      // so the next click lands where the user aimed it.
      if (card && card.dataset.id === editingId) return;
      endEdit?.(false);
    }

    const touch = e.pointerType === 'touch';
    const dot = e.target.closest('.sn-dot');
    const resize = e.target.closest('.sn-card-resize');
    const wantPan = spaceHeld || e.button === 1;

    if (wantPan) {
      drag = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: vp.panX, panY: vp.panY, pointerId: e.pointerId };
      capturePointer(e);
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
      capturePointer(e);
      e.preventDefault();
      return;
    }

    if (resize && card) {
      const note = noteById(card.dataset.id);
      drag = {
        kind: 'resize', id: note.id, el: card, startX: e.clientX, startY: e.clientY,
        w: note.w, h: Math.max(note.h, card.offsetHeight), pointerId: e.pointerId, frame: 0,
      };
      capturePointer(e);
      e.preventDefault();
      return;
    }

    if (card) {
      if (e.target.closest('button, a')) return;
      const id = card.dataset.id;

      // Shift-click, or a tap during a touch selection session, toggles membership.
      if (e.shiftKey || (touch && selectMode)) {
        if (selection.has(id)) selection.delete(id);
        else selection.add(id);
        renderSelection();
        return;
      }

      // A mouse click selects as it presses; a tap does not, so tapping to type
      // never summons the selection bar.
      if (!touch && !selection.has(id)) {
        selection.clear();
        selection.add(id);
        renderSelection();
      }

      const ids = selection.has(id) ? [...selection] : [id];
      const origins = new Map(ids.map((nid) => {
        const n = noteById(nid);
        return [nid, { x: n.x, y: n.y }];
      }));
      const liveRects = new Map(ids.map((nid) => [nid, noteRect(noteById(nid))]));
      world.appendChild(card);
      drag = {
        kind: 'move', id, ids, origins, liveRects, startX: e.clientX, startY: e.clientY,
        moved: false, pointerId: e.pointerId, frame: 0, dx: 0, dy: 0,
        slop: touch ? SLOP_TOUCH : SLOP_MOUSE,
        // A press that never becomes a drag is a request to type.
        wantsEdit: e.button === 0,
      };
      capturePointer(e);
      if (touch) {
        longPressTimer = setTimeout(() => {
          longPressTimer = 0;
          if (!drag || drag.kind !== 'move' || drag.moved) return;
          drag.wantsEdit = false;
          setSelectMode(true);
          selection.clear();
          selection.add(id);
          renderSelection();
        }, LONG_PRESS_MS);
      }
      return;
    }

    // Empty board. Touch drags the canvas; the mouse rubber-band selects.
    if (touch) {
      drag = {
        kind: 'pan', startX: e.clientX, startY: e.clientY, panX: vp.panX, panY: vp.panY,
        pointerId: e.pointerId, fromEmpty: true, moved: false,
      };
      capturePointer(e);
      return;
    }
    selection.clear();
    renderSelection();
    const start = toWorld(e);
    const rects = boardNotes().map((n) => ({ id: n.id, ...noteRect(n) }));
    drag = { kind: 'rubber', start, rects, pointerId: e.pointerId, startClient: { x: e.clientX, y: e.clientY } };
    capturePointer(e);
  });

  viewport.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (drag?.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const nextDist = dist(a, b);
      const nextMid = mid(a, b);
      const r = viewport.getBoundingClientRect();
      if (drag.lastDist > 0) {
        vp = zoomAt(vp, { x: nextMid.x - r.left, y: nextMid.y - r.top }, nextDist / drag.lastDist);
      }
      vp.panX += nextMid.x - drag.lastMid.x;
      vp.panY += nextMid.y - drag.lastMid.y;
      drag.lastDist = nextDist;
      drag.lastMid = nextMid;
      applyViewport();
      return;
    }

    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.kind === 'pan') {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > SLOP_TOUCH) drag.moved = true;
      vp.panX = drag.panX + (e.clientX - drag.startX);
      vp.panY = drag.panY + (e.clientY - drag.startY);
      applyViewport();
      return;
    }
    if (drag.kind === 'move') {
      const dx = (e.clientX - drag.startX) / vp.zoom;
      const dy = (e.clientY - drag.startY) / vp.zoom;
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < drag.slop) return;
      clearLongPress();
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

  function tappedEmptyBoard(e) {
    if (selectMode) {
      exitSelectMode();
      lastTap = null;
      return;
    }
    const now = performance.now();
    if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && dist(lastTap, { x: e.clientX, y: e.clientY }) < DOUBLE_TAP_PX) {
      lastTap = null;
      const p = toWorld(e);
      createNote({ at: { x: p.x - 110, y: p.y - 24 } });
      return;
    }
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    if (selection.size) {
      selection.clear();
      renderSelection();
    }
  }

  function endDrag(e) {
    pointers.delete(e.pointerId);
    clearLongPress();

    if (drag?.kind === 'pinch') {
      if (pointers.size < 2) {
        drag = null;
        saveViewport();
      }
      return;
    }
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
      if (d.fromEmpty && !d.moved) tappedEmptyBoard(e);
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
      if (!d.moved && d.wantsEdit) {
        // A press that went nowhere: type into the note under the pointer.
        if (selection.size > 1) {
          selection.clear();
          selection.add(d.id);
          renderSelection();
        }
        startEditing(d.id, { caretAt: { x: e.clientX, y: e.clientY } });
      }
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
      const r = viewport.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        vp = zoomAt(vp, { x: e.clientX - r.left, y: e.clientY - r.top }, Math.exp(-e.deltaY * 0.0015));
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
    // Touch double-taps are handled by tappedEmptyBoard; browsers also synthesise
    // dblclick from them, which would create the note twice.
    if (lastPointerType === 'touch') return;
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
    vp = zoomAt(vp, { x: r.width / 2, y: r.height / 2 }, factor);
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

  /** Bring restored notes into view and flash them, so a Restore is visible. */
  function revealNotes(ids) {
    const rects = ids
      .map(noteById)
      .filter((n) => n && n.status === 'board')
      .map(noteRect);
    if (!rects.length) return;
    const box = bbox(rects);
    const r = viewport.getBoundingClientRect();
    vp.panX = r.width / 2 - (box.x + box.w / 2) * vp.zoom;
    vp.panY = r.height / 2 - (box.y + box.h / 2) * vp.zoom;
    applyViewport();
    saveViewport();
    for (const id of ids) {
      const el = cardEls.get(id);
      if (!el) continue;
      el.classList.remove('is-pulsing');
      void el.offsetWidth;
      el.classList.add('is-pulsing');
      setTimeout(() => el.classList.remove('is-pulsing'), 950);
    }
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
      setSelectMode(false);
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
    if (editingId) renderEditBar();
  });

  // ------------------------------------------------------------------ wiring + public API

  // Chrome sits inside the canvas, so its presses must not reach the board.
  for (const el of [actionbar, els.hintStrip].filter(Boolean)) {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  onPress(els.abPin, () => {
    const allPinned = selectedNotes().every((n) => n.pinned);
    store.dispatch([{ op: 'note.pin', ids: [...selection], pinned: !allPinned, ts: new Date().toISOString() }]);
  });
  onPress(els.abIcon, () => {
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
  els.abName.addEventListener('focus', liftActionBar);
  els.abName.addEventListener('blur', () => {
    actionbar.style.bottom = '';
  });
  onPress(els.abFile, fileSelection);

  els.ebTrash.innerHTML = TRASH_SVG;
  els.ebPin.innerHTML = PIN_SVG;
  onPress(els.ebTrash, () => deleteNotes([editingId]));
  onPress(els.ebPin, () => {
    const note = noteById(editingId);
    if (!note) return;
    store.dispatch([{ op: 'note.pin', ids: [note.id], pinned: !note.pinned, ts: new Date().toISOString() }]);
  });
  onPress(els.ebColor, () => {
    const note = noteById(editingId);
    if (!note) return;
    els.ebPalette.hidden = !els.ebPalette.hidden;
    if (!els.ebPalette.hidden) renderPalette(note);
  });
  onPress(els.ebDone, () => endEdit?.(false));

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('paste', onPaste);
  window.addEventListener('resize', () => {
    positionEditBar();
    liftActionBar();
  });
  window.visualViewport?.addEventListener('resize', liftActionBar);

  fullRender();
  applyViewport();

  return {
    createNote,
    wipe,
    zoomIn: () => zoomBy(1.2),
    zoomOut: () => zoomBy(1 / 1.2),
    zoomFit,
    revealNotes,
    refresh: fullRender,
    /** Called when the board becomes visible again — layout may have changed. */
    relayout: () => {
      positionEditBar();
      liftActionBar();
    },
    clearSelection: () => {
      setSelectMode(false);
      selection.clear();
      renderSelection();
    },
  };
}
