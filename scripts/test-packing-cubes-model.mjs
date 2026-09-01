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
  setItemWorn,
  wornItems,
  wornStats,
  outfitWornState,
  setOutfitWorn,
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
  outfitGroupKey,
  addEmptyAddOn,
  isDefaultCube,
  isDefaultAddOn,
  seedDefaults,
  expandContents,
  absorbItemIntoCube,
  fileIntoCube,
  officialCubeFromApi,
  syncOfficialCubeFromTrip,
  propagateOfficialCubeToTrips,
  addedDefinitionLabels,
  normalizeDefinitionItems,
  listItemMembership,
  sortedListItems,
  groupAllPacked,
  groupUnits,
  orderGroupsForCubeView,
  orderUnitsForCubeView,
  reorderCubeIds,
  reorderCubeIdsInBand,
  reorderOutfits,
  reorderOutfitsInBand,
  reorderAddOns,
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
  uniqueDefinitionItems,
  listItemInCube,
  addItemToOutfit,
  normalizePrefs,
  CUBE_TEMPLATE_BACKFILL,
  needsCubeTemplateBackfill,
  markCubeTemplateBackfill,
  cubeIdsOnTrips,
  backfillOfficialCubeFromTrips,
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
const passportAgain = addItem(s, 'passport');
check('addItem does not clone a case-insensitive duplicate', passportAgain.id, passport.id);
check('addItem keeps one row for Passport / passport', s.items.filter((i) => itemKey(i.label) === 'passport').length, 1);
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
check(
  'expandContents keeps the cube template plus trip-filed extras',
  listed.items.map((i) => i.label),
  ['Toothbrush', 'Toothpaste', 'Deodorant', 'Moisturizer'],
);
const templateView = expandContents(newSuitcase('No cubes'), toiletries);
check('expandContents falls back to the cube template off-list', templateView.source, 'cube');
check('template view shows saved cube items', templateView.items.map((i) => i.label), ['Toothbrush', 'Toothpaste', 'Deodorant']);

const absorbed = { id: 'toiletries', title: 'Toiletries', items: [], addOns: [{ id: 'beauty-basics', title: 'Beauty Basics', items: [{ label: 'Moisturizer' }] }] };
check('absorbItemIntoCube adds a new label to an empty cube', absorbItemIntoCube(absorbed, 'Toothbrush'), true);
check('absorbItemIntoCube skips duplicates', absorbItemIntoCube(absorbed, 'toothbrush'), false);
check('absorbItemIntoCube writes add-on items', absorbItemIntoCube(absorbed, 'Lip balm', 'beauty-basics'), true);
check('filedInCube filters by cube', filedInCube(sOrg, 'toiletries').map((i) => i.label), ['Moisturizer']);

function cubeDefSnap(cube) {
  return JSON.stringify({
    items: (cube.items || []).map((i) => i.label),
    addOns: cubeAddOns(cube).map((a) => ({ id: a.id, items: (a.items || []).map((i) => i.label) })),
  });
}
const tripLocal = newSuitcase('This trip only');
attachCube(tripLocal, toiletries);
setAddOn(tripLocal, toiletries, 'travel-meds', true);
const defBefore = cubeDefSnap(toiletries);
const brushRow = tripLocal.items.find((i) => i.label === 'Toothbrush');
const medsRow = tripLocal.items.find((i) => i.addOnId === 'travel-meds');
removeItem(tripLocal, brushRow.id);
assignItem(tripLocal, medsRow.id, null);
check('removeItem drops the row from this trip', tripLocal.items.some((i) => i.id === brushRow.id), false);
check('unassign clears cubeId on this trip', tripLocal.items.find((i) => i.id === medsRow.id).cubeId, null);
check('remove/unassign do not edit the cube definition', cubeDefSnap(toiletries), defBefore);
const nextTrip = newSuitcase('Next trip');
attachCube(nextTrip, toiletries);
check(
  'next attach still imports the cube item',
  nextTrip.items.some((i) => i.label === 'Toothbrush'),
  true,
);
const afterDisable = cubeDefSnap(toiletries);
setAddOn(tripLocal, toiletries, 'hair-tools', false);
check('disabling an add-on on a trip does not strip its definition', cubeDefSnap(toiletries), afterDisable);

const growCube = {
  id: 'grow',
  title: 'Grow',
  items: [{ label: 'Socks' }],
  addOns: [{ id: 'pouch', title: 'Pouch', items: [] }],
};
const growTrip = newSuitcase('Grow trip');
const belt = addItem(growTrip, 'Belt');
assignItem(growTrip, belt.id, 'grow');
check('assign+absorb grows the cube', absorbItemIntoCube(growCube, belt.label), true);
check('grown cube keeps prior labels', growCube.items.map((i) => i.label), ['Socks', 'Belt']);
const balm = addItem(growTrip, 'Lip balm');
assignItem(growTrip, balm.id, 'grow', 'pouch');
check('assign+absorb grows the add-on', absorbItemIntoCube(growCube, balm.label, 'pouch'), true);
removeItem(growTrip, belt.id);
removeItem(growTrip, balm.id);
check('trip delete does not shrink the grown cube', growCube.items.map((i) => i.label), ['Socks', 'Belt']);
check('trip delete does not shrink the add-on', growCube.addOns[0].items.map((i) => i.label), ['Lip balm']);

const basicsCube = {
  id: 'basics',
  title: 'Basics',
  tags: ['basics'],
  includeByDefault: true,
  items: [{ label: 'Socks' }, { label: 'Underwear' }],
  addOns: [],
};
const basicsTrip = newSuitcase('Paris', [basicsCube]);
check('Basics-style cube seeds a new trip', basicsTrip.cubeIds, ['basics']);
const filedBasics = fileIntoCube(basicsTrip, basicsCube, '  Passport ');
check('fileIntoCube assigns the trip row to Basics', filedBasics.item.cubeId, 'basics');
check('fileIntoCube reports an official append', filedBasics.absorbed, true);
check(
  'assigning a new label to a Basics-style cube persists it on the cube record',
  basicsCube.items.map((i) => i.label),
  ['Socks', 'Underwear', 'Passport'],
);
check('includeByDefault does not skip absorb', isDefaultCube(basicsCube), true);
const basicsAgain = fileIntoCube(basicsTrip, basicsCube, 'passport');
check('second file of the same label is trip-only', basicsAgain.absorbed, false);
check('Basics definition is not cloned on a duplicate file', basicsCube.items.length, 3);
check('fileIntoCube case-insensitive already-in-cube is not a new trip row', basicsTrip.items.filter((i) => itemKey(i.label) === 'passport').length, 1);
check('listItemInCube is case-insensitive', listItemInCube(basicsTrip, 'PASSPORT', 'basics'), true);
check('uniqueDefinitionItems drops case duplicates', uniqueDefinitionItems([{ label: 'Socks' }, { label: 'socks' }, { label: 'Hat' }]), [
  { label: 'Socks' },
  { label: 'Hat' },
]);
const emptiedCache = { id: 'basics', title: 'Basics', tags: ['basics'], includeByDefault: true, items: [] };
check(
  'absorb onto an empty stub still appends',
  absorbItemIntoCube(emptiedCache, 'Passport') && emptiedCache.items.map((i) => i.label),
  ['Passport'],
);

const officialX = { id: 'x', title: 'X', items: [], addOns: [] };
const tripX = newSuitcase('File into X');
const filedX = fileIntoCube(tripX, officialX, 'Passport');
check('file into cube X writes the label onto the official record', officialX.items.map((i) => i.label), ['Passport']);
check('filed trip row is assigned to X', filedX.item.cubeId, 'x');
removeItem(tripX, filedX.item.id);
check('removing the item from the trip does not shrink the official cube', officialX.items.map((i) => i.label), ['Passport']);
const nextX = newSuitcase('Next X');
attachCube(nextX, officialX);
check('next trip attach still imports the filed label', nextX.items.some((i) => i.label === 'Passport'), true);

const officialSync = { id: 'basics', title: 'Basics', includeByDefault: true, items: [], addOns: [] };
const tripSync = newSuitcase('Sync');
const hat = addItem(tripSync, 'Hat');
assignItem(tripSync, hat.id, 'basics');
check('syncOfficialCubeFromTrip appends trip-filed labels', syncOfficialCubeFromTrip(officialSync, tripSync), true);
check('synced official cube contains the label', officialSync.items.map((i) => i.label), ['Hat']);
removeItem(tripSync, hat.id);
check('sync after trip delete does not drop the official label', [
  syncOfficialCubeFromTrip(officialSync, tripSync),
  officialSync.items.map((i) => i.label),
], [false, ['Hat']]);

check(
  'officialCubeFromApi reads data.cube',
  officialCubeFromApi({ cube: { id: 'x', items: [] } }, 'x')?.id,
  'x',
);
check(
  'officialCubeFromApi recovers from a list-shaped GET (rewrite dropped id)',
  officialCubeFromApi({ cubes: [{ id: 'x', items: [{ label: 'Socks' }] }, { id: 'y', items: [] }] }, 'x')?.items[0].label,
  'Socks',
);
check('officialCubeFromApi misses an unknown id', officialCubeFromApi({ cubes: [{ id: 'y' }] }, 'x'), null);
check('normalizeDefinitionItems coerces string rows', normalizeDefinitionItems(['Socks', { label: 'Hat' }]), [
  { label: 'Socks' },
  { label: 'Hat' },
]);

const officialBefore = {
  id: 'basics',
  title: 'Basics',
  items: [{ label: 'Socks' }],
  addOns: [{ id: 'pouch', title: 'Pouch', items: [{ label: 'Lip balm' }] }],
};
const officialAfter = {
  id: 'basics',
  title: 'Basics',
  items: [{ label: 'Socks' }, { label: 'Passport' }],
  addOns: [{ id: 'pouch', title: 'Pouch', items: [{ label: 'Lip balm' }, { label: 'Nail clippers' }] }],
};
check('addedDefinitionLabels is the new official rows', addedDefinitionLabels(officialBefore.items, officialAfter.items).map((i) => i.label), ['Passport']);
const paris = newSuitcase('Paris');
attachCube(paris, officialBefore);
setAddOn(paris, officialBefore, 'pouch', true);
const gym = newSuitcase('Gym');
attachCube(gym, officialBefore);
const home = newSuitcase('Home');
addItem(home, 'Keys');
const socksRow = paris.items.find((i) => i.label === 'Socks');
removeItem(paris, socksRow.id);
const gained = propagateOfficialCubeToTrips([paris, gym, home], officialAfter, officialBefore);
check('attached trip gained the new official item', paris.items.some((i) => i.label === 'Passport' && i.cubeId === 'basics'), true);
check('other attached trip also gained the item', gym.items.some((i) => i.label === 'Passport' && i.cubeId === 'basics'), true);
check('suitcase without the cube does not gain the item', home.items.some((i) => i.label === 'Passport'), false);
check('trip-list delete is not undone by an official add', paris.items.some((i) => i.label === 'Socks'), false);
check('enabled add-on trip gained the new add-on item', paris.items.some((i) => i.label === 'Nail clippers' && i.addOnId === 'pouch'), true);
check('cube-attached trip without the add-on does not gain add-on items', gym.items.some((i) => i.label === 'Nail clippers'), false);
check('unattached trip does not gain add-on items', home.items.some((i) => i.label === 'Nail clippers'), false);
check('propagate reports how many rows were added', gained >= 3, true);
const propagatedAgain = propagateOfficialCubeToTrips([paris, gym, home], officialAfter, officialBefore);
check('second propagate of the same add is a no-op', propagatedAgain, 0);

const officialBehind = { id: 'basics', title: 'Basics', items: [{ label: 'Socks' }], addOns: [] };
const sfo = newSuitcase('SFO + Seattle');
attachCube(sfo, officialBehind);
fileIntoCube(sfo, officialBehind, 'Passport');
const seattleExtras = { id: 'basics', title: 'Basics', items: [{ label: 'Socks' }], addOns: [] };
const otherTrip = newSuitcase('Other');
attachCube(otherTrip, seattleExtras);
fileIntoCube(otherTrip, seattleExtras, 'Charger');
const skipped = newSuitcase('No cube');
addItem(skipped, 'House keys');
const template = { id: 'basics', title: 'Basics', items: [{ label: 'Socks' }], addOns: [] };
check('cubeIdsOnTrips sees attached and filed cubes', cubeIdsOnTrips([sfo, otherTrip, skipped]).sort(), ['basics']);
check('one-time backfill unions trip-filed labels onto the official cube', backfillOfficialCubeFromTrips(template, [sfo, otherTrip, skipped]), true);
check(
  'official cube gained labels from every trip that includes it',
  template.items.map((i) => i.label),
  ['Socks', 'Passport', 'Charger'],
);
check('backfill does not invent items from a trip without the cube', template.items.some((i) => i.label === 'House keys'), false);
const alreadyFilled = { id: 'basics', title: 'Basics', items: [...template.items], addOns: [] };
check('second backfill is a no-op', backfillOfficialCubeFromTrips(alreadyFilled, [sfo, otherTrip]), false);
removeItem(sfo, sfo.items.find((i) => i.label === 'Passport').id);
check('trip delete still does not shrink the backfilled official cube', [
  backfillOfficialCubeFromTrips(template, [sfo, otherTrip]),
  template.items.map((i) => i.label),
], [false, ['Socks', 'Passport', 'Charger']]);

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

const blankCube = {
  id: 'toiletries',
  title: 'Toiletries',
  items: [{ label: 'Toothbrush' }],
  addOns: [
    { id: 'travel-meds', title: 'Travel meds', items: [{ label: 'Ibuprofen' }] },
    { id: 'beauty-basics', title: 'Beauty Basics', items: [{ label: 'Moisturizer' }] },
  ],
};
const createdAddOn = addEmptyAddOn(blankCube, '  Hair tools ');
check('addEmptyAddOn names a blank add-in', [createdAddOn.title, createdAddOn.items], ['Hair tools', []]);
check('addEmptyAddOn stamps an id', !!createdAddOn.id, true);
check('addEmptyAddOn reuses the same title', addEmptyAddOn(blankCube, 'hair tools').id, createdAddOn.id);
check('addEmptyAddOn rejects a blank name', addEmptyAddOn(blankCube, '   '), null);

const sBlankAddOn = normalizeSuitcase({
  id: 's-blank-addon',
  cubeIds: ['toiletries'],
  items: [{ id: 'a', label: 'Toothbrush', cubeId: 'toiletries' }],
});
const blankAddOnCube = {
  id: 'toiletries',
  title: 'Toiletries',
  addOns: [
    { id: 'travel-meds', title: 'Travel meds', items: [{ label: 'Ibuprofen' }] },
    { id: 'empty-pouch', title: 'Empty pouch', items: [] },
  ],
};
const blankAddOnGroups = groupedItems(sBlankAddOn, new Map([['toiletries', blankAddOnCube]]));
check(
  'blank add-in shows as a By cube group',
  blankAddOnGroups.map((g) => g.key),
  ['toiletries', addonGroupKey('toiletries', 'empty-pouch')],
);
check('seeded unused add-on stays hidden until Organize', blankAddOnGroups.some((g) => g.addOnId === 'travel-meds'), false);

const sLooks = normalizeSuitcase({
  id: 's-looks',
  name: 'Wedding',
  cubeIds: ['toiletries'],
  items: [
    { id: 'blazer', label: 'Navy blazer', cubeId: 'toiletries' },
    { id: 'shoes', label: 'Dress shoes', cubeId: null },
    { id: 'passport', label: 'Passport', cubeId: null },
  ],
});
const cubeLookA = addOutfit(sLooks, { name: 'Ceremony', itemIds: ['blazer', 'shoes'] });
const cubeLookB = addOutfit(sLooks, { name: 'Dinner', itemIds: ['blazer'] });
const lookGroups = groupedItems(sLooks, cubesById);
check(
  'By cube lists outfits then cubes',
  lookGroups.map((g) => g.key),
  [outfitGroupKey(cubeLookA.id), outfitGroupKey(cubeLookB.id), 'toiletries', UNSORTED_KEY],
);
check('empty outfits still show as a group', groupedItems(
  (() => { const s = normalizeSuitcase({ id: 'empty-look', outfits: [{ id: 'o1', name: 'Rehearsal' }] }); return s; })(),
  cubesById,
).map((g) => [g.key, g.items.length]), [['outfit:o1', 0]]);
check('outfit group is not a cube', lookGroups[0].cubeId, null);
check('outfit group keeps the outfit id', lookGroups[0].outfitId, cubeLookA.id);
check('shared item sits in both outfits', [
  lookGroups[0].items.map((i) => i.id),
  lookGroups[1].items.map((i) => i.id),
], [['blazer', 'shoes'], ['blazer']]);
check('filed outfit item also sits in its cube', lookGroups[2].items.map((i) => i.id), ['blazer']);
check('unsorted-only-in-outfit stays out of Unsorted', lookGroups[3].items.map((i) => i.id), ['passport']);
check('List still shows a shared item once', uniqueItemsById(sLooks.items).length, 3);

const condensed = sortedListItems(sLooks, cubesById);
check('condensed List is one row per item id', condensed.map((i) => i.id), ['blazer', 'shoes', 'passport']);
check('condensed List sorts cube items first', condensed[0].id, 'blazer');
check('condensed List then outfit-only items', condensed[1].id, 'shoes');
check('condensed List keeps Unsorted last', condensed[2].id, 'passport');
check('cube row chip is the cube title', listItemMembership(condensed[0], sLooks, cubesById), {
  kind: 'cube',
  label: 'Toiletries',
  sort: '0\ttoiletries\tnavy blazer',
});
check('outfit-only row chip is the outfit name', listItemMembership(condensed[1], sLooks, cubesById).kind, 'outfit');
check('outfit-only row chip label', listItemMembership(condensed[1], sLooks, cubesById).label, 'Ceremony');
check('unsorted row has no chip', listItemMembership(condensed[2], sLooks, cubesById).label, '');

setItemPacked(sLooks, 'blazer', true);
const packedCondensed = sortedListItems(sLooks, cubesById);
check('List keeps unpacked items first after a check', packedCondensed.map((i) => i.id), ['shoes', 'passport', 'blazer']);
setItemPacked(sLooks, 'blazer', false);
check('List restores cube/outfit order when unchecked', sortedListItems(sLooks, cubesById).map((i) => i.id), ['blazer', 'shoes', 'passport']);

check('empty group is not all packed', groupAllPacked({ items: [] }), false);
check('partial group is not all packed', groupAllPacked({ items: [{ packed: true }, { packed: false }] }), false);
check('complete group is all packed', groupAllPacked({ items: [{ packed: true }, { packed: true }] }), true);

const sinkTrip = normalizeSuitcase({
  id: 's-sink',
  name: 'Sink',
  cubeIds: ['beach', 'toiletries'],
  items: [
    { id: 'suit', label: 'Swimsuit', cubeId: 'beach', packed: true },
    { id: 'brush', label: 'Toothbrush', cubeId: 'toiletries', packed: false },
    { id: 'keys', label: 'Keys', cubeId: null, packed: false },
  ],
});
const sinkOutfit = addOutfit(sinkTrip, { name: 'Dinner', itemIds: ['brush'] });
const sinkGroups = groupedItems(sinkTrip, cubesById);
check(
  'By cube raw order is outfits then cubes',
  sinkGroups.map((g) => g.key),
  [outfitGroupKey(sinkOutfit.id), 'beach', 'toiletries', UNSORTED_KEY],
);
const sunk = orderGroupsForCubeView(sinkGroups);
check(
  'completed cube sinks below incomplete groups',
  sunk.map((g) => g.key),
  [outfitGroupKey(sinkOutfit.id), 'toiletries', 'beach', UNSORTED_KEY],
);
setItemPacked(sinkTrip, 'brush', true);
const afterOutfitPacked = orderGroupsForCubeView(groupedItems(sinkTrip, cubesById)).map((g) => g.key);
check(
  'packed outfits and cubes keep relative order above Unsorted',
  afterOutfitPacked,
  [outfitGroupKey(sinkOutfit.id), 'beach', 'toiletries', UNSORTED_KEY],
);
check('Unsorted stays last even when it is the only incomplete group', afterOutfitPacked[afterOutfitPacked.length - 1], UNSORTED_KEY);

const addonSink = normalizeSuitcase({
  id: 's-addon-sink',
  cubeIds: ['toiletries'],
  items: [
    { id: 'tp', label: 'Toothpaste', cubeId: 'toiletries', packed: true },
    { id: 'meds', label: 'Ibuprofen', cubeId: 'toiletries', addOnId: 'travel-meds', packed: false },
  ],
  addOns: { toiletries: ['travel-meds'] },
});
const addonUnits = groupUnits(groupedItems(addonSink, cubesById));
check('cube + add-on is one unit', addonUnits[0].kind, 'cube');
check('cube unit stays up while an add-on item is unpacked', addonUnits[0].packed, false);
setItemPacked(addonSink, 'meds', true);
check('cube unit packs only when every cube and add-on item is packed', groupUnits(groupedItems(addonSink, cubesById))[0].packed, true);

const orderTrip = normalizeSuitcase({ id: 's-order', cubeIds: ['a', 'b', 'c'] });
check('reorderCubeIds writes the new order', reorderCubeIds(orderTrip, ['c', 'a']), ['c', 'a', 'b']);
const bandTrip = normalizeSuitcase({ id: 's-band', cubeIds: ['a', 'b', 'c', 'd'] });
check('reorderCubeIdsInBand permutes only the dragged band', reorderCubeIdsInBand(bandTrip, ['c', 'a']), ['c', 'b', 'a', 'd']);
check('orderUnitsForCubeView keeps Unsorted last', orderUnitsForCubeView([
  { kind: 'unsorted', packed: false, groups: [{ key: UNSORTED_KEY }] },
  { kind: 'cube', packed: true, groups: [{ key: 'done' }] },
  { kind: 'cube', packed: false, groups: [{ key: 'open' }] },
]).map((u) => u.groups[0].key), ['open', 'done', UNSORTED_KEY]);

const lookOrder = normalizeSuitcase({
  id: 's-look-order',
  outfits: [
    { id: 'o-a', name: 'Ceremony' },
    { id: 'o-b', name: 'Dinner' },
    { id: 'o-c', name: 'Brunch' },
  ],
});
check('reorderOutfits writes outfit array order', reorderOutfits(lookOrder, ['o-c', 'o-a']), ['o-c', 'o-a', 'o-b']);
const lookBand = normalizeSuitcase({
  id: 's-look-band',
  outfits: [
    { id: 'o-a', name: 'Ceremony' },
    { id: 'o-b', name: 'Dinner' },
    { id: 'o-c', name: 'Brunch' },
    { id: 'o-d', name: 'After' },
  ],
});
check('reorderOutfitsInBand permutes only the dragged band', reorderOutfitsInBand(lookBand, ['o-c', 'o-a']), ['o-c', 'o-b', 'o-a', 'o-d']);

const addOnOrderTrip = normalizeSuitcase({
  id: 's-addon-order',
  cubeIds: ['toiletries'],
  items: [
    { id: 'tb', label: 'Toothbrush', cubeId: 'toiletries' },
    { id: 'ib', label: 'Ibuprofen', cubeId: 'toiletries', addOnId: 'travel-meds' },
    { id: 'mz', label: 'Moisturizer', cubeId: 'toiletries', addOnId: 'beauty-basics' },
  ],
});
check(
  'add-ons follow cube definition until dragged',
  groupedItems(addOnOrderTrip, cubesById).map((g) => g.key),
  ['toiletries', addonGroupKey('toiletries', 'travel-meds'), addonGroupKey('toiletries', 'beauty-basics')],
);
check(
  'reorderAddOns writes suitcase addOnOrder',
  reorderAddOns(addOnOrderTrip, 'toiletries', ['beauty-basics', 'travel-meds']),
  ['beauty-basics', 'travel-meds'],
);
check(
  'By cube add-ons follow trip addOnOrder',
  groupedItems(addOnOrderTrip, cubesById).map((g) => g.key),
  ['toiletries', addonGroupKey('toiletries', 'beauty-basics'), addonGroupKey('toiletries', 'travel-meds')],
);
check('addOnOrder survives normalize', normalizeSuitcase(addOnOrderTrip).addOnOrder.toiletries, ['beauty-basics', 'travel-meds']);
check('addOnOrder is not the enabled list', addOnOrderTrip.addOns, {});
detachCube(addOnOrderTrip, 'toiletries');
check('detach drops addOnOrder for that cube', addOnOrderTrip.addOnOrder.toiletries, undefined);

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
check('normalize defaults collections', [junk.cubeIds, junk.addOns, junk.addOnOrder], [[], {}, {}]);
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
check('outfit dress code defaults empty', ceremony.dressCode, '');
check('outfit does not create a cube', trip.cubeIds, []);
check('outfitsForDate', outfitsForDate(trip, '2026-06-13').map((o) => o.name), ['Ceremony']);
check('updateOutfit sets dress code', updateOutfit(trip, ceremony.id, { dressCode: '  Black tie  ' }), true);
check('dress code trimmed', trip.outfits[0].dressCode, 'Black tie');
check('updateOutfit clears dress code', (() => {
  updateOutfit(trip, ceremony.id, { dressCode: '' });
  return trip.outfits[0].dressCode;
})(), '');

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
check('missing dress code normalizes empty', discarded.outfits[0].dressCode, '');
check(
  'normalize keeps dress code',
  normalizeSuitcase({ outfits: [{ id: 'o2', name: 'Dinner', dressCode: 'Cocktail' }] }).outfits[0].dressCode,
  'Cocktail',
);

const past = newSuitcase('Jaipur wedding');
const pastSuit = addItem(past, 'Navy suit');
const pastSq = addItem(past, 'Pocket square');
addOutfit(past, { name: 'Ceremony', event: 'Shaadi', dressCode: 'Bandhgala', itemIds: [pastSuit.id, pastSq.id] });
const now = newSuitcase('This weekend');
addItem(now, 'Navy suit');
const hits = searchPastOutfits([past, now], now.id, 'shaadi');
check('search past outfits by event', hits.map((h) => h.name), ['Ceremony']);
check('search past outfits by dress code', searchPastOutfits([past, now], now.id, 'bandhgala').map((h) => h.dressCode), ['Bandhgala']);
check('search hides the current trip', searchPastOutfits([past, now], past.id, 'ceremony').length, 0);
const copied = copyOutfit(past, past.outfits[0], now, { addMissing: true });
check('copy never creates a cube', now.cubeIds, []);
check('copy adds missing labels', now.items.map((i) => i.label), ['Navy suit', 'Pocket square']);
check('copy grouping uses current ids', copied.itemIds.length, 2);
check('copy date stays unset', copied.date, null);
check('copy preserves dress code', copied.dressCode, 'Bandhgala');
const skip = newSuitcase('Skip missing');
addItem(skip, 'Navy suit');
const partial = copyOutfit(past, past.outfits[0], skip, { addMissing: false });
check('copy grouping only skips missing', skip.items.map((i) => i.label), ['Navy suit']);
check('partial copy has one item', partial.itemIds.length, 1);

const undated = newSuitcase('No dates yet');
const bare = addOutfit(undated, { name: 'Ceremony' });
check('outfit saves with no date', [bare.date, bare.itemIds], [null, []]);
check('dress code cap is 80', addOutfit(undated, { name: 'Gala', dressCode: 'x'.repeat(90) }).dressCode.length, 80);
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

check('prefs default off', normalizePrefs(null), { betaViews: false, cubeTemplateBackfill: 0 });
check('prefs reads the flag', normalizePrefs({ betaViews: true }), { betaViews: true, cubeTemplateBackfill: 0 });
check('prefs keeps a finished backfill', normalizePrefs({ cubeTemplateBackfill: 1 }).cubeTemplateBackfill, 1);
check('needsCubeTemplateBackfill when unset', needsCubeTemplateBackfill(null), true);
check('needsCubeTemplateBackfill after mark', needsCubeTemplateBackfill(markCubeTemplateBackfill(null)), false);
check('CUBE_TEMPLATE_BACKFILL is 1', CUBE_TEMPLATE_BACKFILL, 1);
check('MAX_DAYS is 31', MAX_DAYS, 31);

const cap = newSuitcase('Long');
setTripDates(cap, { startDate: '2026-01-01', endDate: '2026-12-31' });
check('range fill stops at the cap', cap.days.length, 31);

// --- worn (trip-local; packed ≠ worn; never on pc_cubes) ---
const woreTrip = normalizeSuitcase({
  id: 's-wore',
  name: 'What I wore',
  items: [
    { id: 'dress', label: 'Black dress', packed: true, worn: true },
    { id: 'heels', label: 'Heels', packed: true },
    { id: 'scarf', label: 'Scarf', worn: true },
  ],
});
check('normalize keeps worn', woreTrip.items.find((i) => i.id === 'dress').worn, true);
check('worn defaults false', woreTrip.items.find((i) => i.id === 'heels').worn, false);
check('worn without packed is allowed', [
  woreTrip.items.find((i) => i.id === 'scarf').packed,
  woreTrip.items.find((i) => i.id === 'scarf').worn,
], [false, true]);
check('packed and worn stay independent', [
  woreTrip.items.find((i) => i.id === 'dress').packed,
  woreTrip.items.find((i) => i.id === 'dress').worn,
], [true, true]);
check('setItemWorn marks an item', setItemWorn(woreTrip, 'heels', true), true);
check('setItemWorn unknown id is false', setItemWorn(woreTrip, 'zzz', true), false);
check('wornItems lists trip-local flags', wornItems(woreTrip).map((i) => i.id).sort(), ['dress', 'heels', 'scarf']);
check('wornStats counts worn rows', wornStats(woreTrip), { worn: 3, total: 3 });
setItemPacked(woreTrip, 'heels', false);
check('unpacking does not clear worn', woreTrip.items.find((i) => i.id === 'heels').worn, true);

const lookTrip = newSuitcase('Dinner out');
const blazerW = addItem(lookTrip, 'Navy blazer');
const shoesW = addItem(lookTrip, 'Dress shoes');
const dinner = addOutfit(lookTrip, { name: 'Dinner', itemIds: [blazerW.id, shoesW.id] });
check('outfit-mark-worn needs no date', dinner.date, null);
check('setOutfitWorn marks every item', setOutfitWorn(lookTrip, dinner.id, true), 2);
check('outfit items are worn', [blazerW.worn, shoesW.worn], [true, true]);
check('outfitWornState all', outfitWornState(lookTrip, dinner), { total: 2, worn: 2, all: true, some: false });
setItemWorn(lookTrip, shoesW.id, false);
check('outfitWornState some', outfitWornState(lookTrip, dinner).some, true);
check('setOutfitWorn clears', setOutfitWorn(lookTrip, dinner.id, false), 2);
check('outfit worn cleared', [blazerW.worn, shoesW.worn], [false, false]);
check('setOutfitWorn unknown outfit is 0', setOutfitWorn(lookTrip, 'nope', true), 0);

const persistTrip = normalizeSuitcase({
  items: [{ id: 'w1', label: 'Socks', cubeId: 'basics', packed: true, worn: true }],
  cubeIds: ['basics'],
});
const persistAgain = normalizeSuitcase(persistTrip);
check('worn persists on the suitcase item', persistAgain.items[0].worn, true);
check('worn persist does not invent a cube field', persistAgain.items[0].cubeId, 'basics');

const official = { id: 'basics', title: 'Basics', items: [] };
check('syncOfficialCubeFromTrip appends the label', syncOfficialCubeFromTrip(official, persistTrip), true);
check('official cube stores only { label }', official.items, [{ label: 'Socks' }]);
check('official cube has no worn key', Object.prototype.hasOwnProperty.call(official.items[0], 'worn'), false);
check(
  'normalizeDefinitionItems strips worn/packed',
  normalizeDefinitionItems([{ label: 'Socks', worn: true, packed: true }]),
  [{ label: 'Socks' }],
);
check(
  'uniqueDefinitionItems strips worn',
  uniqueDefinitionItems([{ label: 'Socks', worn: true }]),
  [{ label: 'Socks' }],
);
const filedCube = { id: 'basics', title: 'Basics', items: [] };
const filedTrip = newSuitcase('File worn');
const filedRow = fileIntoCube(filedTrip, filedCube, 'Tee');
setItemWorn(filedTrip, filedRow.item.id, true);
syncOfficialCubeFromTrip(filedCube, filedTrip);
check('filing a worn item still writes only the label', filedCube.items, [{ label: 'Tee' }]);

setItemWorn(past, pastSuit.id, true);
const destFresh = newSuitcase('Fresh copy');
copyOutfit(past, past.outfits[0], destFresh, { addMissing: true });
check('copy does not copy worn onto this trip', destFresh.items.every((i) => !i.worn), true);
check('source trip keeps worn', past.items.find((i) => i.id === pastSuit.id).worn, true);

const worePast = newSuitcase('Last beach');
const unusedShirt = addItem(worePast, 'Linen shirt');
const usedShorts = addItem(worePast, 'Swim shorts');
setItemWorn(worePast, usedShorts.id, true);
addOutfit(worePast, { name: 'Swim day', itemIds: [unusedShirt.id, usedShorts.id] });
const otherPast = newSuitcase('Other trip');
const sunHat = addItem(otherPast, 'Sun hat');
addOutfit(otherPast, { name: 'Pool', event: 'beach', itemIds: [sunHat.id] });
const currentTrip = newSuitcase('Now');
const beachHits = searchPastOutfits([worePast, otherPast, currentTrip], currentTrip.id, 'beach');
check('past-outfit search prefers worn outfits', beachHits.map((h) => h.name), ['Swim day', 'Pool']);
check('worn labels listed first', beachHits[0].labels, ['Swim shorts', 'Linen shirt']);
check('wornCount is on the hit', beachHits[0].wornCount, 1);
check('unworn past outfit ranks later', beachHits[1].wornCount, 0);

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll packing-cubes model tests passed.');
