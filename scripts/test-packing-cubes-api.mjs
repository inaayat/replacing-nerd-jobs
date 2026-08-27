// Pure server-side Packing Cubes helpers (lib/packing-cubes.js): cube
// validation, input normalization, and automatic cube-id resolution.
//   node scripts/test-packing-cubes-api.mjs
import {
  slugify,
  validateCube,
  normalizeCubeInput,
  nextFreeId,
} from '../lib/packing-cubes.js';

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

const valid = { title: 'Toiletries', items: [{ label: 'Toothbrush' }, { label: 'Toothpaste' }] };

// --- slugify / ids ---
check('slugify makes a url-safe id', slugify('  Work Trip: Winter! '), 'work-trip-winter');

// Ids are derived from the title and never shown, so collisions resolve
// automatically rather than asking the user to invent an id.
check('free id is used as-is', nextFreeId('toiletries', []), 'toiletries');
check('taken id gets -2', nextFreeId('toiletries', ['toiletries']), 'toiletries-2');
check('walks past several', nextFreeId('toiletries', ['toiletries', 'toiletries-2', 'toiletries-3']), 'toiletries-4');
check('accepts a Set', nextFreeId('beach', new Set(['beach'])), 'beach-2');
check('empty base stays empty', nextFreeId('', ['x']), '');
check('unrelated ids do not block', nextFreeId('beach', ['beach-house']), 'beach');

// --- validation ---
check('valid cube passes', validateCube(valid), null);
check('title required', validateCube({ items: valid.items }), 'Title is required.');
check('two items required', validateCube({ title: 'X', items: [{ label: 'One' }] }), 'Add at least 2 items.');
check('items need labels', validateCube({ title: 'X', items: [{ label: 'a' }, { label: '  ' }] }), 'Every item needs a label.');
check('title length capped', validateCube({ ...valid, title: 'x'.repeat(121) }), 'Title must be under 120 characters.');
check('tags must be a list', validateCube({ ...valid, tags: 'summer' }), 'Tags must be a list.');

// Add-ons are optional, but validated when present.
check('no add-ons is fine', validateCube({ ...valid, addOns: [] }), null);
check('add-ons must be a list', validateCube({ ...valid, addOns: {} }), 'Add-ons must be a list.');
check('add-on needs a title', validateCube({ ...valid, addOns: [{ items: [{ label: 'a' }] }] }), 'Every add-on needs a title.');
check(
  'add-on needs an item',
  validateCube({ ...valid, addOns: [{ title: 'Meds', items: [] }] }),
  'Add-on "Meds" needs at least 1 item.',
);
check(
  'add-on items need labels',
  validateCube({ ...valid, addOns: [{ title: 'Meds', items: [{ label: '' }] }] }),
  'Every item needs a label.',
);
check('one add-on item is enough', validateCube({ ...valid, addOns: [{ title: 'Meds', items: [{ label: 'Ibuprofen' }] }] }), null);

// --- normalization ---
const normalized = normalizeCubeInput({
  title: '  Toiletries  ',
  blurb: '  bathroom bag ',
  tags: [' hygiene ', ''],
  items: [{ label: '  Toothbrush ' }],
  addOns: [
    { title: ' Travel meds ', items: [{ label: ' Ibuprofen ' }] },
    { title: 'Hair tools', items: [{ label: 'Comb' }] },
  ],
});
check('id derives from the title', normalized.id, 'toiletries');
check('strings trimmed', [normalized.title, normalized.blurb], ['Toiletries', 'bathroom bag']);
check('blank tags dropped', normalized.tags, ['hygiene']);
check('item labels trimmed', normalized.items, [{ label: 'Toothbrush' }]);
check('add-on ids slugified from titles', normalized.addOns.map((a) => a.id), ['travel-meds', 'hair-tools']);
check('add-on items normalized', normalized.addOns[0].items, [{ label: 'Ibuprofen' }]);

check(
  'duplicate add-on titles get distinct ids',
  normalizeCubeInput({
    title: 'X',
    items: [{ label: 'a' }],
    addOns: [
      { title: 'Meds', items: [{ label: 'a' }] },
      { title: 'Meds', items: [{ label: 'b' }] },
    ],
  }).addOns.map((a) => a.id),
  ['meds', 'meds-2'],
);
check('explicit id wins over the title', normalizeCubeInput({ id: 'Custom ID', title: 'Other', items: [] }).id, 'custom-id');
check('fallbackId used when no id or title slug', normalizeCubeInput({ title: '!!!', items: [] }, { fallbackId: 'kept-id' }).id, 'kept-id');
check('add-ons default to an empty list', normalizeCubeInput({ title: 'X', items: [] }).addOns, []);

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll packing-cubes API helper tests passed.');
