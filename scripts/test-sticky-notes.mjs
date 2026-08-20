// Tests for the Sticky Notes v1 pure model (sticky-notes/notes.js).
// Run: node scripts/test-sticky-notes.mjs
import {
  LEGEND_DEFAULTS,
  NOTE_W_MAX,
  NOTE_W_MIN,
  applyOps,
  arrowEndpoints,
  bbox,
  emptyState,
  findFreeSlot,
  fitViewport,
  isLoneUrl,
  legendLabel,
  mergeStates,
  migrateLegacyStore,
  normalizeNote,
  normalizeState,
  rectsIntersect,
  screenToWorld,
  urlDomain,
  wipeTargets,
  worldToScreen,
  zoomAt,
} from '../sticky-notes/notes.js';

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
  assert(normalizeNote({ text: '   ' }) === null, 'empty text rejected');
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

// misc: URL helpers
{
  assert(isLoneUrl('https://example.com/a?b=1'), 'lone https url detected');
  assert(!isLoneUrl('see https://example.com now'), 'url inside prose rejected');
  assert(!isLoneUrl('ftp://example.com'), 'non-http rejected');
  eq(urlDomain('https://www.nytimes.com/2025/x'), 'nytimes.com', 'domain strips www');
}

if (failures) {
  console.error(`${failures} sticky-notes test(s) failed`);
  process.exit(1);
}
console.log('sticky-notes model tests passed');
