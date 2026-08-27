// Tests for the pure Packing Cubes logic (packing-cubes/engine/model.js):
// the list-first suitcase, user-built cubes, add-ons, organize, v1 migration.
//   node scripts/test-packing-cubes-model.mjs
import {
  itemKey,
  cubeAddOns,
  matchesQuery,
  sortCatalog,
  newSuitcase,
  isLegacySuitcase,
  migrateSuitcase,
  normalizeSuitcase,
  addItem,
  removeItem,
  updateItemLabel,
  setItemPacked,
  assignItem,
  packedStats,
  allPacked,
  attachCube,
  detachCube,
  addOnEnabled,
  setAddOn,
  releaseDeletedCube,
  groupedItems,
  unsortedCount,
  organizeTargets,
  assignmentKey,
  parseAssignment,
  addOnLabel,
  addonGroupKey,
  isDefaultCube,
  isDefaultAddOn,
  seedDefaults,
  expandContents,
  absorbItemIntoCube,
  filedInCube,
  isIsoDate,
  datesInRange,
  dayLabel,
  weekdayDateLabel,
  addDay,
  removeDay,
  setTripDates,
  assignItemDate,
  itemsForDate,
  unassignedDateItems,
  outfitsForDate,
  addOutfit,
  updateOutfit,
  removeOutfit,
  setOutfitItems,
  setOutfitDate,
  searchPastOutfits,
  copyOutfit,
  ensureListItem,
  uniqueItemsById,
  addItemToOutfit,
  normalizePrefs,
  MAX_DAYS,
  UNSORTED_KEY,
} from '../packing-cubes/engine/model.js';

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}\n  expected ${e}\n  got      ${a}`);
  }
}

const toiletries = {
  id: 'toiletries',
  title: 'Toiletries',
  tags: [],
  items: [{ label: 'Toothbrush' }, { label: 'Toothpaste' }, { label: 'Deodorant' }],
  addOns: [
    { id: 'travel-meds', title: 'Travel meds', items: [{ label: 'Ibuprofen' }, { label: 'Band-aids' }] },
    { id: 'hair-tools', title: 'Hair tools', items: [{ label: 'Hair dryer' }, { label: 'Toothpaste' }] },
    { id: 'beauty-basics', title: 'Beauty Basics', items: [{ label: 'Moisturizer' }, { label: 'Sunscreen stick' }] },
  ],
};
const legacyBasics = {
  id: 'boy-tops',
  title: 'Boy Tops',
  tags: ['basics'],
  items: [{ label: 'T-shirt' }, { label: 'Crew neck' }],
};
const beach = {
  id: 'beach',
  title: 'Beach',
  tags: ['summer'],
  items: [{ label: 'Swimsuit' }, { label: 'Toothbrush' }, { label: 'Sunscreen' }],
};
const cubesById = new Map([['toiletries', toiletries], ['boy-tops', legacyBasics], ['beach', beach]]);
const catalog = [beach, toiletries, legacyBasics];

// --- cube basics ---
check('itemKey normalizes case + whitespace', itemKey('  T-Shirt '), 't-shirt');
check('cubeAddOns tolerates missing', cubeAddOns(beach), []);
check('cubeAddOns reads bundles', cubeAddOns(toiletries).map((a) => a.id), ['travel-meds', 'hair-tools', 'beauty-basics']);
check('addOnLabel is parent - add-on', addOnLabel(toiletries, toiletries.addOns[2]), 'Toiletries - Beauty Basics');
check('assignmentKey cube', assignmentKey('toiletries', null), 'c:toiletries');
check('assignmentKey add-on', assignmentKey('toiletries', 'beauty-basics'), 'a:toiletries:beauty-basics');
check('parseAssignment empty', parseAssignment(''), { cubeId: null, addOnId: null });
check('parseAssignment cube', parseAssignment('c:toiletries'), { cubeId: 'toiletries', addOnId: null });
check('parseAssignment add-on', parseAssignment('a:toiletries:beauty-basics'), { cubeId: 'toiletries', addOnId: 'beauty-basics' });

// --- search ---
check('matchesQuery hits item labels', matchesQuery(beach, 'sunscreen'), true);
check('matchesQuery hits add-on titles', matchesQuery(toiletries, 'travel meds'), true);
check('matchesQuery hits add-on items', matchesQuery(toiletries, 'ibuprofen'), true);
check('matchesQuery misses', matchesQuery(beach, 'winter'), false);

// --- catalog sort ---
const sorted = sortCatalog([
  { id: 'z', title: 'Zeta' },
  { id: 'c', title: 'Cee' },
  { id: 'a', title: 'Alpha' },
]);
check('sortCatalog is alphabetical by title', sorted.map((c) => c.id), ['a', 'c', 'z']);

// --- new suitcase: empty, nothing auto-attached ---
const s = newSuitcase('Trip');
check('new suitcase starts with no cubes', s.cubeIds, []);
check('new suitcase starts with an empty list', s.items, []);
check('no add-ons enabled by default', s.addOns, {});

// The user chooses every cube; attaching imports its items.
attachCube(s, toiletries);
attachCube(s, legacyBasics);
check('user-attached cubes recorded', s.cubeIds, ['toiletries', 'boy-tops']);
check(
  'attaching imports base items only',
  s.items.map((i) => i.label),
  ['Toothbrush', 'Toothpaste', 'Deodorant', 'T-shirt', 'Crew neck'],
);
check('imported items carry their cube', s.items[0].cubeId, 'toiletries');

// Any cube can be removed from the list again.
const throwaway = newSuitcase('Detach check');
attachCube(throwaway, toiletries);
detachCube(throwaway, 'toiletries');
check('detaching a cube clears its rows', [throwaway.cubeIds, throwaway.items], [[], []]);

// --- the flat list is the source of truth ---
const passport = addItem(s, '  Passport ');
check('addItem trims and returns the item', passport.label, 'Passport');
check('typed items start unsorted', passport.cubeId, null);
check('addItem rejects empty labels', addItem(s, '   '), null);
check('unsortedCount counts unassigned', unsortedCount(s), 1);

updateItemLabel(s, passport.id, 'Passport + visas');
check('updateItemLabel edits in place', s.items.find((i) => i.id === passport.id).label, 'Passport + visas');

setItemPacked(s, passport.id, true);
check('packedStats reflects checked items', packedStats(s), { packed: 1, total: 6 });
check('allPacked false while unpacked items remain', allPacked(s), false);
setItemPacked(s, passport.id, false);
check('unpacking works', packedStats(s).packed, 0);

// --- attach / detach cubes ---
const imported = attachCube(s, beach);
check('attachCube imports only missing labels', imported, 2); // Toothbrush already on the list
check('attachCube records the cube', s.cubeIds.includes('beach'), true);
check('attachCube is idempotent', attachCube(s, beach), 0);

const emptyShell = newSuitcase('Empty attach');
const emptyCube = { id: 'beach-bag', title: 'Beach bag', items: [] };
check('empty attach imports nothing', attachCube(emptyShell, emptyCube), 0);
check('empty attach still records the cube', emptyShell.cubeIds, ['beach-bag']);
check('empty attach leaves the list untouched', emptyShell.items, []);

// Organize: move the typed item into the beach cube, then back out.
assignItem(s, passport.id, 'beach');
check('assignItem sets the cube', s.items.find((i) => i.id === passport.id).cubeId, 'beach');
assignItem(s, passport.id, null);
check('assignItem can unassign', s.items.find((i) => i.id === passport.id).cubeId, null);

detachCube(s, 'beach');
check('detachCube removes the cube', s.cubeIds.includes('beach'), false);
check('detachCube removes its items', s.items.some((i) => i.cubeId === 'beach'), false);
check('detachCube leaves the rest of the list', s.items.some((i) => i.label === 'Passport + visas'), true);

// --- add-ons ---
const addedMeds = setAddOn(s, toiletries, 'travel-meds', true);
check('enabling an add-on imports its items', addedMeds, 2);
check('add-on recorded as enabled', addOnEnabled(s, 'toiletries', 'travel-meds'), true);
check(
  'add-on items join the parent cube',
  s.items.filter((i) => i.addOnId === 'travel-meds').map((i) => i.cubeId),
  ['toiletries', 'toiletries'],
);
const addedHair = setAddOn(s, toiletries, 'hair-tools', true);
check('add-on import skips labels already on the list', addedHair, 1); // Toothpaste dupe skipped
const removed = setAddOn(s, toiletries, 'travel-meds', false);
check('disabling an add-on removes its rows', removed, 2);
check('add-on recorded as disabled', addOnEnabled(s, 'toiletries', 'travel-meds'), false);
check('other add-ons untouched', s.items.some((i) => i.addOnId === 'hair-tools'), true);
check('unknown add-on is a no-op', setAddOn(s, toiletries, 'nope', true), 0);

// Organize can file a row into an add-on cube, including one not yet on the list.
const sOrg = newSuitcase('Organize');
const filed = addItem(sOrg, 'Moisturizer');
assignItem(sOrg, filed.id, 'toiletries', 'beauty-basics');
check('assigning to an add-on attaches the parent cube', sOrg.cubeIds, ['toiletries']);
check('assigning to an add-on does not import the parent bundle', sOrg.items.map((i) => i.label), ['Moisturizer']);
check('assigned addOnId sticks', sOrg.items[0].addOnId, 'beauty-basics');
check('filing records the add-on as enabled', addOnEnabled(sOrg, 'toiletries', 'beauty-basics'), true);
assignItem(sOrg, filed.id, 'toiletries', null);
check('moving to the parent cube clears addOnId', sOrg.items[0].addOnId, null);

const targets = organizeTargets(catalog, sOrg);
check(
  'organizeTargets lists add-ons as Parent - Add-on',
  targets.onList.map((t) => t.label),
  ['Toiletries', 'Toiletries - Travel meds', 'Toiletries - Hair tools', 'Toiletries - Beauty Basics'],
);
check('organizeTargets puts unattached cubes in others', targets.others.map((t) => t.label).includes('Beach'), true);

const listed = expandContents(sOrg, toiletries);
check('expandContents uses the packing list when the cube is attached', listed.source, 'list');
check('expandContents lists filed items, not the empty template', listed.items.map((i) => i.label), ['Moisturizer']);
const templateView = expandContents(newSuitcase('No cubes'), toiletries);
check('expandContents falls back to the cube template off-list', templateView.source, 'cube');
check('template view shows saved cube items', templateView.items.map((i) => i.label), ['Toothbrush', 'Toothpaste', 'Deodorant']);

const absorbed = { id: 'toiletries', title: 'Toiletries', items: [], addOns: [{ id: 'beauty-basics', title: 'Beauty Basics', items: [{ label: 'Moisturizer' }] }] };
check('absorbItemIntoCube adds a new label to an empty cube', absorbItemIntoCube(absorbed, 'Toothbrush'), true);
check('absorbItemIntoCube skips duplicates', absorbItemIntoCube(absorbed, 'toothbrush'), false);
check('absorbItemIntoCube writes add-on items', absorbItemIntoCube(absorbed, 'Lip balm', 'beauty-basics'), true);
check('filedInCube filters by cube', filedInCube(sOrg, 'toiletries').map((i) => i.label), ['Moisturizer']);

// Enabling an add-on for an unattached cube attaches it first.
const s3 = newSuitcase('Weekend');
setAddOn(s3, toiletries, 'travel-meds', true);
check('add-on auto-attaches its cube', s3.cubeIds, ['toiletries']);
check(
  'auto-attach imports base items too',
  s3.items.map((i) => i.label),
  ['Toothbrush', 'Toothpaste', 'Deodorant', 'Ibuprofen', 'Band-aids'],
);

// Default cubes / add-ons seed new trips.
const defaultToiletries = {
  ...toiletries,
  includeByDefault: true,
  addOns: toiletries.addOns.map((a) => (
    a.id === 'beauty-basics' ? { ...a, includeByDefault: true } : a
  )),
};
check('isDefaultCube reads the flag', isDefaultCube(defaultToiletries), true);
check('isDefaultAddOn reads the flag', isDefaultAddOn(defaultToiletries.addOns[2]), true);
const seeded = newSuitcase('Always', [defaultToiletries, beach]);
check('default cube attaches on a new trip', seeded.cubeIds, ['toiletries']);
check(
  'default cube imports base items',
  seeded.items.filter((i) => !i.addOnId).map((i) => i.label),
  ['Toothbrush', 'Toothpaste', 'Deodorant'],
);
check(
  'default add-on imports its items too',
  seeded.items.filter((i) => i.addOnId === 'beauty-basics').map((i) => i.label),
  ['Moisturizer', 'Sunscreen stick'],
);
check('non-default cubes stay off the new trip', seeded.cubeIds.includes('beach'), false);
check('cubes without the flag do not seed', newSuitcase('Blank', catalog).cubeIds, []);
seedDefaults(seeded, [defaultToiletries]);
check('reseeding a trip does not duplicate items', seeded.items.filter((i) => i.label === 'Toothbrush').length, 1);

// --- deleting a cube from the account keeps the list intact ---
const changed = releaseDeletedCube(s, 'toiletries');
check('releaseDeletedCube reports change', changed, true);
check('cube detached after delete', s.cubeIds.includes('toiletries'), false);
check('its items stay, unsorted', s.items.filter((i) => i.label === 'Toothbrush').map((i) => i.cubeId), [null]);
check('its add-on state cleared', s.addOns.toiletries, undefined);
check('releaseDeletedCube no-op returns false', releaseDeletedCube(s, 'toiletries'), false);

// --- grouped view ---
const s4 = normalizeSuitcase({
  id: 's4',
  name: 'View',
  cubeIds: ['toiletries', 'ghost-cube'],
  items: [
    { id: 'a', label: 'Toothbrush', cubeId: 'toiletries' },
    { id: 'b', label: 'Mystery', cubeId: 'orphan-cube' },
    { id: 'c', label: 'Passport', cubeId: null },
  ],
});
const groups = groupedItems(s4, cubesById);
check(
  'groups: attached cubes (even empty), orphan cube, unsorted last',
  groups.map((g) => g.key),
  ['toiletries', 'ghost-cube', 'orphan-cube', UNSORTED_KEY],
);
check('group titles resolve from the catalog', groups[0].title, 'Toiletries');
check('missing cubes fall back to their id', groups[1].title, 'ghost-cube');
check('empty attached group kept as organize target', groups[1].items, []);
check('unsorted group holds unassigned items', groups[3].items.map((i) => i.label), ['Passport']);

const sAddOnView = normalizeSuitcase({
  id: 's-addon',
  name: 'Add-on view',
  cubeIds: ['toiletries'],
  items: [
    { id: 'a', label: 'Toothbrush', cubeId: 'toiletries' },
    { id: 'b', label: 'Moisturizer', cubeId: 'toiletries', addOnId: 'beauty-basics' },
  ],
});
const packedGroups = groupedItems(sAddOnView, cubesById);
check(
  'by-cube view splits add-on items into Parent - Add-on',
  packedGroups.map((g) => g.key),
  ['toiletries', addonGroupKey('toiletries', 'beauty-basics')],
);
check('add-on group title', packedGroups[1].title, 'Toiletries - Beauty Basics');
check('parent group keeps base items', packedGroups[0].items.map((i) => i.label), ['Toothbrush']);
const organizeGroups = groupedItems(sAddOnView, cubesById, { includeEmptyAddOns: true });
check(
  'organize shows empty add-on cubes as filing targets',
  organizeGroups.map((g) => g.title),
  ['Toiletries', 'Toiletries - Travel meds', 'Toiletries - Hair tools', 'Toiletries - Beauty Basics'],
);

// --- removeItem ---
check('removeItem deletes by id', removeItem(s4, 'c'), true);
check('removeItem unknown id is false', removeItem(s4, 'zzz'), false);

// --- v1 migration ---
const v1 = {
  id: 'old',
  name: 'Old trip',
  cubeIds: ['toiletries', 'beach', 'gone-cube'],
  customItems: [{ label: 'Travel pillow' }, { label: 'Snorkel', cubeId: 'beach' }, { label: 'toothbrush' }],
  packed: { toothbrush: true, swimsuit: true },
  excludedItems: ['deodorant'],
};
check('v1 detected as legacy', isLegacySuitcase(v1), true);
check('v2 not legacy', isLegacySuitcase(s4), false);

const migrated = migrateSuitcase(v1, cubesById);
check('migrated version stamped', migrated.v, 2);
check('migration keeps identity', [migrated.id, migrated.name], ['old', 'Old trip']);
check(
  'migration materializes cube items in order, deduped',
  migrated.items.map((i) => i.label),
  ['Toothbrush', 'Toothpaste', 'Swimsuit', 'Sunscreen', 'Travel pillow', 'Snorkel'],
);
check('shared label lands under the first cube', migrated.items[0].cubeId, 'toiletries');
check('packed state carries over by label', migrated.items.filter((i) => i.packed).map((i) => i.label), ['Toothbrush', 'Swimsuit']);
check('v1 hidden items migrate as deleted', migrated.items.some((i) => itemKey(i.label) === 'deodorant'), false);
check('custom cube tags preserved', migrated.items.find((i) => i.label === 'Snorkel').cubeId, 'beach');
check('unfetchable cubes stay attached for later re-import', migrated.cubeIds, ['toiletries', 'beach', 'gone-cube']);
check('migrating a v2 suitcase is a normalize pass', migrateSuitcase(s4, cubesById).id, 's4');

// --- normalize tolerates junk ---
const junk = normalizeSuitcase({ items: [{ label: 'Ok' }, null, { nope: true }], cubeIds: null, addOns: null });
check('normalize drops malformed items', junk.items.map((i) => i.label), ['Ok']);
check('normalize defaults collections', [junk.cubeIds, junk.addOns], [[], {}]);
check('normalize stamps ids', typeof junk.items[0].id === 'string' && junk.items[0].id.length > 0, true);
check('normalize defaults empty days and outfits', [junk.days, junk.outfits, junk.startDate, junk.items[0].dates], [[], [], null, []]);

// --- calendar days (identity is YYYY-MM-DD, not Day n) ---
check('isIsoDate accepts a real date', isIsoDate('2026-06-13'), true);
check('isIsoDate rejects 31 Feb', isIsoDate('2026-02-31'), false);
check('datesInRange is inclusive', datesInRange('2026-06-12', '2026-06-14'), ['2026-06-12', '2026-06-13', '2026-06-14']);
check('datesInRange rejects inverted span', datesInRange('2026-06-14', '2026-06-12'), []);

const trip = newSuitcase('Wedding');
check('fresh trip has no days', [trip.days, trip.outfits, trip.startDate], [[], [], null]);
check('setTripDates fills the span', setTripDates(trip, { startDate: '2026-06-12', endDate: '2026-06-14' }), 3);
check('days are date records', trip.days.map((d) => d.date), ['2026-06-12', '2026-06-13', '2026-06-14']);
check('addDay outside the range is allowed', addDay(trip, '2026-06-16'), true);
check('duplicate addDay is a no-op', addDay(trip, '2026-06-13'), false);
check('weekdayDateLabel is calendar-local', weekdayDateLabel('2026-06-13'), 'Sat 13 Jun');
check('dayLabel derives Day N from start', dayLabel(trip, '2026-06-13'), 'Sat 13 Jun · Day 2');

const shirt = addItem(trip, 'Navy blazer');
const shoes = addItem(trip, 'Dress shoes');
check('assign to a date', assignItemDate(trip, shirt.id, '2026-06-12', true), true);
check('rewear on a second date', assignItemDate(trip, shirt.id, '2026-06-14', true), true);
check('unknown date is ignored', assignItemDate(trip, shirt.id, '2026-07-01', true), false);
check('item dates list both days', shirt.dates, ['2026-06-12', '2026-06-14']);
check('itemsForDate sees rewear', itemsForDate(trip, '2026-06-12').map((i) => i.label), ['Navy blazer']);
check('unassigned tray', unassignedDateItems(trip).map((i) => i.label), ['Dress shoes']);

const ceremony = addOutfit(trip, { name: 'Ceremony', event: 'Saturday wedding', date: '2026-06-13', itemIds: [shirt.id, shoes.id] });
check('outfit lives on the trip', ceremony.name, 'Ceremony');
check('outfit date is a calendar date', ceremony.date, '2026-06-13');
check('outfit does not create a cube', trip.cubeIds, []);
check('outfitsForDate', outfitsForDate(trip, '2026-06-13').map((o) => o.name), ['Ceremony']);

check('removeDay does not renumber neighbors', removeDay(trip, '2026-06-13'), true);
check('neighbors keep their dates', trip.days.map((d) => d.date), ['2026-06-12', '2026-06-14', '2026-06-16']);
check('outfit date cleared, outfit kept', [ceremony.date, trip.outfits[0].name], [null, 'Ceremony']);
check('item loses only that date', shirt.dates, ['2026-06-12', '2026-06-14']);

check('removeItem prunes outfit membership', removeItem(trip, shoes.id), true);
check('outfit kept the remaining item', trip.outfits[0].itemIds, [shirt.id]);

check('setOutfitDate rejects dates not on the trip', setOutfitDate(trip, ceremony.id, '2026-06-13'), true);
check('cleared because 13 Jun was removed', trip.outfits[0].date, null);
check('setOutfitItems', setOutfitItems(trip, ceremony.id, [shirt.id, 'nope']), true);
check('unknown item ids dropped', trip.outfits[0].itemIds, [shirt.id]);
check('updateOutfit renames', updateOutfit(trip, ceremony.id, { name: 'Vows', event: '' }), true);
check('removeOutfit keeps list items', [removeOutfit(trip, ceremony.id), trip.items.some((i) => i.id === shirt.id)], [true, true]);

const discarded = normalizeSuitcase({
  name: 'Old draft',
  items: [{ id: 'i1', label: 'Hat', dayIds: ['day-1'] }],
  days: [{ id: 'day-1', n: 1 }, { id: 'day-2', n: 2, date: '2026-06-12' }],
  outfits: [{ id: 'o1', name: 'Look', dayId: 'day-1', itemIds: ['i1'] }],
});
check('numbered days without a date are dropped', discarded.days, [{ date: '2026-06-12' }]);
check('item.dayIds discarded', discarded.items[0].dates, []);
check('outfit.dayId discarded', discarded.outfits[0].date, null);

const past = newSuitcase('Jaipur wedding');
const pastSuit = addItem(past, 'Navy suit');
const pastSq = addItem(past, 'Pocket square');
addOutfit(past, { name: 'Ceremony', event: 'Shaadi', itemIds: [pastSuit.id, pastSq.id] });
const now = newSuitcase('This weekend');
addItem(now, 'Navy suit');
const hits = searchPastOutfits([past, now], now.id, 'shaadi');
check('search past outfits by event', hits.map((h) => h.name), ['Ceremony']);
check('search hides the current trip', searchPastOutfits([past, now], past.id, 'ceremony').length, 0);
const copied = copyOutfit(past, past.outfits[0], now, { addMissing: true });
check('copy never creates a cube', now.cubeIds, []);
check('copy adds missing labels', now.items.map((i) => i.label), ['Navy suit', 'Pocket square']);
check('copy grouping uses current ids', copied.itemIds.length, 2);
check('copy date stays unset', copied.date, null);
const skip = newSuitcase('Skip missing');
addItem(skip, 'Navy suit');
const partial = copyOutfit(past, past.outfits[0], skip, { addMissing: false });
check('copy grouping only skips missing', skip.items.map((i) => i.label), ['Navy suit']);
check('partial copy has one item', partial.itemIds.length, 1);

const undated = newSuitcase('No dates yet');
const bare = addOutfit(undated, { name: 'Ceremony' });
check('outfit saves with no date', [bare.date, bare.itemIds], [null, []]);
check('empty-string date stays unset', addOutfit(undated, { name: 'Dinner', date: '' }).date, null);
check('updateOutfit can clear a date', (() => {
  addDay(undated, '2026-06-13');
  setOutfitDate(undated, bare.id, '2026-06-13');
  updateOutfit(undated, bare.id, { date: null });
  return undated.outfits.find((o) => o.id === bare.id).date;
})(), null);

const shared = newSuitcase('Shared item');
const lookA = addOutfit(shared, { name: 'Ceremony' });
const lookB = addOutfit(shared, { name: 'Dinner' });
const blazer = addItemToOutfit(shared, lookA.id, 'Navy blazer');
const again = addItemToOutfit(shared, lookB.id, '  navy blazer ');
check('addItemToOutfit reuses the list row', [blazer.id, again.id], [again.id, blazer.id]);
check('two outfits share one list item', shared.items.filter((i) => itemKey(i.label) === 'navy blazer').length, 1);
check('both outfits point at the same id', [lookA.itemIds, lookB.itemIds], [[blazer.id], [blazer.id]]);
check('ensureListItem does not clone a label', ensureListItem(shared, 'Navy blazer').id, blazer.id);
check('uniqueItemsById keeps one row', uniqueItemsById([blazer, blazer, again]).map((i) => i.id), [blazer.id]);
const duped = { ...shared, items: [shared.items[0], { ...shared.items[0] }] };
check('List/By cube would see one row', uniqueItemsById(duped.items).length, 1);

check('prefs default off', normalizePrefs(null), { betaViews: false });
check('prefs reads the flag', normalizePrefs({ betaViews: true }), { betaViews: true });
check('MAX_DAYS is 31', MAX_DAYS, 31);

const cap = newSuitcase('Long');
setTripDates(cap, { startDate: '2026-01-01', endDate: '2026-12-31' });
check('range fill stops at the cap', cap.days.length, 31);

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll packing-cubes model tests passed.');
