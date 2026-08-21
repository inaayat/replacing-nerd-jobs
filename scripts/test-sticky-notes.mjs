// Tests for the Sticky Notes v1 pure model (sticky-notes/notes.js).
// Run: node scripts/test-sticky-notes.mjs
import {
  COLOR_KEYS,
  DEFAULT_COLOR_KEY,
  GUEST_STORAGE_KEY,
  LEGEND_DEFAULTS,
  NOTE_H_DEFAULT,
  NOTE_H_PHONE,
  NOTE_W_DEFAULT,
  NOTE_W_PHONE,
  NOTE_W_MAX,
  NOTE_W_MIN,
  OPLOG_KEY,
  STORAGE_KEY,
  applyOps,
  arrowEndpoints,
  bbox,
  blankNote,
  colorHex,
  docIsEmpty,
  DOC_MAX_BLOCKS,
  draftDocFromNotes,
  emptyDoc,
  emptyState,
  findFreeSlot,
  fitViewport,
  headingTriggerFor,
  HREF_MAX,
  BOARD_VIEW_KEY,
  BOARD_VIEW_KEY_V1,
  defaultBoardView,
  phoneBoardViewNeedsReset,
  isLoneUrl,
  approach,
  displayedKeyboardSlice,
  KEYBOARD_INSET_TAU,
  keyboardInset,
  keyboardLayout,
  legendLabel,
  noteCreateSize,
  listTriggerFor,
  mergeStates,
  migrateLegacyStore,
  noteBlocks,
  normalizeDoc,
  normalizeHref,
  normalizeNote,
  normalizeRich,
  normalizeState,
  phoneNoteZoom,
  placeEditPopover,
  planEditSession,
  rectsIntersect,
  richFromNode,
  richToText,
  screenToWorld,
  stateIsEmpty,
  stateToOps,
  textToRich,
  urlDomain,
  visibleSlice,
  wipeTargets,
  worldToScreen,
  zoomAt,
} from '../sticky-notes/notes.js';
import { sortBoardNotes } from '../sticky-notes/table.js';
import { memorySections } from '../sticky-notes/memory.js';

let failures = 0;
function assert(cond, label) {
  if (cond) return;
  failures += 1;
  console.error(`FAIL: ${label}`);
}
function eq(a, b, label) {
  assert(Object.is(a, b), `${label} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}

function state(...ops) {
  return applyOps(emptyState(), ops);
}
function note(id, extra = {}) {
  return { op: 'note.upsert', note: { id, text: `note ${id}`, ...extra } };
}

// 1. normalizeNote defaults and validation
{
  const n = normalizeNote({ text: '  hi  ', colorKey: 'nope', iconKey: 'bogus', w: 9999, h: -3 });
  eq(n.text, 'hi', 'normalizeNote trims');
  eq(n.colorKey, null, 'bad colorKey coerced to null');
  eq(n.iconKey, null, 'bad iconKey coerced to null');
  eq(n.w, NOTE_W_MAX, 'w clamped to max');
  eq(n.h, 48, 'h clamped to min');
  eq(n.status, 'board', 'default status board');
  eq(n.pinned, false, 'default unpinned');
  const blankish = normalizeNote({ text: '   ', id: 'empty' });
  eq(blankish.text, '', 'whitespace-only text is kept as a blank note');
  eq(blankish.rich, null, 'a blank note stores no body');
  const ok = normalizeNote({ text: 'x', colorKey: 'c3', iconKey: 'star', w: 200 });
  eq(ok.colorKey, 'c3', 'valid colorKey kept');
  eq(ok.iconKey, 'star', 'valid iconKey kept');
  assert(ok.w >= NOTE_W_MIN, 'valid width kept above min');
}

// 2. v0 migration
{
  const legacy = {
    version: 1,
    notes: [
      {
        id: 'a', text: 'old note', color: 'pink', x: 10, y: 20, width: 260, height: 200,
        rotation: 2.4, pinned: true, createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z', source: { url: 'https://ex.com/p', title: 'Ex' },
      },
      { id: 'b', text: '', color: 'blue' },
    ],
  };
  const migrated = migrateLegacyStore(legacy);
  eq(migrated.length, 1, 'migration drops empty-text notes');
  const m = migrated[0];
  eq(m.colorKey, 'c2', 'legacy pink → c2');
  eq(m.w, 260, 'legacy width kept as w');
  eq(m.h, 200, 'legacy height kept as h');
  eq(m.pinned, true, 'legacy pinned kept');
  eq(m.sourceUrl, 'https://ex.com/p', 'legacy source url kept');
  assert(!('rotation' in m), 'rotation dropped');
}

// 3. LWW merge both directions
{
  const older = { id: 'n1', text: 'old', updatedAt: '2025-01-01T00:00:00.000Z' };
  const newer = { id: 'n1', text: 'new', updatedAt: '2025-06-01T00:00:00.000Z' };
  const a = mergeStates({ notes: [older] }, { notes: [newer, { id: 'n2', text: 'extra' }] });
  eq(a.notes.find((n) => n.id === 'n1').text, 'new', 'incoming newer wins');
  eq(a.notes.length, 2, 'unknown ids append');
  const b = mergeStates({ notes: [newer] }, { notes: [older] });
  eq(b.notes.find((n) => n.id === 'n1').text, 'new', 'base newer survives');
}

// 4. applyOps core semantics
{
  let s = state(note('a', { colorKey: 'c1' }), note('b'), note('p', { pinned: true }));
  s = applyOps(s, [{ op: 'note.categorize', ids: ['a', 'b'], iconKey: 'idea' }]);
  eq(s.notes.find((n) => n.id === 'a').colorKey, 'c1', 'categorize leaves unprovided axis');
  eq(s.notes.find((n) => n.id === 'b').iconKey, 'idea', 'categorize stamps icon');

  s = applyOps(s, [{ op: 'note.move', id: 'a', x: 500, y: 640 }]);
  s = applyOps(s, [{ op: 'file', ids: ['a'], ts: '2025-06-01T00:00:00.000Z' }]);
  const filed = s.notes.find((n) => n.id === 'a');
  eq(filed.status, 'memory', 'file sets memory');
  eq(filed.filedAt, '2025-06-01T00:00:00.000Z', 'file stamps filedAt');
  eq(filed.x, 500, 'file keeps x');
  s = applyOps(s, [{ op: 'restore', ids: ['a'] }]);
  const back = s.notes.find((n) => n.id === 'a');
  eq(back.status, 'board', 'restore returns to board');
  eq(back.filedAt, null, 'restore clears filedAt');
  eq(back.x, 500, 'restore keeps arrangement');

  s = applyOps(s, [
    { op: 'file', ids: ['a'] },
    { op: 'restore', ids: ['a'] },
    { op: 'note.move', id: 'a', x: 80, y: 90 },
  ]);
  const dropped = s.notes.find((n) => n.id === 'a');
  eq(dropped.status, 'board', 'restore + move is a spatial restore');
  eq(dropped.x, 80, 'spatial restore lands at drop x');
  eq(dropped.y, 90, 'spatial restore lands at drop y');

  s = applyOps(s, [{ op: 'wipe', ts: '2025-07-01T00:00:00.000Z' }]);
  eq(s.notes.find((n) => n.id === 'p').status, 'board', 'wipe skips pinned');
  eq(s.notes.find((n) => n.id === 'b').status, 'memory', 'wipe files loose notes');
  eq(s.notes.find((n) => n.id === 'b').collectionId, null, 'wipe invents no collection');

  s = applyOps(s, [{ op: 'note.pin', ids: ['p'], pinned: false }]);
  eq(s.notes.find((n) => n.id === 'p').pinned, false, 'pin toggles off');
  s = applyOps(s, [{ op: 'note.resize', id: 'p', w: 5, h: 10000 }]);
  eq(s.notes.find((n) => n.id === 'p').w, NOTE_W_MIN, 'resize clamps width');
  eq(s.notes.find((n) => n.id === 'p').h, 10000, 'resize allows tall');

  // collection lifecycle
  let c = state(note('x'), note('y'), { op: 'collection.create', id: 'col', name: 'Japan trip' });
  c = applyOps(c, [{ op: 'collection.assign', ids: ['x', 'y'], collectionId: 'col' }]);
  c = applyOps(c, [{ op: 'file', collectionId: 'col', ts: '2025-08-01T00:00:00.000Z' }]);
  eq(c.collections[0].status, 'memory', 'filing a collection files the row');
  eq(c.notes.filter((n) => n.status === 'memory').length, 2, 'filing a collection files members');
  c = applyOps(c, [{ op: 'collection.delete', id: 'col', deleteNotes: false }]);
  eq(c.collections.length, 0, 'collection deleted');
  assert(c.notes.every((n) => n.collectionId === null), 'members orphaned to loose');

  let d = state(note('x'), { op: 'collection.create', id: 'col', name: 'Del' });
  d = applyOps(d, [
    { op: 'collection.assign', ids: ['x'], collectionId: 'col' },
    { op: 'collection.delete', id: 'col', deleteNotes: true },
  ]);
  eq(d.notes.length, 0, 'collection.delete deleteNotes removes members');

  // wipe keeps a collection on board while a pinned member remains
  let e = state(
    note('m1', { pinned: true }),
    note('m2'),
    { op: 'collection.create', id: 'cc', name: 'Mixed' },
    { op: 'collection.assign', ids: ['m1', 'm2'], collectionId: 'cc' },
  );
  const targets = wipeTargets(e);
  assert(!targets.collectionIds.includes('cc'), 'wipeTargets keeps collection with pinned member');
  e = applyOps(e, [{ op: 'wipe' }]);
  eq(e.collections[0].status, 'board', 'wipe keeps collection with pinned member on board');
}

// 5. arrows
{
  let s = state(note('a'), note('b'), note('c'));
  s = applyOps(s, [{ op: 'arrow.create', id: 'ar1', fromId: 'a', toId: 'b' }]);
  eq(s.arrows.length, 1, 'arrow created');
  s = applyOps(s, [
    { op: 'arrow.create', id: 'ar2', fromId: 'a', toId: 'a' },
    { op: 'arrow.create', id: 'ar3', fromId: 'a', toId: 'ghost' },
    { op: 'arrow.create', id: 'ar4', fromId: 'a', toId: 'b' },
  ]);
  eq(s.arrows.length, 1, 'self-loop, unknown endpoint, duplicate all rejected');
  const filedBack = applyOps(s, [{ op: 'file', ids: ['a', 'b'] }, { op: 'restore', ids: ['a', 'b'] }]);
  eq(filedBack.arrows.length, 1, 'arrow survives file + restore');
  const afterDelete = applyOps(s, [{ op: 'note.delete', ids: ['b'] }]);
  eq(afterDelete.arrows.length, 0, 'note.delete cascades to arrows');
  const removed = applyOps(s, [{ op: 'arrow.delete', ids: ['ar1'] }]);
  eq(removed.arrows.length, 0, 'arrow.delete removes');

  const seg = arrowEndpoints({ x: 0, y: 0, w: 100, h: 100 }, { x: 300, y: 0, w: 100, h: 100 });
  eq(seg.x1, 100, 'arrow starts at source right edge');
  eq(seg.x2, 300, 'arrow ends at target left edge');
}

// 5b. delete undo round-trip — the board's trash restores notes and their arrows
{
  let s = state(note('a'), note('b'));
  s = applyOps(s, [{ op: 'arrow.create', id: 'ar1', fromId: 'a', toId: 'b' }]);
  const doomed = s.notes.filter((n) => n.id === 'a');
  const orphaned = s.arrows.filter((a) => a.fromId === 'a' || a.toId === 'a');
  const deleted = applyOps(s, [{ op: 'note.delete', ids: ['a'] }]);
  eq(deleted.notes.length, 1, 'note.delete removes the note outright, not to memory');
  assert(!deleted.notes.some((n) => n.status === 'memory'), 'delete is not a disguised file');
  const undone = applyOps(deleted, [
    ...doomed.map((n) => ({ op: 'note.upsert', note: n })),
    ...orphaned.map((a) => ({ op: 'arrow.create', id: a.id, fromId: a.fromId, toId: a.toId })),
  ]);
  eq(undone.notes.length, 2, 'undo brings the note back');
  eq(undone.arrows.length, 1, 'undo redraws the arrows that died with it');
  eq(undone.notes.find((n) => n.id === 'a').text, 'note a', 'undo keeps the text');
}

// 6. wipe undo round-trip
{
  let s = state(note('a'), note('b', { pinned: true }), {
    op: 'collection.create', id: 'col', name: 'C',
  });
  s = applyOps(s, [{ op: 'collection.assign', ids: ['a'], collectionId: 'col' }]);
  const before = s;
  const targets = wipeTargets(s);
  const wiped = applyOps(s, [{ op: 'wipe' }]);
  const undone = applyOps(wiped, [
    { op: 'restore', ids: targets.noteIds },
    ...targets.collectionIds.map((id) => ({ op: 'restore', collectionId: id })),
  ]);
  const strip = (st) => ({
    notes: st.notes.map(({ updatedAt, filedAt, ...rest }) => rest),
    collections: st.collections.map(({ updatedAt, filedAt, ...rest }) => rest),
  });
  eq(JSON.stringify(strip(undone)), JSON.stringify(strip(before)), 'wipe+undo round-trips');
}

// 7. rubber-band hit-test
{
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert(rectsIntersect(a, { x: 5, y: 5, w: 10, h: 10 }), 'overlap hits');
  assert(rectsIntersect(a, { x: 2, y: 2, w: 2, h: 2 }), 'containment hits');
  assert(rectsIntersect(a, { x: 10, y: 0, w: 5, h: 5 }), 'edge-touch hits');
  assert(!rectsIntersect(a, { x: 11, y: 0, w: 5, h: 5 }), 'miss misses');
}

// 8. free-slot placement
{
  const region = { x: 0, y: 0, w: 800, h: 600 };
  const rects = [];
  for (let i = 0; i < 6; i += 1) {
    const slot = findFreeSlot(region, rects);
    const rect = { x: slot.x, y: slot.y, w: 236, h: 140 };
    assert(!rects.some((r) => rectsIntersect(rect, r)), `slot ${i} does not overlap`);
    rects.push(rect);
  }
  const full = { x: 0, y: 0, w: 100, h: 100 };
  const cascade = findFreeSlot(full, rects);
  assert(Number.isFinite(cascade.x) && Number.isFinite(cascade.y), 'cascades when full');
}

// 9. legend
{
  const legend = normalizeState({ legend: { colors: { c1: 'Work', zz: 'Nope' }, icons: {} } }).legend;
  eq(legend.colors.c1, 'Work', 'override kept');
  assert(!('zz' in legend.colors), 'unknown key rejected');
  eq(legendLabel(legend, 'color', 'c1'), 'Work', 'override lookup');
  eq(legendLabel(legend, 'color', 'c2'), LEGEND_DEFAULTS.colors.c2.label, 'fallback to default');
  eq(legendLabel(legend, 'icon', 'star'), 'Starred', 'icon default');
  const cleared = applyOps(
    { ...emptyState(), legend },
    [{ op: 'legend.set', kind: 'color', key: 'c1', label: '' }],
  );
  assert(!('c1' in cleared.legend.colors), 'empty label clears override');
  const bad = applyOps(emptyState(), [{ op: 'legend.set', kind: 'color', key: 'zz', label: 'X' }]);
  assert(!('zz' in bad.legend.colors), 'legend.set rejects unknown key');
}

// 10. screen/world round-trip + fit
{
  for (const zoom of [0.4, 1, 2]) {
    const vp = { panX: 133, panY: -77, zoom };
    const p = { x: 421, y: 89 };
    const rt = worldToScreen(screenToWorld(p, vp), vp);
    assert(Math.abs(rt.x - p.x) < 1e-9 && Math.abs(rt.y - p.y) < 1e-9, `round-trip at zoom ${zoom}`);
  }
  const fit = fitViewport([{ x: 0, y: 0, w: 100, h: 100 }, { x: 900, y: 500, w: 100, h: 100 }], 1000, 700);
  assert(fit.zoom >= 0.4 && fit.zoom <= 2, 'fit zoom clamped');
  const box = bbox([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 30, w: 10, h: 10 }]);
  eq(box.w, 30, 'bbox width');
  eq(box.h, 40, 'bbox height');
}

// 11. zoomAt — pinch / wheel / button zoom all anchor the same way
{
  const vp = { panX: 40, panY: -25, zoom: 1 };
  const anchor = { x: 300, y: 180 };
  const before = screenToWorld(anchor, vp);
  const zoomed = zoomAt(vp, anchor, 1.5);
  eq(zoomed.zoom, 1.5, 'factor applied');
  const after = screenToWorld(anchor, zoomed);
  assert(
    Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.y - before.y) < 1e-9,
    'world point under the anchor is unmoved',
  );

  // Two half-steps equal one whole step: pinch accumulates without drift.
  const stepped = zoomAt(zoomAt(vp, anchor, 1.2), anchor, 1.25);
  const once = zoomAt(vp, anchor, 1.5);
  assert(
    Math.abs(stepped.zoom - once.zoom) < 1e-9 && Math.abs(stepped.panX - once.panX) < 1e-9,
    'incremental pinch matches a single step',
  );

  eq(zoomAt(vp, anchor, 100).zoom, 2, 'zoom clamped to max');
  eq(zoomAt(vp, anchor, 0.001).zoom, 0.4, 'zoom clamped to min');
  const pinned = zoomAt({ panX: 0, panY: 0, zoom: 2 }, anchor, 4);
  eq(pinned.panX, 0, 'a clamped zoom does not pan');
}

// 12. rich bodies — bold, bullets, numbers, and the plain projection
{
  const rich = [
    { type: 'p', spans: [{ text: 'Shop for ' }, { text: 'Sunday', bold: true }] },
    { type: 'ul', spans: [{ text: 'milk' }] },
    { type: 'ul', spans: [{ text: 'eggs' }] },
    { type: 'ol', spans: [{ text: 'book the van' }] },
    { type: 'ol', spans: [{ text: 'load it' }] },
  ];
  eq(
    richToText(rich),
    'Shop for Sunday\n• milk\n• eggs\n1. book the van\n2. load it',
    'plain projection marks lists and renumbers each run',
  );
  // Bold is the one thing the projection cannot carry, so compare line kinds
  // and words: a note that round-trips through plain text keeps its lists.
  const shape = (blocks) => blocks.map((b) => `${b.type}:${b.spans.map((s) => s.text).join('')}`);
  eq(
    JSON.stringify(shape(textToRich(richToText(rich)))),
    JSON.stringify(shape(normalizeRich(rich))),
    'text → rich → text round-trips the line kinds',
  );

  const messy = normalizeRich([
    { type: 'nope', spans: [{ text: 'a' }, { text: 'b' }] },
    { type: 'ul', spans: [{ text: 'x', bold: true }, { text: 'y', bold: true }] },
    { type: 'p', spans: [{ text: 'multi\nline' }] },
    { type: 'p', spans: [] },
    { type: 'p', spans: [{ text: '' }] },
  ]);
  eq(messy[0].type, 'p', 'unknown block type falls back to a paragraph');
  eq(messy[0].spans.length, 1, 'adjacent spans of equal weight merge');
  eq(messy[0].spans[0].text, 'ab', 'merged span keeps both halves');
  eq(messy[1].spans[0].bold, true, 'bold survives normalization');
  eq(messy[2].spans[0].text, 'multi line', 'a newline inside a line becomes a space');
  eq(messy.length, 3, 'trailing empty paragraphs are dropped');
  assert(normalizeRich([{ type: 'p', spans: [] }]) === null, 'an all-empty body is null');
  assert(normalizeRich('nope') === null, 'a non-array body is null');
  // The bullet somebody started and never typed into is not a line.
  const dangling = normalizeRich([
    { type: 'p', spans: [{ text: 'buy' }] },
    { type: 'ul', spans: [{ text: 'milk' }] },
    { type: 'ul', spans: [] },
  ]);
  eq(dangling.length, 2, 'a trailing empty list item is dropped');
  const blankInside = normalizeRich([
    { type: 'p', spans: [{ text: 'a' }] },
    { type: 'p', spans: [] },
    { type: 'p', spans: [{ text: 'b' }] },
  ]);
  eq(blankInside.length, 3, 'a blank line in the middle is kept');

  // A body written before formatting existed still reads as one.
  const legacy = noteBlocks({ text: 'Trip\n- passport\n- charger\n1. book\n2. pack' });
  eq(legacy.length, 5, 'plain text becomes one block per line');
  eq(legacy[1].type, 'ul', 'a "- " line reads as a bullet');
  eq(legacy[1].spans[0].text, 'passport', 'the marker is not part of the text');
  eq(legacy[3].type, 'ol', 'a "1. " line reads as a numbered item');
  eq(noteBlocks({ text: 'plain', rich: null })[0].type, 'p', 'plain lines stay paragraphs');

  // The stored note keeps text as the projection of the body, so memory search
  // and the memory table never see stale text.
  const note = normalizeNote({ id: 'n', text: 'stale', rich });
  eq(note.text, richToText(rich), 'rich body is authoritative over text');
  eq(note.rich.length, 5, 'rich body is kept on the note');
  const emptyBody = normalizeNote({ id: 'n', rich: [{ type: 'p', spans: [] }] });
  eq(emptyBody.text, '', 'an empty body is a blank note');
  eq(emptyBody.rich, null, 'an all-empty body stores as no body');
  eq(normalizeNote({ id: 'n', text: 'plain' }).rich, null, 'a plain note stores no body');
  const bad = normalizeNote({ id: 'n', text: 'kept', rich: { not: 'an array' } });
  eq(bad.text, 'kept', 'an unusable body falls back to the text');
}

// 13. list triggers — the marker-plus-space gesture
{
  for (const marker of ['*', '-', '+', '•']) {
    eq(listTriggerFor(marker), 'ul', `"${marker} " starts a bullet list`);
  }
  eq(listTriggerFor('1.'), 'ol', '"1. " starts a numbered list');
  eq(listTriggerFor('12)'), 'ol', '"12) " starts a numbered list');
  eq(listTriggerFor(''), null, 'a bare space is just a space');
  eq(listTriggerFor('milk *'), null, 'a marker mid-line is not a trigger');
  eq(listTriggerFor('**'), null, 'two asterisks are not a list');
  eq(listTriggerFor('word'), null, 'a word is not a trigger');
}

// 14. reading a body back out of the editor's DOM
{
  const el = (tagName, childNodes = [], style = null) => ({ nodeType: 1, tagName, childNodes, style });
  const text = (nodeValue) => ({ nodeType: 3, nodeValue });
  const body = el('DIV', [
    el('DIV', [text('Shop for '), el('B', [text('Sunday')])]),
    el('UL', [el('LI', [text('milk')]), el('LI', [text('eggs')])]),
    el('DIV', [el('BR')]),
    el('DIV', [text('note to self')]),
    el('OL', [el('LI', [el('SPAN', [text('one')], { fontWeight: '700' })])]),
  ]);
  const blocks = normalizeRich(richFromNode(body));
  eq(blocks.length, 6, 'each line and list item is one block');
  eq(blocks[0].spans.length, 2, 'a bold run is its own span');
  eq(blocks[0].spans[1].bold, true, '<b> reads as bold');
  eq(blocks[1].type, 'ul', 'list items keep their list kind');
  eq(blocks[2].type, 'ul', 'both list items survive');
  eq(blocks[3].type, 'p', 'a <br>-only line is a blank paragraph');
  eq(blocks[3].spans.length, 0, 'a blank line holds no spans');
  eq(blocks[5].type, 'ol', 'an ordered list reads as ordered');
  eq(blocks[5].spans[0].bold, true, 'font-weight: 700 reads as bold');
  eq(
    richToText(blocks),
    'Shop for Sunday\n• milk\n• eggs\n\nnote to self\n1. one',
    'the DOM read projects back to the same plain text',
  );
  eq(JSON.stringify(richFromNode(el('DIV', []))), '[]', 'an empty editor reads as no blocks');
}

// 15. new notes are light grey
{
  assert(COLOR_KEYS.includes(DEFAULT_COLOR_KEY), 'the default colour is a real palette key');
  eq(LEGEND_DEFAULTS.colors[DEFAULT_COLOR_KEY].label, 'Grey', 'the default colour is the grey');
  assert(/^#[0-9a-f]{6}$/i.test(colorHex(DEFAULT_COLOR_KEY)), 'the default colour has a hex');
  eq(COLOR_KEYS[0], DEFAULT_COLOR_KEY, 'the default leads every palette row');
  // Notes stored before the grey existed keep having no colour at all.
  eq(normalizeNote({ id: 'n', text: 'old' }).colorKey, null, 'an uncoloured note stays uncoloured');
  eq(normalizeNote({ id: 'n', text: 'x', colorKey: 'c1' }).colorKey, 'c1', 'stored colours are untouched');
}

// 16. board ink — lives on the board, never in memory, dies with a wipe
{
  const ink = (id, extra = {}) => ({ op: 'ink.upsert', ink: { id, text: `ink ${id}`, ...extra } });
  let s = state(note('a'), ink('i1', { x: 40, y: 60 }), ink('i2'));
  eq(s.ink.length, 2, 'ink.upsert adds board text');
  assert(!('status' in s.ink[0]), 'ink has no status, so it can never be filed');
  s = applyOps(s, [{ op: 'ink.move', id: 'i1', x: 300, y: 120 }]);
  eq(s.ink.find((i) => i.id === 'i1').x, 300, 'ink.move repositions');
  assert(applyOps(s, [ink('i3', { text: '  ' })]).ink.length === 2, 'empty ink is rejected');

  const targets = wipeTargets(s);
  eq(targets.ink.length, 2, 'wipeTargets captures the ink a wipe would destroy');
  const wiped = applyOps(s, [{ op: 'wipe', ts: '2025-09-01T00:00:00.000Z' }]);
  eq(wiped.ink.length, 0, 'wipe removes board ink');
  eq(wiped.notes.filter((n) => n.status === 'memory').length, 1, 'wipe still files notes');
  assert(
    !wiped.notes.some((n) => n.text.startsWith('ink ')),
    'wiped ink is not smuggled into memory as a note',
  );

  // Undo of a wipe re-upserts the ink, because it was deleted rather than filed.
  const undone = applyOps(wiped, [
    { op: 'restore', ids: targets.noteIds },
    ...targets.ink.map((row) => ({ op: 'ink.upsert', ink: row })),
  ]);
  eq(undone.ink.length, 2, 'undo brings the board ink back');
  eq(undone.ink.find((i) => i.id === 'i1').x, 300, 'undone ink keeps where it sat');

  const gone = applyOps(s, [{ op: 'ink.delete', ids: ['i1'] }]);
  eq(gone.ink.length, 1, 'ink.delete removes one');
  eq(gone.notes.length, 1, 'deleting ink leaves the notes alone');

  // Ink syncs like everything else: last write wins, unknown ids append.
  const older = { id: 'i1', text: 'old', updatedAt: '2025-01-01T00:00:00.000Z' };
  const newer = { id: 'i1', text: 'new', updatedAt: '2025-06-01T00:00:00.000Z' };
  const merged = mergeStates({ ink: [older] }, { ink: [newer, { id: 'i9', text: 'extra' }] });
  eq(merged.ink.find((i) => i.id === 'i1').text, 'new', 'newer ink wins the merge');
  eq(merged.ink.length, 2, 'unknown ink ids append');
  eq(normalizeState({}).ink.length, 0, 'a state with no ink normalizes to an empty list');
}

// 17. a new note is blank — creating it still puts it on the board
{
  const blank = blankNote({ colorKey: DEFAULT_COLOR_KEY, x: 120, y: 48 });
  eq(blank.text, '', 'a blank note carries no placeholder text');
  eq(blank.rich, null, 'a blank note has no body');
  eq(blank.colorKey, DEFAULT_COLOR_KEY, 'a blank note is already the default grey');
  eq(blank.status, 'board', 'a blank note is on the board');
  eq(blank.w, NOTE_W_DEFAULT, 'a blank note gets the default width');
  eq(blank.h, NOTE_H_DEFAULT, 'a blank note gets the default height');
  eq(noteCreateSize(false).w, NOTE_W_DEFAULT, 'desktop create keeps the small card');
  eq(noteCreateSize(false).h, NOTE_H_DEFAULT, 'desktop create keeps the short card');
  eq(noteCreateSize(true).w, NOTE_W_PHONE, 'phone create is a wider sticky');
  eq(noteCreateSize(true).h, NOTE_H_PHONE, 'phone create is a taller sticky');
  assert(NOTE_W_PHONE > NOTE_W_DEFAULT, 'phone width is larger than desktop');
  assert(NOTE_H_PHONE > NOTE_H_DEFAULT, 'phone height is larger than desktop');
  const phoneBlank = blankNote({ ...noteCreateSize(true), colorKey: DEFAULT_COLOR_KEY });
  eq(phoneBlank.w, NOTE_W_PHONE, 'blankNote honors the phone create width');
  eq(phoneBlank.h, NOTE_H_PHONE, 'blankNote honors the phone create height');
  eq(blank.x, 120, 'a blank note keeps the slot it was given');
  assert(Boolean(blank.id), 'a blank note has an id to render and edit against');
  eq(noteBlocks(blank).length, 1, 'a blank note renders as one empty line');
  eq(noteBlocks(blank)[0].spans.length, 0, 'that line holds nothing');

  // A create is a real note even if nobody types. Ending the edit with an
  // empty body must upsert, not delete.
  const created = applyOps(emptyState(), [{ op: 'note.upsert', note: blank }]);
  eq(created.notes.length, 1, 'upserting a blank note stores it');
  eq(created.notes[0].text, '', 'the stored note stays empty');
  eq(created.notes[0].colorKey, DEFAULT_COLOR_KEY, 'the default grey survives the upsert');
  eq(created.notes[0].id, blank.id, 'and it keeps the id the card was drawn with');
  const committed = applyOps(created, [
    { op: 'note.upsert', note: { ...created.notes[0], text: '', rich: null, updatedAt: '2026-08-21T00:00:00.000Z' } },
  ]);
  eq(committed.notes.length, 1, 'committing an empty body does not delete the note');
  eq(committed.notes[0].text, '', 'the committed note is still blank');
  const typed = applyOps(created, [
    { op: 'note.upsert', note: { ...blank, text: 'first words' } },
  ]);
  eq(typed.notes.length, 1, 'the same note stores once it has text');
  eq(typed.notes[0].colorKey, DEFAULT_COLOR_KEY, 'the colour chosen while composing survives');
  eq(typed.notes[0].id, blank.id, 'and it keeps the id the card was drawn with');

  const guestBlank = applyOps(emptyState(), [{ op: 'note.upsert', note: blank }]);
  const adoptedBlank = applyOps(emptyState(), stateToOps(guestBlank));
  eq(adoptedBlank.notes.length, 1, 'a guest blank note survives the sign-in replay');
  eq(adoptedBlank.notes[0].text, '', 'and it is still blank');

  const wiped = applyOps(created, [{ op: 'wipe' }]);
  eq(wiped.notes[0].status, 'memory', 'wipe files a blank board note rather than deleting it');
  eq(applyOps(created, [{ op: 'note.delete', ids: [blank.id] }]).notes.length, 0,
    'trash still deletes a blank note');
}

// 18. mass delete — a selection discarded, not filed, and undoable
{
  let s = state(note('a'), note('b'), note('c', { pinned: true }), note('keep'));
  s = applyOps(s, [
    { op: 'arrow.create', id: 'ar1', fromId: 'a', toId: 'b' },
    { op: 'arrow.create', id: 'ar2', fromId: 'b', toId: 'keep' },
  ]);
  const selection = ['a', 'b', 'c'];
  const doomed = s.notes.filter((n) => selection.includes(n.id));
  const gone = new Set(selection);
  const orphaned = s.arrows.filter((a) => gone.has(a.fromId) || gone.has(a.toId));
  const deleted = applyOps(s, [{ op: 'note.delete', ids: selection }]);
  eq(deleted.notes.length, 1, 'every selected note is removed at once');
  eq(deleted.notes[0].id, 'keep', 'the unselected note is untouched');
  assert(!deleted.notes.some((n) => n.status === 'memory'), 'a mass delete files nothing to memory');
  assert(
    !applyOps(s, [{ op: 'note.delete', ids: selection }]).notes.some((n) => n.pinned),
    'a pinned note in the selection goes too — this is not a wipe',
  );
  eq(deleted.arrows.length, 0, 'arrows into and out of the deleted notes go with them');

  const undone = applyOps(deleted, [
    ...doomed.map((n) => ({ op: 'note.upsert', note: n })),
    ...orphaned.map((a) => ({ op: 'arrow.create', id: a.id, fromId: a.fromId, toId: a.toId })),
  ]);
  eq(undone.notes.length, 4, 'undo brings the whole selection back');
  eq(undone.arrows.length, 2, 'undo redraws every arrow that died with it');
  assert(undone.notes.find((n) => n.id === 'c').pinned, 'undo restores the pin');
}

// 19. the guest hand-off — a signed-out board replayed into an account
{
  assert(GUEST_STORAGE_KEY !== STORAGE_KEY, 'a guest board is not the account mirror');
  assert(GUEST_STORAGE_KEY !== OPLOG_KEY, 'and it is not the op queue either');

  assert(stateIsEmpty(emptyState()), 'an untouched board is empty');
  assert(stateIsEmpty(null), 'so is no board at all');
  assert(!stateIsEmpty(state(note('a'))), 'one note is not empty');
  assert(
    !stateIsEmpty(applyOps(emptyState(), [{ op: 'ink.upsert', ink: { id: 'i', text: 'label' } }])),
    'board ink alone is worth keeping too',
  );

  let guest = state(
    note('g1', { colorKey: 'c1', iconKey: 'idea', x: 40, y: 60, pinned: true }),
    note('g2'),
    note('g3'),
    { op: 'collection.create', id: 'col', name: 'Guest trip' },
    { op: 'ink.upsert', ink: { id: 'i1', text: 'over here', x: 12, y: 8 } },
    { op: 'legend.set', kind: 'color', key: 'c1', label: 'Urgent' },
  );
  guest = applyOps(guest, [
    { op: 'collection.assign', ids: ['g2', 'g3'], collectionId: 'col' },
    { op: 'arrow.create', id: 'ar1', fromId: 'g1', toId: 'g2' },
    { op: 'file', collectionId: 'col', ids: ['g2', 'g3'], ts: '2025-09-09T00:00:00.000Z' },
  ]);

  const adopted = applyOps(emptyState(), stateToOps(guest));
  const shape = (st) => JSON.stringify({
    notes: st.notes.map((n) => [n.id, n.text, n.colorKey, n.iconKey, n.status, n.collectionId, n.pinned, n.x]),
    collections: st.collections.map((c) => [c.id, c.name, c.status]),
    arrows: st.arrows.map((a) => [a.fromId, a.toId]),
    ink: (st.ink || []).map((i) => [i.id, i.text, i.x]),
    legend: st.legend,
  });
  eq(shape(adopted), shape(guest), 'replaying a guest board reproduces it exactly');
  // Replaying twice is what a double sign-in would do, and it must not clone.
  eq(applyOps(adopted, stateToOps(guest)).notes.length, guest.notes.length, 'a replay is idempotent');
  eq(applyOps(adopted, stateToOps(guest)).arrows.length, 1, 'and draws no duplicate arrows');
}

// misc: URL helpers
{
  assert(isLoneUrl('https://example.com/a?b=1'), 'lone https url detected');
  assert(!isLoneUrl('see https://example.com now'), 'url inside prose rejected');
  assert(!isLoneUrl('ftp://example.com'), 'non-http rejected');
  eq(urlDomain('https://www.nytimes.com/2025/x'), 'nytimes.com', 'domain strips www');
}

// 17. span href — pills: normalize, merge, reject, project display text
{
  eq(normalizeHref('https://example.com/a'), 'https://example.com/a', 'http(s) href kept');
  eq(normalizeHref('http://ok.com'), 'http://ok.com', 'http kept');
  assert(normalizeHref('ftp://example.com') === null, 'ftp rejected');
  assert(normalizeHref('javascript:alert(1)') === null, 'javascript rejected');
  assert(normalizeHref(`https://ok.com/${'a'.repeat(HREF_MAX)}`) === null, 'overlong href rejected');
  assert(normalizeHref('  https://ok.com  ') === 'https://ok.com', 'href is trimmed');

  const linked = normalizeRich([
    {
      type: 'p',
      spans: [
        { text: 'See ' },
        { text: 'Example', href: 'https://example.com' },
        { text: ' now' },
      ],
    },
  ]);
  eq(linked[0].spans[1].href, 'https://example.com', 'normalizeRich keeps a valid href');
  eq(richToText(linked), 'See Example now', 'richToText projects display text only');
  assert(!JSON.stringify(richToText(linked)).includes('https://'), 'the URL is not in the projection');

  const merged = normalizeRich([
    {
      type: 'p',
      spans: [
        { text: 'ab', href: 'https://a.com', bold: true },
        { text: 'cd', href: 'https://a.com', bold: true },
      ],
    },
  ]);
  eq(merged[0].spans.length, 1, 'adjacent spans merge when bold and href match');
  eq(merged[0].spans[0].text, 'abcd', 'merged href span concatenates text');

  const split = normalizeRich([
    {
      type: 'p',
      spans: [
        { text: 'ab', href: 'https://a.com' },
        { text: 'cd', href: 'https://b.com' },
        { text: 'ef', bold: true, href: 'https://a.com' },
        { text: 'gh', href: 'https://a.com' },
        { text: 'ij' },
      ],
    },
  ]);
  eq(split[0].spans.length, 5, 'different href or bold do not merge');
  assert(!split[0].spans[4].href, 'a plain span has no href key');

  const bad = normalizeRich([
    {
      type: 'p',
      spans: [
        { text: 'x', href: 'ftp://example.com', bold: true },
        { text: 'y', href: 'javascript:alert(1)' },
        { text: 'good', href: 'http://ok.com' },
      ],
    },
  ]);
  assert(!bad[0].spans[0].href, 'ftp dropped from the span');
  eq(bad[0].spans[0].text, 'x', 'rejected href keeps the display text');
  assert(!bad[0].spans[1].href, 'javascript dropped from the span');
  eq(bad[0].spans[2].href, 'http://ok.com', 'valid href survives a mixed line');

  const el = (tagName, childNodes = [], extra = {}) => ({
    nodeType: 1, tagName, childNodes, style: extra.style || null,
    href: extra.href, getAttribute: (n) => (n === 'href' ? extra.href : null),
    textContent: extra.textContent,
  });
  const text = (nodeValue) => ({ nodeType: 3, nodeValue });
  const anchored = el('DIV', [
    el('DIV', [
      text('See '),
      el('A', [text('Example')], { href: 'https://example.com', textContent: 'Example' }),
    ]),
  ]);
  const fromDom = normalizeRich(richFromNode(anchored));
  eq(fromDom[0].spans.length, 2, 'richFromNode splits the anchor into its own span');
  eq(fromDom[0].spans[1].href, 'https://example.com', 'richFromNode reads the href');
  eq(fromDom[0].spans[1].text, 'Example', 'anchor display text is the span text');
  eq(richToText(fromDom), 'See Example', 'DOM-read pills project display text');
}

// 18. table view sort — colour legend order, then collection A→Z, loose last
{
  const s = {
    collections: [
      { id: 'zeta', name: 'Zeta' },
      { id: 'alpha', name: 'Alpha' },
    ],
  };
  const notes = [
    { id: 'loose-c1', colorKey: 'c1', collectionId: null, updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'zeta-c7', colorKey: 'c7', collectionId: 'zeta', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'alpha-c7-old', colorKey: 'c7', collectionId: 'alpha', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'alpha-c7-new', colorKey: 'c7', collectionId: 'alpha', updatedAt: '2026-06-01T00:00:00.000Z' },
    { id: 'none', colorKey: null, collectionId: null, updatedAt: '2026-01-01T00:00:00.000Z' },
  ];
  eq(
    sortBoardNotes(s, notes).map((n) => n.id).join(','),
    'alpha-c7-new,alpha-c7-old,zeta-c7,loose-c1,none',
    'c7 before c1 before uncoloured; Alpha before Zeta; loose last; newer first',
  );
}

// 19. wiki documents — whitelist, caps, LWW, delete, memory-status create
{
  const doc = normalizeDoc({
    blocks: [
      { type: 'h1', spans: [{ text: 'Trip' }] },
      { type: 'h2', spans: [{ text: 'Yellow' }] },
      { type: 'ul', spans: [{ text: 'passport' }], noteId: 'n1' },
      { type: 'hr' },
      { type: 'script', spans: [{ text: 'nope' }] },
      { type: 'h3', spans: [{ text: 'demoted' }] },
    ],
  });
  eq(doc.blocks[0].type, 'h1', 'normalizeDoc keeps h1');
  eq(doc.blocks[1].type, 'h2', 'normalizeDoc keeps h2');
  eq(doc.blocks[2].noteId, 'n1', 'normalizeDoc keeps pull provenance');
  eq(doc.blocks[3].type, 'hr', 'normalizeDoc keeps a rule');
  eq(doc.blocks[4].type, 'p', 'unknown wiki block types become paragraphs');
  eq(doc.blocks[5].type, 'p', 'h3 is wiki-unknown and becomes a paragraph');
  assert(normalizeRich(doc.blocks)[0].type === 'p', 'normalizeRich still refuses headings');
  assert(docIsEmpty(emptyDoc()), 'an empty doc is empty');
  assert(docIsEmpty({ blocks: [{ type: 'p', spans: [] }] }), 'blank paragraphs count as empty');
  assert(!docIsEmpty(doc), 'a heading is not empty');

  const capped = normalizeDoc({
    blocks: Array.from({ length: DOC_MAX_BLOCKS + 40 }, (_, i) => ({
      type: 'p',
      spans: [{ text: `line ${i}` }],
    })),
  });
  eq(capped.blocks.length, DOC_MAX_BLOCKS, 'normalizeDoc caps at 600 blocks');
  const fat = normalizeDoc({
    blocks: [{
      type: 'p',
      spans: Array.from({ length: 200 }, (_, i) => ({ text: `s${i}`, bold: i % 2 === 0 })),
    }],
  });
  eq(fat.blocks[0].spans.length, 120, 'wiki spans share the 120-span cap');

  eq(headingTriggerFor('#'), 'h1', '"# " starts a heading');
  eq(headingTriggerFor('##'), 'h2', '"## " starts a subheading');
  eq(headingTriggerFor('###'), null, 'h3 is not a trigger');
  eq(headingTriggerFor('# title'), null, 'a heading marker must be alone');

  const notes = [
    { id: 'a', text: 'milk', colorKey: 'c1' },
    { id: 'b', text: 'eggs', colorKey: 'c1' },
    { id: 'c', text: 'plain', colorKey: null },
  ];
  const draft = draftDocFromNotes(notes, { colors: { c1: 'Shop' } });
  eq(draft.blocks[0].type, 'h2', 'draft starts a colour-group heading');
  eq(draft.blocks[0].spans[0].text, 'Shop', 'draft uses the legend label');
  eq(draft.blocks.filter((b) => b.type === 'ul').length, 3, 'draft makes one bullet per note');
  eq(draft.blocks.find((b) => b.noteId === 'a').spans[0].text, 'milk', 'draft notes stay raw');

  let s = applyOps(emptyState(), [{ op: 'collection.create', id: 'col', name: 'Japan' }]);
  const older = {
    op: 'wiki.set',
    collectionId: 'col',
    doc: { blocks: [{ type: 'p', spans: [{ text: 'old' }] }] },
    ts: '2025-01-01T00:00:00.000Z',
  };
  const newer = {
    op: 'wiki.set',
    collectionId: 'col',
    doc: { blocks: [{ type: 'h1', spans: [{ text: 'new' }] }] },
    ts: '2025-06-01T00:00:00.000Z',
  };
  const forward = applyOps(s, [older, newer]);
  eq(forward.wikis[0].doc.blocks[0].spans[0].text, 'new', 'wiki.set newer wins');
  const reverse = applyOps(applyOps(s, [newer]), [older]);
  eq(reverse.wikis[0].doc.blocks[0].spans[0].text, 'new', 'wiki.set older loses both directions');

  const mergedNew = mergeStates(
    { collections: [{ id: 'col', name: 'Japan' }], wikis: [{ collectionId: 'col', doc: older.doc, updatedAt: older.ts }] },
    { collections: [{ id: 'col', name: 'Japan' }], wikis: [{ collectionId: 'col', doc: newer.doc, updatedAt: newer.ts }] },
  );
  eq(mergedNew.wikis[0].doc.blocks[0].spans[0].text, 'new', 'merge incoming newer wiki wins');
  const mergedOld = mergeStates(
    { collections: [{ id: 'col', name: 'Japan' }], wikis: [{ collectionId: 'col', doc: newer.doc, updatedAt: newer.ts }] },
    { collections: [{ id: 'col', name: 'Japan' }], wikis: [{ collectionId: 'col', doc: older.doc, updatedAt: older.ts }] },
  );
  eq(mergedOld.wikis[0].doc.blocks[0].spans[0].text, 'new', 'merge base newer wiki survives');

  const ghost = applyOps(emptyState(), [{
    op: 'wiki.set', collectionId: 'missing', doc: { blocks: [{ type: 'p', spans: [{ text: 'x' }] }] },
  }]);
  eq(ghost.wikis.length, 0, 'wiki.set without a collection is a no-op');

  const gone = applyOps(forward, [{ op: 'collection.delete', id: 'col', deleteNotes: false }]);
  eq(gone.wikis.length, 0, 'collection.delete removes the wiki');
  eq(normalizeState({
    collections: [],
    wikis: [{ collectionId: 'col', doc: newer.doc, updatedAt: newer.ts }],
  }).wikis.length, 0, 'a wiki whose collection is gone is dropped');

  let mem = applyOps(emptyState(), [
    { op: 'collection.create', id: 'inbox', name: 'Inbox', status: 'memory' },
  ]);
  eq(mem.collections[0].status, 'memory', 'collection.create can start in memory');
  mem = applyOps(mem, [{ op: 'wipe', ts: '2025-09-01T00:00:00.000Z' }]);
  eq(mem.collections[0].status, 'memory', 'a memory collection survives wipe unfiled');
  eq(mem.collections.length, 1, 'wipe does not invent or drop the empty memory collection');

  let guest = applyOps(emptyState(), [
    { op: 'collection.create', id: 'col', name: 'Page', status: 'memory' },
    { op: 'wiki.set', collectionId: 'col', doc: { blocks: [{ type: 'h1', spans: [{ text: 'Hello' }] }] }, ts: '2025-09-09T00:00:00.000Z' },
  ]);
  const adopted = applyOps(emptyState(), stateToOps(guest));
  eq(adopted.wikis[0].doc.blocks[0].spans[0].text, 'Hello', 'stateToOps carries the wiki');
  eq(adopted.collections[0].status, 'memory', 'stateToOps keeps a memory collection in memory');
  assert(!stateIsEmpty(guest), 'a collection-only board is worth keeping');
}

// 20. Memory list — empty memory-status collections must still render
{
  const inbox = { id: 'inbox', name: 'Inbox', status: 'memory', filedAt: '2026-01-02T00:00:00.000Z' };
  const trip = { id: 'trip', name: 'Trip', status: 'board' };
  const filed = { id: 'filed', name: 'Filed', status: 'memory', filedAt: '2026-01-01T00:00:00.000Z' };
  const note = { id: 'n1', text: 'milk', collectionId: 'filed', status: 'memory' };

  const empty = memorySections([inbox], []);
  eq(empty.cols.length, 1, 'an empty memory collection still gets a section');
  eq(empty.cols[0].notes.length, 0, 'that section has an empty notes array, not undefined');
  eq(empty.loose.length, 0, 'no loose notes when Memory is only an empty collection');

  const mixed = memorySections([inbox, trip, filed], [note]);
  eq(mixed.cols.map((s) => s.col.id).join(','), 'inbox,filed', 'empty memory first by filedAt; board-only collections stay hidden');
  eq(mixed.cols.find((s) => s.col.id === 'filed').notes[0].id, 'n1', 'filed notes stay under their collection');

  const filtered = memorySections([inbox, filed], [note], { search: 'milk' });
  eq(filtered.cols.length, 1, 'a search hides empty memory collections');
  eq(filtered.cols[0].col.id, 'filed', 'the collection that still has a matching note remains');
}

// 21. Phone edit chrome — keyboard is a layout inset; bar docks; no pan
{
  const slice = visibleSlice({ offsetTop: 200, height: 360 }, 800);
  eq(slice.top, 200, 'visibleSlice uses visualViewport.offsetTop');
  eq(slice.bottom, 560, 'visibleSlice bottom is offset + height');
  eq(keyboardInset({ offsetTop: 200, height: 360 }, 800), 240, 'keyboardInset is layout below the visual slice');
  eq(keyboardInset(null, 800), 0, 'no visualViewport means no keyboard inset');

  const kb = keyboardLayout({ offsetTop: 200, height: 360 }, 800);
  eq(kb.height, 360, 'keyboardLayout height is the visual slice');
  eq(kb.offsetTop, 200, 'keyboardLayout keeps visualViewport.offsetTop');
  eq(kb.inset, 240, 'keyboardLayout inset is layout below the slice');
  eq(kb.active, true, 'a 240 px keyboard is an active inset');
  eq(keyboardLayout(null, 800).active, false, 'no visualViewport means no layout inset');
  eq(keyboardLayout({ offsetTop: 0, height: 790 }, 800).active, false, 'a tiny chrome shrink is not a keyboard');

  const canvas = { top: 80, left: 8, right: 382, bottom: 800 };
  const desktop = planEditSession({
    card: { top: 300, bottom: 400, left: 80, width: 220 },
    barW: 200,
    barH: 32,
    canvas,
    visible: { top: 0, bottom: 800 },
    phone: false,
  });
  eq(desktop.dy, 0, 'desktop leaves a fully visible card unmoved');
  eq(desktop.docked, false, 'desktop never docks');
  eq(desktop.top, 260, 'desktop floats the bar above the card');

  const desktopTop = planEditSession({
    card: { top: 82, bottom: 160, left: 80, width: 220 },
    barW: 200,
    barH: 32,
    canvas,
    visible: { top: 0, bottom: 800 },
    phone: false,
  });
  eq(desktopTop.dy, 42, 'desktop nudges a top-edge card down for the bar');
  eq(desktopTop.top, 84, 'desktop then sits the bar on the canvas top');

  const phoneKb = planEditSession({
    card: { top: 400, bottom: 480, left: 80, width: 220 },
    barW: 280,
    barH: 36,
    canvas,
    visible: { top: 0, bottom: 360 },
    phone: true,
  });
  eq(phoneKb.dy, 0, 'phone never pans the camera for the keyboard');
  eq(phoneKb.docked, true, 'phone docks the slim bar on the remaining canvas');
  eq(phoneKb.top, 320, 'phone bar sits just above the visual bottom');
  eq(phoneKb.left, 12, 'docked bar starts at the canvas left');

  const alreadyUp = planEditSession({
    card: { top: 140, bottom: 420, left: 80, width: 220 },
    barW: 280,
    barH: 36,
    canvas,
    visible: { top: 0, bottom: 360 },
    phone: true,
  });
  eq(alreadyUp.dy, 0, 'phone does not chase a note that is already high');
  eq(alreadyUp.docked, true, 'phone still docks when the caret is already in view');
  eq(alreadyUp.top, 320, 'phone bar stays at the remaining-canvas bottom');

  const iosScroll = planEditSession({
    card: { top: 420, bottom: 500, left: 80, width: 220 },
    barW: 280,
    barH: 36,
    canvas,
    visible: { top: 200, bottom: 560 },
    phone: true,
  });
  eq(iosScroll.dy, 0, 'phone does not counter visualViewport.offsetTop with a pan');
  eq(iosScroll.docked, true, 'phone docks into the visual slice');
  eq(iosScroll.top, 520, 'docked bar uses visible.bottom, not the layout viewport');

  const cramped = planEditSession({
    card: { top: 50, bottom: 120, left: 80, width: 220 },
    barW: 280,
    barH: 36,
    canvas,
    visible: { top: 0, bottom: 90 },
    phone: true,
  });
  eq(cramped.docked, true, 'phone docks when the remaining slice is short');
  eq(cramped.top, 50, 'docked bar sits just above the visual bottom, not mid-canvas');

  const stepped = approach(0, 100, KEYBOARD_INSET_TAU, KEYBOARD_INSET_TAU);
  assert(Math.abs(stepped - (100 * (1 - Math.exp(-1)))) < 1e-6, 'one tau closes ~63% of the keyboard gap');
  eq(approach(40, 40, 0.016), 40, 'approach of an already-there value stays put');
  eq(approach(10, 80, 0), 10, 'zero dt does not jump the inset');
  eq(approach(10, 80, 0.016, 0), 80, 'zero tau snaps (reduced-motion path)');

  const mid = displayedKeyboardSlice({ offsetTop: 0, height: 360 }, 800, { height: 520, offsetTop: 0 });
  eq(mid.height, 520, 'in-flight shell height wins over visualViewport');
  eq(mid.bottom, 520, 'docked chrome uses the interpolated bottom');
  eq(mid.top, 0, 'in-flight offsetTop is kept');
  eq(
    displayedKeyboardSlice({ offsetTop: 200, height: 360 }, 800, null).height,
    360,
    'no in-flight size falls back to the visual slice',
  );
}

// 22. Phone board-view default and note zoom
{
  eq(BOARD_VIEW_KEY, 'sticky-notes-board-view-v2', 'v2 key is the live preference');
  eq(BOARD_VIEW_KEY_V1, 'sticky-notes-board-view', 'v1 key is the leftover #276 slot');
  eq(defaultBoardView(null, { coarse: true, width: 390 }), 'canvas', 'unset phone view is the board');
  eq(defaultBoardView(undefined, { coarse: true, width: 720 }), 'canvas', 'unset coarse 720 is the board');
  eq(defaultBoardView(null, { coarse: false, width: 390 }), 'canvas', 'unset desktop-pointer stays canvas even if narrow');
  eq(defaultBoardView(null, { coarse: true, width: 1024 }), 'canvas', 'unset coarse tablet/desktop width stays canvas');
  eq(defaultBoardView('canvas', { coarse: true, width: 390 }), 'canvas', 'a stored canvas pick wins on the phone');
  eq(defaultBoardView('table', { coarse: false, width: 1440 }), 'table', 'a stored table pick wins on desktop');
  eq(defaultBoardView('table', { coarse: true, width: 390 }), 'table', 'an explicit v2 table pick wins on the phone');
  eq(defaultBoardView('nope', { coarse: true, width: 390 }), 'canvas', 'garbage stored value is treated as unset');
  eq(
    defaultBoardView(null, { coarse: true, width: 390, legacy: 'table' }),
    'canvas',
    'leftover v1 table on the phone is ignored',
  );
  eq(
    defaultBoardView(null, { coarse: false, width: 1440, legacy: 'table' }),
    'table',
    'leftover v1 table on desktop is honored',
  );
  eq(
    defaultBoardView('canvas', { coarse: true, width: 390, legacy: 'table' }),
    'canvas',
    'v2 canvas beats a leftover v1 table on the phone',
  );
  eq(
    phoneBoardViewNeedsReset(null, { coarse: true, width: 390, legacy: 'table' }),
    true,
    'phone leftover table is a one-shot reset',
  );
  eq(
    phoneBoardViewNeedsReset('table', { coarse: true, width: 390, legacy: 'table' }),
    false,
    'explicit v2 table is not reset',
  );
  eq(
    phoneBoardViewNeedsReset(null, { coarse: false, width: 1440, legacy: 'table' }),
    false,
    'desktop leftover table is not reset',
  );

  const tiny = phoneNoteZoom({ zoom: 1, noteW: 220, viewW: 390, minScreenW: 260 });
  eq(tiny.changed, true, 'a 220 px card at zoom 1 is lifted on a phone');
  assert(tiny.zoom > 1, 'phone zoom rises so the card is tap-sized');
  assert(220 * tiny.zoom >= 260 - 0.01, 'lifted card meets the min on-screen width');

  const already = phoneNoteZoom({ zoom: 1, noteW: 288, viewW: 390, minScreenW: 260 });
  eq(already.changed, false, 'a phone-sized card at zoom 1 is left alone');
  eq(already.zoom, 1, 'phone-sized card keeps zoom 1');

  const desktopZoom = phoneNoteZoom({ zoom: 1, noteW: 220, viewW: 1200, minScreenW: 260 });
  assert(desktopZoom.zoom <= 1.2, 'wide viewports do not explode the zoom');
}

// 23. Edit-bar popovers — phone stays above the docked bar
{
  const wrap = { top: 328, bottom: 360, left: 80, right: 112 };
  const bar = { top: 324, bottom: 360 };
  const swatches = { width: 260, height: 46 };
  const ceiling = 84;
  const viewW = 390;

  const desktopRoom = placeEditPopover({
    wrap, bar, pop: swatches, ceiling, viewW, preferAbove: false,
  });
  eq(desktopRoom.above, true, 'desktop with room opens above the bar');
  eq(desktopRoom.bottom, 44, 'desktop above sits 8px over the whole bar');
  eq(desktopRoom.top, null, 'desktop above does not set top');
  eq(desktopRoom.maxHeight, null, 'a short swatch row needs no max-height');

  const desktopTight = placeEditPopover({
    wrap: { top: 90, bottom: 122, left: 80, right: 112 },
    bar: { top: 86, bottom: 122 },
    pop: { width: 260, height: 160 },
    ceiling: 84,
    viewW,
    preferAbove: false,
  });
  eq(desktopTight.above, false, 'desktop flips below when the ceiling is tight');
  eq(desktopTight.top, 40, 'desktop below sits 8px under the bar');
  eq(desktopTight.bottom, null, 'desktop below does not set bottom');

  const phoneKb = placeEditPopover({
    wrap, bar, pop: swatches, ceiling, viewW, preferAbove: true,
  });
  eq(phoneKb.above, true, 'phone colour popover opens above the docked bar');
  eq(phoneKb.bottom, 44, 'phone colour popover clears the whole bar');
  eq(phoneKb.top, null, 'phone colour popover does not flip to top');

  const phoneIcons = placeEditPopover({
    wrap, bar, pop: { width: 200, height: 280 }, ceiling, viewW, preferAbove: true,
  });
  eq(phoneIcons.above, true, 'phone icon popover stays above even when taller than the slice');
  eq(phoneIcons.bottom, 44, 'phone icon popover still clears the bar, never the keyboard');
  eq(phoneIcons.top, null, 'phone does not flip a tall picker below the docked bar');
  eq(phoneIcons.maxHeight, 232, 'phone caps a tall picker to the remaining canvas');

  const phoneLeft = placeEditPopover({
    wrap: { top: 328, bottom: 360, left: 4, right: 36 },
    bar,
    pop: swatches,
    ceiling,
    viewW,
    preferAbove: true,
  });
  eq(phoneLeft.shift, 116, 'phone nudges a left-edge swatch row back into the canvas');

  const phoneRight = placeEditPopover({
    wrap: { top: 328, bottom: 360, left: 350, right: 382 },
    bar,
    pop: swatches,
    ceiling,
    viewW,
    preferAbove: true,
  });
  eq(phoneRight.shift, -112, 'phone nudges a right-edge swatch row back into the canvas');
}

if (failures) {
  console.error(`${failures} sticky-notes test(s) failed`);
  process.exit(1);
}
console.log('sticky-notes model tests passed');
