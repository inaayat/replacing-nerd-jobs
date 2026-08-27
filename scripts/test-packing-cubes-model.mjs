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
check('cubeAddOns reads bundles', cubeAddOns(toiletries).map((a) => a.id), ['travel-meds', 'hair-tools']);

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

// Enabling an add-on for an unattached cube attaches it first.
const s3 = newSuitcase('Weekend');
setAddOn(s3, toiletries, 'travel-meds', true);
check('add-on auto-attaches its cube', s3.cubeIds, ['toiletries']);
check(
  'auto-attach imports base items too',
  s3.items.map((i) => i.label),
  ['Toothbrush', 'Toothpaste', 'Deodorant', 'Ibuprofen', 'Band-aids'],
);

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

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll packing-cubes model tests passed.');
