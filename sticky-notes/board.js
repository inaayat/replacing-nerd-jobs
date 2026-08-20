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
  BOOK_SVG,
  BOLD_SVG,
  BULLET_LIST_SVG,
  COLOR_KEYS,
  DEFAULT_COLOR_KEY,
  ICON_KEYS,
  ICON_SVGS,
  LINK_SVG,
  NUMBER_LIST_SVG,
  PIN_SVG,
  TAG_SVG,
  TRASH_SVG,
  VIEWPORT_KEY,
  applyOps,
  arrowEndpoints,
  bbox,
  blankNote,
  clamp,
  colorHex,
  emptyState,
  findFreeSlot,
  fitViewport,
  isLoneUrl,
  keyboardInset as visualKeyboardInset,
  legendLabel,
  noteBlocks,
  planEditSession,
  randomId,
  rectsIntersect,
  richToText,
  screenToWorld,
  urlDomain,
  visibleSlice,
  wipeTargets,
  zoomAt,
} from './notes.js';
import { attachBodyEditor, renderBody } from './body.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Touch fingers wobble; a mouse does not.
const SLOP_MOUSE = 4;
const SLOP_TOUCH = 8;
const LONG_PRESS_MS = 400;
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_PX = 28;

export function createBoard({ store, els, showToast, onEdit, onOpenWiki }) {
  const { viewport, world, arrowLayer, rubber, empty, actionbar, editbar } = els;

  let vp = loadViewport();
  let vpFrame = 0;
  const cardEls = new Map(); // note id -> element
  const bodyStamps = new Map(); // note id -> serialized body last painted
  const chipEls = new Map(); // collection id -> element
  const inkEls = new Map(); // board-ink id -> element
  const selection = new Set();
  let spaceHeld = false;
  let drag = null; // { kind: 'move'|'pan'|'rubber'|'resize'|'arrow'|'pinch'|'ink', ... }
  let editingId = null;
  let endEdit = null; // commit/cancel the open edit from outside startEditing
  let bodyEditor = null;
  let draft = null; // the blank note being composed; not in the store yet
  let inkEditingId = null;
  let endInkEdit = null;
  let textMode = false; // the pen is armed: the next press writes on the board

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
    if (draft && draft.id === id) return draft;
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

  function clientToWorld(clientX, clientY) {
    const r = viewport.getBoundingClientRect();
    return screenToWorld({ x: clientX - r.left, y: clientY - r.top }, vp);
  }

  function containsClientPoint(clientX, clientY) {
    if (viewport.hidden || viewport.closest('[hidden]')) return false;
    const r = viewport.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return false;
    return clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom;
  }

  /**
   * The slice of the window the user can actually see. A phone keyboard eats
   * the bottom of the visual viewport without changing the layout viewport,
   * so every "is this on screen" question has to ask visualViewport.
   */
  function visibleBounds() {
    return visibleSlice(window.visualViewport, window.innerHeight);
  }

  function keyboardInset() {
    return visualKeyboardInset(window.visualViewport, window.innerHeight);
  }

  function focusWithoutScroll(el) {
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }

  function setEditingChrome(on) {
    onEdit?.(Boolean(on));
  }

  function editSessionPlan(el, barH) {
    const card = el.getBoundingClientRect();
    return planEditSession({
      card: { top: card.top, bottom: card.bottom, left: card.left, width: card.width },
      barW: editbar.hidden ? 0 : editbar.offsetWidth || 0,
      barH,
      canvas: viewport.getBoundingClientRect(),
      visible: visibleBounds(),
      phone: coarse(),
    });
  }

  // ------------------------------------------------------------------ cards

  function renderCard(note) {
    let el = cardEls.get(note.id);
    if (!el) {
      el = document.createElement('article');
      el.className = 'sn-card';
      el.dataset.id = note.id;
      el.innerHTML = `
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
    // The colour is the card, not a stripe on it.
    el.style.setProperty('--note-fill', note.colorKey ? colorHex(note.colorKey) : '');
    const icon = el.querySelector('.sn-card-icon');
    icon.innerHTML = note.iconKey ? ICON_SVGS[note.iconKey] : '';
    icon.title = note.iconKey ? legendLabel(store.state.legend, 'icon', note.iconKey) : '';
    const body = el.querySelector('.sn-card-body');
    if (note.id !== editingId) {
      const blocks = noteBlocks(note);
      const stamp = JSON.stringify(blocks);
      if (bodyStamps.get(note.id) !== stamp) {
        renderBody(body, blocks);
        bodyStamps.set(note.id, stamp);
      }
    }
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
    bodyStamps.delete(id);
    selection.delete(id);
    if (animate) {
      el.classList.add('is-filing');
      setTimeout(() => el.remove(), 230);
    } else {
      el.remove();
    }
  }

  function fullRender() {
    discardDraft();
    for (const el of cardEls.values()) el.remove();
    cardEls.clear();
    bodyStamps.clear();
    selection.clear();
    for (const note of boardNotes()) renderCard(note);
    renderArrows();
    renderChips();
    renderAllInk();
    renderSelection();
    renderEmpty();
  }

  function renderEmpty() {
    empty.hidden = cardEls.size > 0 || inkEls.size > 0;
  }

  // ------------------------------------------------------------------ board ink
  //
  // Text written on the board itself: a label over a cluster, a word between
  // two arrows. It is not a note — no card, no colour, no pin, and it never
  // reaches memory. A wipe takes it away with the arrangement it described.

  function inkById(id) {
    return (store.state.ink || []).find((i) => i.id === id);
  }

  function renderInk(ink) {
    let el = inkEls.get(ink.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'sn-ink';
      el.dataset.ink = ink.id;
      world.appendChild(el);
      inkEls.set(ink.id, el);
    }
    el.style.left = `${ink.x}px`;
    el.style.top = `${ink.y}px`;
    if (ink.id !== inkEditingId && el.textContent !== ink.text) el.textContent = ink.text;
    return el;
  }

  function removeInk(id) {
    const el = inkEls.get(id);
    if (!el) return;
    inkEls.delete(id);
    el.remove();
  }

  function renderAllInk() {
    for (const el of inkEls.values()) el.remove();
    inkEls.clear();
    for (const ink of store.state.ink || []) renderInk(ink);
  }

  /** Arm the pen: the next press on empty board writes there. */
  function setTextMode(on) {
    textMode = Boolean(on);
    viewport.classList.toggle('is-writing', textMode);
    els.addText?.setAttribute('aria-pressed', String(textMode));
  }

  function createInk(at) {
    const ink = { id: randomId(), text: 'Text', x: at.x, y: at.y };
    store.dispatch([{ op: 'ink.upsert', ink }]);
    if (inkById(ink.id)) startEditingInk(ink.id, { selectAll: true });
  }

  function startEditingInk(id, { selectAll = false, caretAt = null } = {}) {
    const el = inkEls.get(id);
    const ink = inkById(id);
    if (!el || !ink || inkEditingId) return;
    if (editingId) endEdit?.(false);
    inkEditingId = id;
    el.classList.add('is-editing');
    try {
      el.contentEditable = 'plaintext-only';
    } catch {
      el.contentEditable = 'true';
    }
    focusWithoutScroll(el);
    let range = caretAt ? caretRangeAt(caretAt.x, caretAt.y) : null;
    if (!range || !el.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(el);
      if (!selectAll) range.collapse(false);
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    setEditingChrome(true);
    revealCard(el);

    const onVisualResize = () => revealCard(el);
    window.visualViewport?.addEventListener('resize', onVisualResize);
    window.visualViewport?.addEventListener('scroll', onVisualResize);

    const finish = (cancel = false) => {
      el.contentEditable = 'false';
      el.classList.remove('is-editing');
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKey);
      window.visualViewport?.removeEventListener('resize', onVisualResize);
      window.visualViewport?.removeEventListener('scroll', onVisualResize);
      setEditingChrome(false);
      inkEditingId = null;
      endInkEdit = null;
      const current = inkById(id) || ink;
      const text = cancel ? current.text : el.textContent.trim();
      if (!text) {
        store.dispatch([{ op: 'ink.delete', ids: [id] }]);
        return;
      }
      if (text !== current.text) {
        store.dispatch([
          { op: 'ink.upsert', ink: { ...current, text, updatedAt: new Date().toISOString() } },
        ]);
      } else {
        el.textContent = current.text;
      }
    };
    endInkEdit = finish;
    const onBlur = () => finish(false);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        finish(true);
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) finish(false);
    };
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);
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
      const chip = document.createElement('div');
      chip.className = 'sn-chip';
      chip.style.left = `${box.x}px`;
      chip.style.top = `${box.y - 30}px`;
      chip.addEventListener('pointerdown', (e) => e.stopPropagation());
      const nameBtn = document.createElement('button');
      nameBtn.type = 'button';
      nameBtn.className = 'sn-chip-name';
      nameBtn.innerHTML = `${TAG_SVG}<span></span>`;
      nameBtn.querySelector('span').textContent = col.name;
      nameBtn.title = `Collection “${col.name}” — ${rects.length} note${rects.length === 1 ? '' : 's'}. Select them all, then File to send the collection to memory.`;
      nameBtn.addEventListener('click', () => {
        if (editingId) endEdit?.(false);
        selection.clear();
        for (const n of boardNotes()) if (n.collectionId === col.id) selection.add(n.id);
        // On touch this is the entry point to multi-select, so stay in it.
        if (coarse()) setSelectMode(true);
        renderSelection();
      });
      const wikiBtn = document.createElement('button');
      wikiBtn.type = 'button';
      wikiBtn.className = 'sn-chip-wiki';
      wikiBtn.innerHTML = `${BOOK_SVG}<span>Page</span>`;
      wikiBtn.setAttribute('aria-label', 'Page');
      wikiBtn.title = 'Page';
      wikiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onOpenWiki?.(col.id);
      });
      chip.append(nameBtn, wikiBtn);
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

  /**
   * Every note on the board at once. Board ink is not a note — it has no
   * status and cannot be filed — so it stays out of the selection; a wipe is
   * what clears it.
   */
  function selectAll() {
    if (editingId) endEdit?.(false);
    if (inkEditingId) endInkEdit?.(false);
    const notes = boardNotes();
    if (!notes.length) {
      showToast('Nothing on the board to select');
      return;
    }
    selection.clear();
    for (const note of notes) selection.add(note.id);
    // On touch this is an entry point to multi-select, so stay in it: the next
    // tap should take a note out of the selection, not open it for typing.
    if (coarse()) setSelectMode(true);
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
    if (els.abPage) {
      els.abPage.hidden = !col;
      if (col) {
        els.abPage.title = `Open the page for “${col.name}”`;
        els.abPage.setAttribute('aria-label', `Open page for ${col.name}`);
      }
    }
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

  /**
   * The discard path for a selection, next to File. Filing keeps the notes in
   * memory; this throws them away, so it is the same 10s undo the per-note
   * trash uses.
   */
  function deleteSelection() {
    const ids = [...selection];
    if (!ids.length) return;
    setSelectMode(false);
    deleteNotes(ids);
  }

  function wipe() {
    const targets = wipeTargets(store.state);
    if (!targets.noteIds.length && !targets.ink.length) {
      showToast('Nothing to wipe — pinned notes stay');
      return;
    }
    if (inkEditingId) endInkEdit?.(true);
    store.dispatch([{ op: 'wipe', ts: new Date().toISOString() }], { kind: 'file' });
    const filed = `${targets.noteIds.length} note${targets.noteIds.length === 1 ? '' : 's'} filed`;
    showToast(`Board wiped — ${filed}`, {
      undo: () => {
        store.dispatch([
          { op: 'restore', ids: targets.noteIds },
          ...targets.collectionIds.map((id) => ({ op: 'restore', collectionId: id })),
          // Ink was deleted rather than filed, so undo puts the rows back.
          ...targets.ink.map((ink) => ({ op: 'ink.upsert', ink })),
        ]);
      },
    });
  }

  // ------------------------------------------------------------------ edit bar (tier 1)

  function closeEditPopovers(except = null) {
    for (const pop of [els.ebPalette, els.ebIconPop, els.ebLinkPop]) {
      if (pop && pop !== except) pop.hidden = true;
    }
  }

  /**
   * The edit bar follows the note, so its popovers can end up hanging off the
   * left edge or above the top of the window. Nudge them back in after they
   * open, and flip below the bar when there is no room above it.
   */
  function placePopover(pop) {
    if (!pop || pop.hidden) return;
    pop.style.transform = 'translateX(-50%)';
    // Offsets are relative to the button's wrapper, but the popover has to
    // clear the whole bar — which may wrap on a very narrow phone.
    const wrap = pop.parentElement.getBoundingClientRect();
    const bar = editbar.getBoundingClientRect();
    const box = pop.getBoundingClientRect();
    // Stay inside the canvas: a popover over the toolbar is both ugly and a
    // target for stray taps.
    const ceiling = Math.max(visibleBounds().top, viewport.getBoundingClientRect().top) + 4;
    if (bar.top - box.height - 8 >= ceiling) {
      pop.style.top = 'auto';
      pop.style.bottom = `${Math.round(wrap.bottom - bar.top + 8)}px`;
    } else {
      pop.style.bottom = 'auto';
      pop.style.top = `${Math.round(bar.bottom - wrap.top + 8)}px`;
    }
    const margin = 6;
    const after = pop.getBoundingClientRect();
    const shift = after.left < margin
      ? margin - after.left
      : Math.min(0, window.innerWidth - margin - after.right);
    pop.style.transform = `translateX(calc(-50% + ${Math.round(shift)}px))`;
  }

  function openPopover(pop, render) {
    const open = pop.hidden;
    closeEditPopovers();
    pop.hidden = !open;
    if (!open) return;
    render();
    placePopover(pop);
  }

  function renderEditBar() {
    const note = editingId ? noteById(editingId) : null;
    if (!note) {
      editbar.hidden = true;
      closeEditPopovers();
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
    els.ebIcon.innerHTML = note.iconKey ? ICON_SVGS[note.iconKey] : TAG_SVG;
    els.ebIcon.title = note.iconKey
      ? `Icon: ${legendLabel(store.state.legend, 'icon', note.iconKey)}`
      : 'Icon';
    els.ebIcon.setAttribute('aria-pressed', String(Boolean(note.iconKey)));
    syncPopovers(note);
    renderFormatState();
    positionEditBar();
  }

  /**
   * An open popover is updated in place rather than rebuilt — the button the
   * finger is still on has to survive its own press.
   */
  function syncPopovers(note) {
    for (const [pop, active] of [
      [els.ebPalette, note.colorKey],
      [els.ebIconPop, note.iconKey],
    ]) {
      if (pop.hidden) continue;
      for (const b of pop.children) b.setAttribute('aria-pressed', String(b.dataset.key === active));
    }
  }

  /** Bold / bullets / numbers / link light up for whatever the caret is inside. */
  function renderFormatState() {
    if (editbar.hidden) return;
    const list = bodyEditor ? bodyEditor.caretListTag() : null;
    els.ebBold.setAttribute('aria-pressed', String(Boolean(bodyEditor?.commandState('bold'))));
    els.ebBullets.setAttribute('aria-pressed', String(list === 'UL'));
    els.ebNumbers.setAttribute('aria-pressed', String(list === 'OL'));
    if (els.ebLink) els.ebLink.setAttribute('aria-pressed', String(Boolean(bodyEditor?.linkAtCaret())));
  }

  function renderPalette(note) {
    els.ebPalette.innerHTML = '';
    for (const key of COLOR_KEYS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sn-eb-swatch';
      b.dataset.key = key;
      b.style.background = colorHex(key);
      const label = legendLabel(store.state.legend, 'color', key);
      b.title = label;
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', String(note.colorKey === key));
      // The popover stays open: the note repaints behind it, and a tap that
      // tore its own target out of the page would leave the follow-up click to
      // land on whatever ended up under the finger — the toolbar, on a phone.
      onPress(b, () => {
        editNote([
          {
            op: 'note.categorize',
            ids: [note.id],
            colorKey: note.colorKey === key ? null : key,
            ts: new Date().toISOString(),
          },
        ]);
      });
      els.ebPalette.appendChild(b);
    }
  }

  /** Same gesture as the colour swatches, one tier up from the selection bar. */
  function renderIconPicker(note) {
    els.ebIconPop.innerHTML = '';
    for (const key of ICON_KEYS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sn-eb-icon';
      b.dataset.key = key;
      b.innerHTML = ICON_SVGS[key];
      const label = legendLabel(store.state.legend, 'icon', key);
      b.title = label;
      b.setAttribute('aria-label', label);
      b.setAttribute('aria-pressed', String(note.iconKey === key));
      onPress(b, () => {
        editNote([
          {
            op: 'note.categorize',
            ids: [note.id],
            iconKey: note.iconKey === key ? null : key,
            ts: new Date().toISOString(),
          },
        ]);
      });
      els.ebIconPop.appendChild(b);
    }
  }

  function positionEditBar() {
    if (editbar.hidden || !editingId) return;
    const el = cardEls.get(editingId);
    if (!el) return;
    const plan = editSessionPlan(el, editbar.offsetHeight || 32);
    editbar.classList.toggle('is-docked', plan.docked);
    editbar.style.top = `${plan.top}px`;
    editbar.style.left = `${plan.left}px`;
    placePopover(els.ebPalette);
    placePopover(els.ebIconPop);
    placePopover(els.ebLinkPop);
  }

  /**
   * Keep the note being typed into on screen. On touch the keyboard claims the
   * bottom half, so the note is pulled into the top third of what is left.
   * The page scale stays 1 — only the board pans.
   */
  function revealCard(el) {
    const barH = !editbar.hidden && editingId ? editbar.offsetHeight || 32 : 0;
    const plan = editSessionPlan(el, barH);
    if (plan.dy) {
      vp.panY += plan.dy;
      applyViewport();
      saveViewport();
    }
    if (!editbar.hidden && editingId) positionEditBar();
  }

  // ------------------------------------------------------------------ create + edit

  function createNote({ text = '', at = null, sourceUrl = null } = {}) {
    const region = viewportWorldRect();
    const rects = boardNotes().map(noteRect);
    const spot = at || findFreeSlot(region, rects);
    // Every new note starts as a light grey card; colour is something you
    // choose, not something you have to undo.
    const fields = { colorKey: DEFAULT_COLOR_KEY, x: spot.x, y: spot.y };
    // Nothing to type over: a note you are about to write in arrives blank.
    if (!text) {
      startDraft(fields);
      return;
    }
    const note = { id: randomId(), text, ...fields, sourceUrl };
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
  }

  /**
   * Open a blank card for typing. A note with no text is not a note — the store
   * refuses one (notes.js) — so the card is composed here and the first
   * character is what commits it, carrying whatever colour, icon or pin was
   * chosen in the meantime.
   */
  function startDraft(fields) {
    if (editingId) endEdit?.(false);
    if (inkEditingId) endInkEdit?.(false);
    draft = blankNote(fields);
    renderCard(draft);
    renderEmpty();
    startEditing(draft.id);
  }

  function discardDraft() {
    if (!draft) return;
    const id = draft.id;
    draft = null;
    removeCard(id);
    renderEmpty();
  }

  const composing = () => Boolean(draft) && draft.id === editingId;

  /**
   * Colour, icon and pin for the note under the caret. While a note is still
   * being composed there is nothing in the store to stamp, so the ops land on
   * the draft instead and ride along when it becomes real.
   */
  function editNote(ops) {
    if (!composing()) {
      store.dispatch(ops);
      return;
    }
    draft = applyOps({ ...emptyState(), notes: [draft] }, ops).notes[0] || draft;
    renderCard(draft);
    renderEditBar();
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

  function applyFormat(kind) {
    bodyEditor?.applyFormat(kind);
    renderFormatState();
  }

  function startEditing(id, { selectAll = false, caretAt = null } = {}) {
    const el = cardEls.get(id);
    const note = noteById(id);
    if (!el || !note || editingId) return;
    if (inkEditingId) endInkEdit?.(false);
    editingId = id;
    const body = el.querySelector('.sn-card-body');
    el.classList.add('is-editing');
    setEditingChrome(true);
    renderEditBar();
    revealCard(el);

    const onVisualResize = () => {
      revealCard(el);
      liftActionBar();
    };
    window.visualViewport?.addEventListener('resize', onVisualResize);
    window.visualViewport?.addEventListener('scroll', onVisualResize);

    const finish = (cancel = false) => {
      // Read before detach: the editor is what knows the live DOM.
      const wasDraft = draft?.id === id;
      const current = noteById(id) || note;
      const stored = noteBlocks(current);
      const rich = cancel ? stored : bodyEditor?.read() || stored;
      const text = cancel ? current.text : richToText(rich || []);
      bodyEditor?.detach();
      bodyEditor = null;
      el.classList.remove('is-editing');
      window.visualViewport?.removeEventListener('resize', onVisualResize);
      window.visualViewport?.removeEventListener('scroll', onVisualResize);
      editingId = null;
      endEdit = null;
      closeEditPopovers();
      editbar.hidden = true;
      editbar.classList.remove('is-docked');
      setEditingChrome(false);
      if (!text) {
        // A blank card nobody typed into was never a note; anything else is.
        if (wasDraft) discardDraft();
        else store.dispatch([{ op: 'note.delete', ids: [id] }]);
        return;
      }
      if (wasDraft) draft = null; // the text is what makes it real
      const stamp = JSON.stringify(rich);
      if (text !== current.text || stamp !== JSON.stringify(stored)) {
        bodyStamps.set(id, stamp);
        store.dispatch([
          { op: 'note.upsert', note: { ...current, text, rich, updatedAt: new Date().toISOString() } },
        ]);
      } else {
        renderBody(body, stored);
        bodyStamps.set(id, JSON.stringify(stored));
      }
      renderChips();
    };
    endEdit = finish;

    bodyEditor = attachBodyEditor(body, {
      onCommit: () => finish(false),
      onCancel: () => finish(true),
      onFormatChange: renderFormatState,
      onUnfurl: (url) => store.unfurl(url),
      linkPop: els.ebLinkPop,
      placePopover,
      shouldIgnoreBlur: (target) =>
        Boolean(target && (editbar.contains(target) || actionbar.contains(target))),
    });
    focusWithoutScroll(body);
    let range = caretAt ? caretRangeAt(caretAt.x, caretAt.y) : null;
    if (!range || !body.contains(range.startContainer)) {
      range = document.createRange();
      const last = selectAll ? body : body.lastElementChild || body;
      range.selectNodeContents(last);
      if (!selectAll) range.collapse(false);
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    renderFormatState();
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
    const ink = e.target.closest('.sn-ink');
    if (editingId) {
      // Inside the note being edited the pointer belongs to the caret and to
      // native text selection. Anywhere else commits, then behaves normally —
      // so the next click lands where the user aimed it.
      if (card && card.dataset.id === editingId) return;
      endEdit?.(false);
    }
    if (inkEditingId) {
      if (ink && ink.dataset.ink === inkEditingId) return;
      endInkEdit?.(false);
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

    if (ink) {
      const row = inkById(ink.dataset.ink);
      if (!row) return;
      drag = {
        kind: 'ink', id: row.id, el: ink, startX: e.clientX, startY: e.clientY,
        x: row.x, y: row.y, moved: false, pointerId: e.pointerId, frame: 0, dx: 0, dy: 0,
        slop: touch ? SLOP_TOUCH : SLOP_MOUSE,
        wantsEdit: e.button === 0,
      };
      capturePointer(e);
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

    // The pen is armed, so this press writes on the board instead of selecting
    // or panning. One press, one label — the pen disarms itself.
    if (textMode) {
      e.preventDefault();
      const p = toWorld(e);
      setTextMode(false);
      selection.clear();
      renderSelection();
      createInk({ x: p.x, y: p.y - 12 });
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
    if (drag.kind === 'ink') {
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < drag.slop) return;
      drag.moved = true;
      drag.dx = (e.clientX - drag.startX) / vp.zoom;
      drag.dy = (e.clientY - drag.startY) / vp.zoom;
      if (drag.frame) return;
      drag.frame = requestAnimationFrame(() => {
        drag.frame = 0;
        drag.el.classList.add('is-dragging');
        drag.el.style.transform = `translate(${drag.dx}px, ${drag.dy}px)`;
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
    if (d.kind === 'ink') {
      d.el.classList.remove('is-dragging');
      d.el.style.transform = '';
      if (d.moved) {
        store.dispatch([
          { op: 'ink.move', id: d.id, x: d.x + d.dx, y: d.y + d.dy, ts: new Date().toISOString() },
        ]);
      } else if (d.wantsEdit) {
        startEditingInk(d.id, { caretAt: { x: e.clientX, y: e.clientY } });
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
    const ink = e.target.closest('.sn-ink');
    if (ink) {
      startEditingInk(ink.dataset.ink);
      return;
    }
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

  /** Flash restored cards so a Restore is visible. */
  function pulseNotes(ids) {
    for (const id of ids) {
      const el = cardEls.get(id);
      if (!el) continue;
      el.classList.remove('is-pulsing');
      void el.offsetWidth;
      el.classList.add('is-pulsing');
      setTimeout(() => el.classList.remove('is-pulsing'), 950);
    }
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
    pulseNotes(ids);
  }

  // ------------------------------------------------------------------ keyboard

  function isTyping() {
    const el = document.activeElement;
    return (
      editingId ||
      inkEditingId ||
      (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable))
    );
  }

  function onKeyDown(e) {
    if (e.code === 'Space' && !isTyping()) {
      spaceHeld = true;
      viewport.classList.add('is-pan-ready');
    }
    if (isTyping()) return;
    if (viewport.hidden) return;
    if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      selectAll();
      return;
    }
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      createNote();
    } else if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      setTextMode(!textMode);
    } else if (e.key === 'p' || e.key === 'P') {
      if (selection.size) {
        const allPinned = selectedNotes().every((n) => n.pinned);
        store.dispatch([{ op: 'note.pin', ids: [...selection], pinned: !allPinned, ts: new Date().toISOString() }]);
      }
    } else if (e.key === 'Escape') {
      setSelectMode(false);
      setTextMode(false);
      selection.clear();
      renderSelection();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size) {
      e.preventDefault();
      // Delete files the selection (nothing is lost); Shift+Delete discards it.
      if (e.shiftKey) deleteSelection();
      else fileSelection();
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
    if (viewport.hidden) return;
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
        case 'ink.upsert': {
          const ink = (state.ink || []).find((i) => i.id === op.ink?.id);
          if (ink) renderInk(ink);
          break;
        }
        case 'ink.move': {
          const ink = (state.ink || []).find((i) => i.id === op.id);
          if (ink) renderInk(ink);
          break;
        }
        case 'ink.delete':
          for (const id of op.ids || []) removeInk(id);
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
          if (op.op === 'wipe') renderAllInk();
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
  onPress(els.abDelete, deleteSelection);
  if (els.abPage) {
    onPress(els.abPage, () => {
      const notes = selectedNotes();
      const colId = notes[0]?.collectionId;
      const shared = notes.length && notes.every((n) => n.collectionId === colId) ? colId : null;
      if (shared) onOpenWiki?.(shared);
    });
  }

  els.ebTrash.innerHTML = TRASH_SVG;
  els.ebPin.innerHTML = PIN_SVG;
  els.ebBold.innerHTML = BOLD_SVG;
  els.ebBullets.innerHTML = BULLET_LIST_SVG;
  els.ebNumbers.innerHTML = NUMBER_LIST_SVG;
  if (els.ebLink) els.ebLink.innerHTML = LINK_SVG;
  onPress(els.ebTrash, () => {
    // Throwing away a card nobody has typed into is not a deletion to undo.
    if (composing()) endEdit?.(true);
    else deleteNotes([editingId]);
  });
  onPress(els.ebPin, () => {
    const note = noteById(editingId);
    if (!note) return;
    editNote([{ op: 'note.pin', ids: [note.id], pinned: !note.pinned, ts: new Date().toISOString() }]);
  });
  onPress(els.ebBold, () => applyFormat('bold'));
  onPress(els.ebBullets, () => applyFormat('ul'));
  onPress(els.ebNumbers, () => applyFormat('ol'));
  if (els.ebLink) {
    onPress(els.ebLink, () => {
      closeEditPopovers(els.ebLinkPop);
      bodyEditor?.openLink();
    });
  }
  onPress(els.ebColor, () => {
    const note = noteById(editingId);
    if (note) openPopover(els.ebPalette, () => renderPalette(note));
  });
  onPress(els.ebIcon, () => {
    const note = noteById(editingId);
    if (note) openPopover(els.ebIconPop, () => renderIconPicker(note));
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
    /** Arm the pen; the next press on the board writes there. */
    startText: () => setTextMode(!textMode),
    wipe,
    zoomIn: () => zoomBy(1.2),
    zoomOut: () => zoomBy(1 / 1.2),
    zoomFit,
    revealNotes,
    pulseNotes,
    clientToWorld,
    containsClientPoint,
    selectAll,
    deleteSelection,
    refresh: fullRender,
    /** Called when the board becomes visible again — layout may have changed. */
    relayout: () => {
      positionEditBar();
      liftActionBar();
    },
    clearSelection: () => {
      // Leaving the board is as final as clicking off the note.
      if (editingId) endEdit?.(false);
      setSelectMode(false);
      setTextMode(false);
      selection.clear();
      renderSelection();
    },
  };
}
