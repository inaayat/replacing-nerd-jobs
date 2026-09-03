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
  LINK_SVG,
  MEDIA_SVG,
  NUMBER_LIST_SVG,
  PIN_SVG,
  TAG_SVG,
  TRASH_SVG,
  VIEWPORT_KEY,
  arrowEndpoints,
  bbox,
  blankNote,
  canStartResize,
  clamp,
  colorHex,
  displayedKeyboardSlice,
  findFreeSlot,
  fitViewport,
  centerViewportOnRects,
  applyAutoPreview,
  isLoneUrl,
  noteIsOnlyMedia,
  keyboardInset as visualKeyboardInset,
  legendLabel,
  localMedia,
  mediaKind,
  noteBlocks,
  noteCreateSize,
  phoneNoteZoom,
  pinchAfterLift,
  pinchNoteSize,
  pinchStep,
  pinchTarget,
  placeEditPopover,
  planEditSession,
  usesPhoneCompose,
  randomId,
  rectsIntersect,
  resizeNoteSize,
  richToText,
  normalizeHref,
  screenToWorld,
  urlDomain,
  wipeTargets,
  zoomAt,
} from './notes.js';
import {
  attachBodyEditor,
  mediaShowsStill,
  renderBody,
  renderIcon,
  renderMedia,
  renderTags,
} from './body.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Touch fingers wobble; a mouse does not.
const SLOP_MOUSE = 4;
const SLOP_TOUCH = 8;
const LONG_PRESS_MS = 400;
// A click arrives right after the mouseup that ended a drag, or not at all.
const CLICK_AFTER_DRAG_MS = 300;

export function createBoard({ store, els, showToast, onEdit, onOpenWiki }) {
  const { viewport, world, arrowLayer, rubber, empty, actionbar, editbar } = els;
  const compose = els.compose || null;
  const composeBody = els.composeBody || null;

  let vp = loadViewport();
  let vpFrame = 0;
  const cardEls = new Map(); // note id -> element
  const bodyStamps = new Map(); // note id -> serialized body last painted
  const chipEls = new Map(); // collection id -> element
  const inkEls = new Map(); // board-ink id -> element
  const selection = new Set();
  let spaceHeld = false;
  let drag = null; // { kind: 'move'|'pan'|'rubber'|'resize'|'arrow'|'pinch'|'notepinch'|'ink', ... }
  let editingId = null;
  let endEdit = null; // commit/cancel the open edit from outside startEditing
  let bodyEditor = null;
  let inkEditingId = null;
  let endInkEdit = null;
  let textMode = false; // the pen is armed: the next press writes on the board

  const pointers = new Map(); // live pointerId -> { x, y, cardId }, for pinch
  let longPressTimer = 0;
  let draggedAt = 0; // when a note last finished moving, to swallow the trailing click
  let selectMode = false; // touch: long-press opened a multi-select session
  let lastPointerType = 'mouse';

  const coarse = () => window.matchMedia('(pointer: coarse)').matches;
  const phone = () => coarse() && window.innerWidth <= 720;
  const useCompose = () => usesPhoneCompose({ coarse: coarse(), width: window.innerWidth });

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
    const html = document.documentElement;
    const displayed = html.classList.contains('sn-kb-inset')
      ? {
          height: parseFloat(html.style.getPropertyValue('--sn-vv-height')),
          offsetTop: parseFloat(html.style.getPropertyValue('--sn-vv-top')),
        }
      : null;
    return displayedKeyboardSlice(window.visualViewport, window.innerHeight, displayed);
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
    const card = el
      ? el.getBoundingClientRect()
      : { top: 0, bottom: 0, left: 0, width: 0 };
    const composing = Boolean(compose && !compose.hidden);
    return planEditSession({
      card: { top: card.top, bottom: card.bottom, left: card.left, width: card.width },
      barW: editbar.hidden ? 0 : editbar.offsetWidth || 0,
      barH,
      canvas: viewport.getBoundingClientRect(),
      visible: visibleBounds(),
      phone: coarse() || composing,
      composeH: composing ? compose.offsetHeight : 0,
    });
  }

  // ------------------------------------------------------------------ cards

  /**
   * A picture with nothing else on it is shown as the picture: no padding, no
   * border, the note's own rounded corners on the image. The card comes back
   * while the note is being edited, because an empty body is nowhere to type.
   */
  function applyPhotoLayout(el, note) {
    const bare =
      note.id !== editingId &&
      noteIsOnlyMedia(note) &&
      mediaShowsStill(note.media, store.authToken);
    el.classList.toggle('is-photo', bare);
  }

  /** The image sets a photo note's height; every other card is held open by `h`. */
  function applyCardSize(el, w, h) {
    el.style.width = `${w}px`;
    el.style.minHeight = el.classList.contains('is-photo') ? '0px' : `${h}px`;
  }

  function renderCard(note) {
    let el = cardEls.get(note.id);
    if (!el) {
      el = document.createElement('article');
      el.className = 'sn-card';
      el.dataset.id = note.id;
      el.innerHTML = `
        <span class="sn-card-pin">${PIN_SVG}</span>
        <span class="sn-card-icon"></span>
        <div class="sn-card-tags" hidden></div>
        <div class="sn-card-body"></div>
        <div class="sn-card-media" hidden></div>
        <div class="sn-card-source"></div>
        <span class="sn-dot" data-side="n"></span>
        <span class="sn-dot" data-side="e"></span>
        <span class="sn-dot" data-side="s"></span>
        <span class="sn-dot" data-side="w"></span>
        <span class="sn-card-resize" title="Resize" aria-label="Resize" tabindex="-1"></span>`;
      world.appendChild(el);
      cardEls.set(note.id, el);
    }
    el.style.left = `${note.x}px`;
    el.style.top = `${note.y}px`;
    applyPhotoLayout(el, note);
    applyCardSize(el, note.w, note.h);
    el.classList.toggle('is-pinned', note.pinned);
    el.classList.toggle('is-selected', selection.has(note.id));
    // The colour is the card, not a stripe on it.
    el.style.setProperty('--note-fill', note.colorKey ? colorHex(note.colorKey) : '');
    const icon = el.querySelector('.sn-card-icon');
    renderIcon(icon, store.state.legend, note.iconKey);
    const tags = el.querySelector('.sn-card-tags');
    renderTags(tags, note.tags);
    const body = el.querySelector('.sn-card-body');
    if (note.id === editingId && compose && !compose.hidden) {
      compose.style.setProperty('--note-fill', note.colorKey ? colorHex(note.colorKey) : '');
    }
    if (note.id !== editingId) {
      const blocks = noteBlocks(note);
      const stamp = JSON.stringify(blocks);
      if (bodyStamps.get(note.id) !== stamp) {
        renderBody(body, blocks);
        bodyStamps.set(note.id, stamp);
      }
    }
    const media = el.querySelector('.sn-card-media');
    const mediaBefore = note.media?.position === 'before';
    media.classList.toggle('is-before', mediaBefore);
    if (mediaBefore && media.nextElementSibling !== body) el.insertBefore(media, body);
    if (!mediaBefore && body.nextElementSibling !== media) body.after(media);
    store.refreshMissingThumb(note);
    renderMedia(media, note.media, { authToken: store.authToken });
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
    els.abIconPop.classList.remove('has-custom-form');
    els.abIconPop.innerHTML = '';
    const activeIcon = notes.every((n) => n.iconKey === notes[0].iconKey) ? notes[0].iconKey : undefined;
    if (activeIcon) renderIcon(els.abIcon, store.state.legend, activeIcon);
    else els.abIcon.textContent = '◇';
    for (const key of allIconKeys()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sn-ab-icongrid';
      renderIcon(b, store.state.legend, key);
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
    appendCustomIconButton(els.abIconPop, (key, definition) => {
      store.dispatch([
        { op: 'legend.set', kind: 'custom-icon', key, ...definition },
        { op: 'note.categorize', ids: [...selection], iconKey: key, ts: new Date().toISOString() },
      ]);
    });
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
    // When the keyboard is a layout inset the canvas already ends above it.
    if (document.documentElement.classList.contains('sn-kb-inset')) {
      actionbar.style.bottom = '';
      return;
    }
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
    for (const pop of [els.ebPalette, els.ebIconPop, els.ebLinkPop, els.ebMediaPop]) {
      if (pop && pop !== except) pop.hidden = true;
    }
  }

  /**
   * The edit bar follows the note, so its popovers can end up hanging off the
   * left edge or above the top of the window. Nudge them back in after they
   * open. Desktop flips below the bar when there is no room above it; a
   * docked phone bar never does — below it is the keyboard.
   */
  function placePopover(pop) {
    if (!pop || pop.hidden) return;
    pop.style.maxHeight = '';
    pop.style.overflowY = '';
    pop.style.transform = 'translateX(-50%)';
    // Offsets are relative to the button's wrapper, but the popover has to
    // clear the whole bar — which may wrap on a very narrow phone.
    const wrap = pop.parentElement.getBoundingClientRect();
    const bar = editbar.getBoundingClientRect();
    const box = pop.getBoundingClientRect();
    // Stay inside the canvas: a popover over the toolbar is both ugly and a
    // target for stray taps.
    const ceiling = Math.max(visibleBounds().top, viewport.getBoundingClientRect().top) + 4;
    const plan = placeEditPopover({
      wrap: { top: wrap.top, bottom: wrap.bottom, left: wrap.left, right: wrap.right },
      bar: { top: bar.top, bottom: bar.bottom },
      pop: { width: box.width, height: box.height },
      ceiling,
      viewW: window.innerWidth,
      preferAbove: editbar.classList.contains('is-docked') || coarse(),
    });
    pop.style.top = plan.top == null ? 'auto' : `${plan.top}px`;
    pop.style.bottom = plan.bottom == null ? 'auto' : `${plan.bottom}px`;
    pop.style.transform = `translateX(calc(-50% + ${plan.shift}px))`;
    if (plan.maxHeight != null) {
      pop.style.maxHeight = `${plan.maxHeight}px`;
      pop.style.overflowY = 'auto';
    }
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
    if (note.iconKey) renderIcon(els.ebIcon, store.state.legend, note.iconKey);
    else els.ebIcon.innerHTML = TAG_SVG;
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
    if (els.ebMedia) els.ebMedia.setAttribute('aria-pressed', String(Boolean(noteById(editingId)?.media)));
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
  function allIconKeys() {
    return [...ICON_KEYS, ...Object.keys(store.state.legend.customIcons || {})];
  }

  function appendCustomIconButton(pop, onCreate) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = pop === els.ebIconPop ? 'sn-eb-icon sn-custom-icon-add' : 'sn-ab-icongrid sn-custom-icon-add';
    add.textContent = '+';
    add.title = 'Create a custom image tag';
    add.setAttribute('aria-label', 'Create a custom image tag');
    add.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      renderCustomIconForm(pop, onCreate);
    });
    pop.appendChild(add);
  }

  function renderCustomIconForm(pop, onCreate) {
    pop.innerHTML = '';
    pop.classList.remove('has-name-editor');
    pop.classList.add('has-custom-form');
    const form = document.createElement('div');
    form.className = 'sn-custom-icon-form';
    const name = document.createElement('input');
    name.className = 'sn-custom-icon-input';
    name.type = 'text';
    name.maxLength = 60;
    name.placeholder = 'Tag name';
    name.setAttribute('aria-label', 'Custom tag name');
    const image = document.createElement('input');
    image.className = 'sn-custom-icon-input';
    image.type = 'url';
    image.inputMode = 'url';
    image.placeholder = 'Image URL';
    image.setAttribute('aria-label', 'Custom tag image URL');
    const error = document.createElement('span');
    error.className = 'sn-custom-icon-error';
    error.hidden = true;
    error.textContent = 'Add a name and full http(s) image URL.';
    const actions = document.createElement('span');
    actions.className = 'sn-custom-icon-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'sn-btn sn-btn-primary';
    save.textContent = 'Create';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'sn-btn';
    cancel.textContent = 'Cancel';
    const submit = () => {
      const label = name.value.trim();
      const imageUrl = normalizeHref(image.value);
      if (!label || !imageUrl) {
        error.hidden = false;
        return;
      }
      const key = `custom:${randomId().replace(/^sn-/, '').toLowerCase()}`;
      pop.hidden = true;
      pop.classList.remove('has-custom-form');
      onCreate(key, { label, imageUrl });
    };
    save.addEventListener('click', submit);
    cancel.addEventListener('click', () => {
      pop.hidden = true;
      pop.classList.remove('has-custom-form');
    });
    for (const input of [name, image]) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      });
    }
    actions.append(save, cancel);
    form.append(name, image, error, actions);
    pop.appendChild(form);
    if (pop === els.ebIconPop) placePopover(pop);
    focusWithoutScroll(name);
  }

  function renderIconNameEditor(pop) {
    pop.innerHTML = '';
    pop.classList.remove('has-custom-form');
    pop.classList.add('has-name-editor');
    const editor = document.createElement('div');
    editor.className = 'sn-icon-name-editor';
    const heading = document.createElement('span');
    heading.className = 'sn-icon-name-title';
    heading.textContent = 'Tag names';
    editor.appendChild(heading);
    for (const key of allIconKeys()) {
      const row = document.createElement('label');
      row.className = 'sn-icon-name-row';
      const picture = document.createElement('span');
      picture.className = 'sn-icon-name-picture';
      renderIcon(picture, store.state.legend, key);
      const input = document.createElement('input');
      input.className = 'sn-icon-name-input';
      input.maxLength = 60;
      input.value = legendLabel(store.state.legend, 'icon', key);
      input.dataset.key = key;
      row.append(picture, input);
      editor.appendChild(row);
    }
    const error = document.createElement('span');
    error.className = 'sn-custom-icon-error';
    error.hidden = true;
    error.textContent = 'Every tag needs a name.';
    const actions = document.createElement('span');
    actions.className = 'sn-custom-icon-actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'sn-btn sn-btn-primary';
    save.textContent = 'Save names';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'sn-btn';
    cancel.textContent = 'Cancel';
    save.addEventListener('click', () => {
      const fields = [...editor.querySelectorAll('.sn-icon-name-input')];
      if (fields.some((input) => !input.value.trim())) {
        error.hidden = false;
        return;
      }
      const ops = fields.map((input) => {
        const key = input.dataset.key;
        const label = input.value.trim();
        const custom = store.state.legend.customIcons?.[key];
        return custom
          ? { op: 'legend.set', kind: 'custom-icon', key, label, imageUrl: custom.imageUrl }
          : { op: 'legend.set', kind: 'icon', key, label };
      });
      pop.hidden = true;
      pop.classList.remove('has-name-editor');
      store.dispatch(ops, { kind: 'legend' });
    });
    cancel.addEventListener('click', () => {
      pop.hidden = true;
      pop.classList.remove('has-name-editor');
    });
    actions.append(save, cancel);
    editor.append(error, actions);
    pop.appendChild(editor);
    placePopover(pop);
    focusWithoutScroll(editor.querySelector('.sn-icon-name-input'));
  }

  function renderIconPicker(note) {
    els.ebIconPop.classList.remove('has-custom-form', 'has-name-editor');
    els.ebIconPop.innerHTML = '';
    for (const key of allIconKeys()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sn-eb-icon';
      b.dataset.key = key;
      renderIcon(b, store.state.legend, key);
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
    appendCustomIconButton(els.ebIconPop, (key, definition) => {
      const current = noteById(note.id);
      if (!current) return;
      store.dispatch([
        { op: 'legend.set', kind: 'custom-icon', key, ...definition },
        { op: 'note.categorize', ids: [current.id], iconKey: key, ts: new Date().toISOString() },
      ]);
    });
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'sn-icon-name-edit';
    rename.textContent = 'Edit tag names';
    rename.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      renderIconNameEditor(els.ebIconPop);
    });
    els.ebIconPop.appendChild(rename);
  }

  function positionEditBar() {
    if (editbar.hidden || !editingId) return;
    const el = cardEls.get(editingId);
    const plan = editSessionPlan(el, editbar.offsetHeight || 32);
    editbar.classList.toggle('is-docked', plan.docked);
    editbar.style.top = `${plan.top}px`;
    editbar.style.left = `${plan.left}px`;
    if (compose && !compose.hidden) {
      if (plan.composeTop != null) {
        compose.style.top = `${plan.composeTop}px`;
        compose.style.height = `${plan.composeHeight}px`;
      }
      compose.style.left = `${viewport.getBoundingClientRect().left + 8}px`;
      compose.style.right = '8px';
      compose.style.width = 'auto';
    }
    placePopover(els.ebPalette);
    placePopover(els.ebIconPop);
    placePopover(els.ebLinkPop);
    placePopover(els.ebMediaPop);
  }

  /**
   * Keep the note being typed into on screen. Desktop may nudge the camera
   * so the floating bar has room. Phone never pans — the keyboard is a
   * layout inset, and the slim bar docks at the bottom of what is left.
   */
  function revealCard(el) {
    if (!phone()) {
      const barH = !editbar.hidden && editingId ? editbar.offsetHeight || 32 : 0;
      const plan = editSessionPlan(el, barH);
      if (plan.dy) {
        vp.panY += plan.dy;
        applyViewport();
        saveViewport();
      }
    }
    if (!editbar.hidden && editingId) positionEditBar();
  }

  /** On a phone, lift a postage-stamp card to a usable on-screen size. */
  function fitPhoneNote(el) {
    if (!phone() || !el) return;
    const note = noteById(el.dataset.id);
    const r = viewport.getBoundingClientRect();
    const plan = phoneNoteZoom({
      zoom: vp.zoom,
      noteW: note?.w || el.offsetWidth,
      viewW: r.width,
    });
    if (!plan.changed) return;
    const card = el.getBoundingClientRect();
    const ax = card.left - r.left + card.width / 2;
    const ay = card.top - r.top + Math.min(card.height / 2, 48);
    vp = zoomAt(vp, { x: ax, y: ay }, plan.zoom / vp.zoom);
    applyViewport();
    saveViewport();
  }

  // ------------------------------------------------------------------ create + edit

  function createNote({ text = '', at = null, sourceUrl = null } = {}) {
    const size = noteCreateSize(phone());
    const region = viewportWorldRect();
    const rects = boardNotes().map(noteRect);
    const spot = at || findFreeSlot(region, rects, size.w + 16, size.h + 24);
    // Every new note starts as a light grey card; colour is something you
    // choose, not something you have to undo.
    const fields = { colorKey: DEFAULT_COLOR_KEY, x: spot.x, y: spot.y, w: size.w, h: size.h };
    if (editingId) endEdit?.(false);
    if (inkEditingId) endInkEdit?.(false);
    // A create is a real note immediately, even when the body is still blank.
    const local = sourceUrl && mediaKind(sourceUrl) !== 'link' ? localMedia(sourceUrl) : null;
    let note = text
      ? { id: randomId(), text, ...fields, sourceUrl, media: local }
      : blankNote(fields);
    let unfurlUrl = sourceUrl;
    if (text) {
      const applied = applyAutoPreview(note);
      note = applied.note;
      unfurlUrl = sourceUrl || applied.unfurlUrl;
    }
    store.dispatch([{ op: 'note.upsert', note }]);
    const saved = noteById(note.id);
    if (!saved) return;
    if (unfurlUrl) store.queueUnfurl(saved.id, unfurlUrl);
    if (!text) {
      const el = cardEls.get(saved.id);
      if (el && !useCompose()) fitPhoneNote(el);
      startEditing(saved.id);
    }
  }

  /** Colour, icon and pin for the note under the caret. */
  function editNote(ops) {
    store.dispatch(ops);
  }

  function renderMediaPopover(note) {
    if (!els.ebMediaPop) return;
    els.ebMediaUrl.value = note.media?.url || '';
    els.ebMediaRemove.hidden = !note.media;
    els.ebMediaError.hidden = true;
  }

  function saveMedia() {
    const url = normalizeHref(els.ebMediaUrl?.value || '');
    if (!url || !editingId) {
      if (els.ebMediaError) els.ebMediaError.hidden = false;
      return;
    }
    const current = noteById(editingId);
    if (!current) return;
    const media = { ...localMedia(url), position: 'after' };
    store.dispatch([{
      op: 'note.upsert',
      note: { ...current, media, updatedAt: new Date().toISOString() },
    }]);
    els.ebMediaPop.hidden = true;
    store.queueUnfurl(current.id, url);
  }

  function removeMedia() {
    const current = noteById(editingId);
    if (!current) return;
    store.dispatch([{
      op: 'note.upsert',
      note: { ...current, media: null, updatedAt: new Date().toISOString() },
    }]);
    els.ebMediaPop.hidden = true;
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
    const composing = Boolean(useCompose() && compose && composeBody);
    const body = composing ? composeBody : el.querySelector('.sn-card-body');
    el.classList.add('is-editing');
    // A photo note has no card while it rests; typing needs one back.
    applyPhotoLayout(el, note);
    applyCardSize(el, note.w, note.h);
    setEditingChrome(true);
    if (composing) {
      compose.hidden = false;
      compose.style.setProperty('--note-fill', note.colorKey ? colorHex(note.colorKey) : '');
      renderBody(composeBody, noteBlocks(note));
    }
    renderEditBar();
    if (composing) positionEditBar();
    else {
      fitPhoneNote(el);
      revealCard(el);
    }

    const onVisualResize = () => {
      if (!composing) revealCard(el);
      else positionEditBar();
      liftActionBar();
    };
    window.visualViewport?.addEventListener('resize', onVisualResize);
    window.visualViewport?.addEventListener('scroll', onVisualResize);

    let closed = false;
    const finish = (cancel = false) => {
      if (closed) return;
      closed = true;
      // Read before detach: the editor is what knows the live DOM.
      const current = noteById(id) || note;
      const stored = noteBlocks(current);
      // `read()` is null for an empty body — keep that, do not fall back to the
      // stored blocks, or clearing a note would silently restore its text.
      const rich = cancel ? stored : bodyEditor ? bodyEditor.read() : stored;
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
      if (composing) {
        compose.hidden = true;
        compose.style.removeProperty('--note-fill');
        compose.style.height = '';
        composeBody.replaceChildren();
      }
      setEditingChrome(false);
      const stamp = JSON.stringify(rich);
      if (text !== current.text || stamp !== JSON.stringify(stored)) {
        bodyStamps.set(id, stamp);
        const applied = applyAutoPreview(
          { ...current, text, rich, updatedAt: new Date().toISOString() },
          current,
        );
        store.dispatch([{ op: 'note.upsert', note: applied.note }]);
        if (applied.unfurlUrl) store.queueUnfurl(id, applied.unfurlUrl);
      } else {
        const cardBody = el.querySelector('.sn-card-body');
        if (cardBody) renderBody(cardBody, stored);
        bodyStamps.set(id, JSON.stringify(stored));
      }
      // Left with a picture and no words again: back to the bare picture.
      const after = noteById(id);
      if (after) {
        applyPhotoLayout(el, after);
        applyCardSize(el, after.w, after.h);
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
        Boolean(
          target &&
            (editbar.contains(target) ||
              actionbar.contains(target) ||
              (compose && compose.contains(target)) ||
              target.closest?.('.sn-card-resize')),
        ),
    });
    // Focus in this same user gesture. A delay, or preventDefault on the
    // opener, is what keeps iOS from opening the keyboard.
    focusWithoutScroll(body);
    let range = !composing && caretAt ? caretRangeAt(caretAt.x, caretAt.y) : null;
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
    if ((drag.kind === 'resize' || drag.kind === 'notepinch') && drag.el) {
      applyCardSize(drag.el, drag.w, drag.h);
      drag.el.classList.remove('is-pinching');
    }
    if (drag.kind === 'arrow') drag.ghost.remove();
    if (drag.kind === 'rubber') rubber.hidden = true;
    viewport.classList.remove('is-panning');
    drag = null;
  }

  /** Pointer capture is best-effort: a synthetic or already-released pointer throws. */
  function capturePointerId(pointerId) {
    try {
      viewport.setPointerCapture(pointerId);
    } catch {
      /* the gesture still works without capture */
    }
  }

  function capturePointer(e) {
    capturePointerId(e.pointerId);
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const pinchFrame = (a, b) => ({ dist: dist(a, b), mid: mid(a, b) });
  const livePointers = () =>
    [...pointers].map(([id, p]) => ({ id, x: p.x, y: p.y, cardId: p.cardId }));

  /** Live size of a note mid-pinch, from the spread the fingers started with. */
  function pinchedSize(d) {
    return pinchNoteSize({ w: d.w, h: d.h }, d.scale);
  }

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
    pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      cardId: e.target.closest?.('.sn-card')?.dataset.id || null,
    });

    // Two fingers, wherever they landed, mid-drag or not: whatever the first
    // finger started is dropped. Both inside one note resizes that note — the
    // corner handle is a small target that only appears once a note is
    // selected, so the note itself is the handle. Otherwise the board zooms.
    if (e.pointerType === 'touch' && pointers.size === 2) {
      clearLongPress();
      abortDrag();
      const live = livePointers();
      const [a, b] = live;
      const target = pinchTarget(live);
      const note = target.kind === 'note' ? noteById(target.id) : null;
      const el = note ? cardEls.get(note.id) : null;
      if (note && el) {
        world.appendChild(el); // a growing note belongs over its neighbours
        el.classList.add('is-pinching');
        drag = {
          kind: 'notepinch', id: note.id, el, ids: [a.id, b.id],
          startDist: dist(a, b) || 1, scale: 1,
          w: note.w, h: Math.max(note.h, el.offsetHeight), frame: 0,
        };
        e.preventDefault();
        return;
      }
      drag = { kind: 'pinch', last: pinchFrame(a, b) };
      return;
    }
    if (pointers.size > 1) return;

    const card = e.target.closest('.sn-card');
    const ink = e.target.closest('.sn-ink');
    const resize = e.target.closest('.sn-card-resize');

    // Touch shows a 44px handle on the selected/editing card; the mouse keeps
    // the 14px hover grip. Hit it before the edit early-return so one finger
    // resizes without panning, moving, or committing the caret. Idle notes
    // keep the handle `display: none`, so one-finger pan still works.
    if (resize && card) {
      const note = noteById(card.dataset.id);
      const allowed =
        note &&
        canStartResize({
          coarse: coarse(),
          selected: selection.has(note.id),
          editing: editingId === note.id,
        });
      if (allowed) {
        drag = {
          kind: 'resize', id: note.id, el: card, startX: e.clientX, startY: e.clientY,
          w: note.w, h: Math.max(note.h, card.offsetHeight), pointerId: e.pointerId, frame: 0,
        };
        capturePointer(e);
        e.preventDefault();
        return;
      }
    }

    if (editingId) {
      // Inside the desktop note being edited the pointer belongs to the caret.
      // Phone compose lives outside #world, so a press on the canvas (including
      // the card) commits, then behaves normally.
      const composing = Boolean(compose && !compose.hidden);
      if (!composing && card && card.dataset.id === editingId) return;
      endEdit?.(false);
    }
    if (inkEditingId) {
      if (ink && ink.dataset.ink === inkEditingId) return;
      endInkEdit?.(false);
    }

    const touch = e.pointerType === 'touch';
    const dot = e.target.closest('.sn-dot');
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

    if (card) {
      // The picture is part of the note, not a link sitting on top of it: a
      // mouse drags the card by it (and the click that would have opened the
      // site is swallowed below if the pointer moved), while a plain click
      // still opens the site. Touch never gets here — the preview is not a
      // hit target on a coarse pointer. Real chrome, the source line and body
      // pills still own their own press.
      const onMedia = Boolean(e.target.closest('.sn-media-link'));
      if (e.target.closest('button, a') && !onMedia) return;
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
        // A press that never becomes a drag is a request to type — unless it
        // landed on the picture, where a click means "open this".
        wantsEdit: e.button === 0 && !onMedia,
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
    const held = pointers.get(e.pointerId);
    // Mutate in place: the card each finger landed on is part of the entry.
    if (held) {
      held.x = e.clientX;
      held.y = e.clientY;
    }

    if (drag?.kind === 'notepinch') {
      const a = pointers.get(drag.ids[0]);
      const b = pointers.get(drag.ids[1]);
      if (!a || !b) return;
      drag.scale = dist(a, b) / drag.startDist;
      if (drag.frame) return;
      drag.frame = requestAnimationFrame(() => {
        drag.frame = 0;
        const { w, h } = pinchedSize(drag);
        applyCardSize(drag.el, w, h);
        repathArrowsTouching([drag.id]);
      });
      return;
    }

    if (drag?.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const next = pinchFrame(a, b);
      const r = viewport.getBoundingClientRect();
      vp = pinchStep(vp, drag.last, next, { x: r.left, y: r.top });
      drag.last = next;
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
        const { w, h } = resizeNoteSize(drag.w + (drag.dw || 0), drag.h + (drag.dh || 0));
        applyCardSize(drag.el, w, h);
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

  function tappedEmptyBoard() {
    if (selectMode) {
      exitSelectMode();
      return;
    }
    if (selection.size) {
      selection.clear();
      renderSelection();
    }
    // Phone create is + → compose. Empty-board tap still pans; it is not a
    // create path. Desktop create is double-click (see dblclick below).
  }

  function endDrag(e) {
    pointers.delete(e.pointerId);
    clearLongPress();

    // A note pinch ends with the first finger up: the note keeps the size it
    // was at that moment, and the finger still down does nothing until it
    // lifts. Panning the board out from under a note that just changed size
    // would be a second, unasked-for change.
    if (drag?.kind === 'notepinch') {
      const d = drag;
      drag = null;
      if (d.frame) cancelAnimationFrame(d.frame);
      d.el.classList.remove('is-pinching');
      const { w, h } = pinchedSize(d);
      if (w !== d.w || h !== d.h) {
        store.dispatch([{ op: 'note.resize', id: d.id, w, h, ts: new Date().toISOString() }]);
      }
      return;
    }

    if (drag?.kind === 'pinch') {
      const next = pinchAfterLift(livePointers());
      if (next.kind === 'pinch') {
        // Re-seed against the fingers still down, or the first frame after the
        // lift reads the departed finger's spread as a jump in scale.
        drag.last = pinchFrame(next.a, next.b);
        return;
      }
      if (next.kind === 'pan') {
        // One finger left: keep dragging the board with it instead of going
        // dead until the hand is off the glass. `moved` is already true, so
        // the lift is not mistaken for a tap on the empty board.
        drag = {
          kind: 'pan', startX: next.x, startY: next.y, panX: vp.panX, panY: vp.panY,
          pointerId: next.pointerId, moved: true,
        };
        capturePointerId(next.pointerId);
        return;
      }
      drag = null;
      saveViewport();
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
      // The card travels with the pointer, so a note dragged by its picture
      // ends the gesture with the cursor still over that link and the browser
      // fires a click. That click is not a request to leave the board.
      if (d.moved) draggedAt = performance.now();
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
      const { w, h } = resizeNoteSize(d.w + (d.dw || 0), d.h + (d.dh || 0));
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
    'click',
    (e) => {
      if (performance.now() - draggedAt > CLICK_AFTER_DRAG_MS) return;
      if (!e.target.closest?.('a')) return;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );

  // A finger can leave the glass over chrome that is not inside the canvas —
  // the edit bar and the compose sheet are siblings of #viewport — and that
  // pointerup never reaches the board. The forgotten finger would sit in
  // `pointers` forever, so the next single touch counts as two and the board
  // pinches against a ghost instead of panning. Viewport lifts get here too,
  // already emptied out by the listeners above.
  const forgetPointer = (e) => {
    if (!pointers.has(e.pointerId)) return;
    endDrag(e);
  };
  window.addEventListener('pointerup', forgetPointer);
  window.addEventListener('pointercancel', forgetPointer);

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
    // Touch empty-board create used to live on double-tap; that path is gone.
    // Browsers also synthesise dblclick from a touch double-tap, so skip it.
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
    createNote({ at: { x: p.x - noteCreateSize(phone()).w / 2, y: p.y - 24 } });
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

  function recenterBoard() {
    const rects = boardNotes().map(noteRect);
    const r = viewport.getBoundingClientRect();
    if (!rects.length) {
      vp.panX = 0;
      vp.panY = 0;
    } else {
      const next = centerViewportOnRects(rects, r.width, r.height, vp.zoom);
      vp.panX = next.panX;
      vp.panY = next.panY;
    }
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
    const r = viewport.getBoundingClientRect();
    const next = centerViewportOnRects(rects, r.width, r.height, vp.zoom);
    vp.panX = next.panX;
    vp.panY = next.panY;
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
  if (els.ebMedia) els.ebMedia.innerHTML = MEDIA_SVG;
  onPress(els.ebTrash, () => {
    deleteNotes([editingId]);
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
  if (els.ebMedia) {
    onPress(els.ebMedia, () => {
      const note = noteById(editingId);
      if (note) openPopover(els.ebMediaPop, () => renderMediaPopover(note));
    });
    onPress(els.ebMediaSave, saveMedia);
    onPress(els.ebMediaRemove, removeMedia);
    els.ebMediaUrl?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        saveMedia();
      }
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
    /** Re-focus the phone compose field after +'s click default. */
    focusCompose() {
      if (composeBody && compose && !compose.hidden) focusWithoutScroll(composeBody);
    },
    /** Arm the pen; the next press on the board writes there. */
    startText: () => setTextMode(!textMode),
    wipe,
    zoomIn: () => zoomBy(1.2),
    zoomOut: () => zoomBy(1 / 1.2),
    zoomFit,
    recenterBoard,
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
