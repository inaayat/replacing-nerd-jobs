// Pure packing-cubes logic shared by the browser app and node tests.
// Keep this dependency-free ESM: no `node:` imports, no npm packages, no DOM.
//
// The data model (v2) is list-first:
//   - A suitcase owns a flat packing list: items[{ id, label, cubeId, addOnId, packed }].
//     The list is the source of truth — items can be typed straight in with no cube.
//   - Cubes are an organization layer on top. Attaching a cube imports its item
//     labels into the list (tagged with the cubeId); "Organize" re-assigns any
//     item's cubeId after the fact.
//   - Every list starts empty and every cube is the user's own choice. The
//     catalog offers "common" cubes (tag "common"; legacy "standard"/"basics"
//     read the same) as starter templates — never auto-attached, always
//     removable like any other cube.
//   - A cube may carry optional add-ons: named item bundles (travel meds, hair
//     tools, …) toggled per trip instead of creating one-off extra cubes.

export const SUITCASE_VERSION = 2;
export const UNSORTED_KEY = '__unsorted__';

export function newId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Normalized label used to detect duplicates when importing cube items. */
export function itemKey(label) {
  return String(label || '').toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Cubes
// ---------------------------------------------------------------------------

/** Common cubes are curated starter templates in the catalog. They are never
 *  auto-attached — "standard" / "basics" are legacy tags read the same way. */
export function isCommonCube(cube) {
  const tags = (cube?.tags || []).map((t) => String(t).toLowerCase());
  return tags.includes('common') || tags.includes('standard') || tags.includes('basics');
}

export function cubeAddOns(cube) {
  return Array.isArray(cube?.addOns) ? cube.addOns : [];
}

/** Catalog search covers title, blurb, tags, item labels, and add-on titles. */
export function matchesQuery(cube, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    cube.title,
    cube.blurb,
    ...(cube.tags || []),
    ...(cube.items || []).map((i) => i.label),
    ...cubeAddOns(cube).flatMap((a) => [a.title, ...(a.items || []).map((i) => i.label)]),
  ].join(' ').toLowerCase();
  return haystack.includes(q);
}

/** Own cubes first, then common templates, then alphabetical. */
export function sortCatalog(cubes) {
  return [...(cubes || [])].sort((a, b) => {
    if (!!a.mine !== !!b.mine) return a.mine ? -1 : 1;
    if (isCommonCube(a) !== isCommonCube(b)) return isCommonCube(a) ? -1 : 1;
    return String(a.title || '').localeCompare(String(b.title || ''));
  });
}

// ---------------------------------------------------------------------------
// Suitcase shape + migration
// ---------------------------------------------------------------------------

export function newItem(label, { cubeId = null, addOnId = null, packed = false } = {}) {
  return { id: newId(), label: String(label || '').trim(), cubeId, addOnId, packed: !!packed };
}

/** Fresh suitcase: an empty list. Cubes are attached only by the user. */
export function newSuitcase(name) {
  return {
    v: SUITCASE_VERSION,
    id: newId(),
    name,
    items: [],
    cubeIds: [],
    addOns: {},
  };
}

export function isLegacySuitcase(raw) {
  return !!raw && typeof raw === 'object' && (raw.v || 1) < SUITCASE_VERSION;
}

/**
 * Migrate a v1 suitcase (virtual cube items + customItems + label-keyed packed
 * + excludedItems) into the v2 flat list. Cube items materialize from
 * `cubesById`; ids missing from the map keep their cubeId attachment so the
 * cube's items can be re-imported later, but contribute no rows now.
 * v1 "excluded" (hidden) items migrate as deleted. Duplicate labels resolve to
 * the first cube in suitcase order, like the old merge did.
 */
export function migrateSuitcase(raw, cubesById) {
  if (!isLegacySuitcase(raw)) return normalizeSuitcase(raw);

  const packedByKey = raw.packed || {};
  const excluded = new Set(raw.excludedItems || []);
  const seen = new Set();
  const items = [];

  const takeLabel = (label, cubeId) => {
    const trimmed = String(label || '').trim();
    if (!trimmed) return;
    const key = itemKey(trimmed);
    if (seen.has(key) || excluded.has(key)) return;
    seen.add(key);
    items.push(newItem(trimmed, { cubeId, packed: !!packedByKey[key] }));
  };

  for (const cubeId of raw.cubeIds || []) {
    const cube = cubesById?.get?.(cubeId);
    for (const item of cube?.items || []) takeLabel(item.label, cubeId);
  }
  for (const custom of raw.customItems || []) {
    takeLabel(custom.label, custom.cubeId || null);
  }

  return {
    v: SUITCASE_VERSION,
    id: raw.id || newId(),
    name: raw.name || 'My trip',
    items,
    cubeIds: [...(raw.cubeIds || [])],
    addOns: {},
  };
}

/** Fill defaults on an already-v2 suitcase (tolerates hand-rolled JSON). */
export function normalizeSuitcase(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    v: SUITCASE_VERSION,
    id: s.id || newId(),
    name: s.name || 'My trip',
    items: (Array.isArray(s.items) ? s.items : [])
      .filter((i) => i && typeof i.label === 'string')
      .map((i) => ({
        id: i.id || newId(),
        label: i.label,
        cubeId: i.cubeId || null,
        addOnId: i.addOnId || null,
        packed: !!i.packed,
      })),
    cubeIds: Array.isArray(s.cubeIds) ? s.cubeIds.filter(Boolean) : [],
    addOns: s.addOns && typeof s.addOns === 'object' ? s.addOns : {},
  };
}

// ---------------------------------------------------------------------------
// The packing list (source of truth)
// ---------------------------------------------------------------------------

export function addItem(suitcase, label, { cubeId = null } = {}) {
  const trimmed = String(label || '').trim();
  if (!trimmed) return null;
  const item = newItem(trimmed, { cubeId });
  suitcase.items.push(item);
  return item;
}

export function removeItem(suitcase, itemId) {
  const before = suitcase.items.length;
  suitcase.items = suitcase.items.filter((i) => i.id !== itemId);
  return suitcase.items.length !== before;
}

export function updateItemLabel(suitcase, itemId, label) {
  const item = suitcase.items.find((i) => i.id === itemId);
  if (!item) return false;
  item.label = String(label || '');
  return true;
}

export function setItemPacked(suitcase, itemId, packed) {
  const item = suitcase.items.find((i) => i.id === itemId);
  if (!item) return false;
  item.packed = !!packed;
  return true;
}

/** Organize: assign (or unassign, cubeId = null) an item to a cube. */
export function assignItem(suitcase, itemId, cubeId) {
  const item = suitcase.items.find((i) => i.id === itemId);
  if (!item) return false;
  const next = cubeId || null;
  if (item.cubeId !== next) item.addOnId = null;
  item.cubeId = next;
  return true;
}

export function packedStats(suitcase) {
  const total = suitcase.items.length;
  const packed = suitcase.items.filter((i) => i.packed).length;
  return { packed, total };
}

export function allPacked(suitcase) {
  const { packed, total } = packedStats(suitcase);
  return total > 0 && packed === total;
}

// ---------------------------------------------------------------------------
// Cubes as an organization layer
// ---------------------------------------------------------------------------

function existingKeys(suitcase) {
  return new Set(suitcase.items.map((i) => itemKey(i.label)));
}

/**
 * Attach a cube to the suitcase and import its base items into the list
 * (skipping labels already present). Returns how many items were imported.
 */
export function attachCube(suitcase, cube) {
  if (!cube?.id) return 0;
  if (!suitcase.cubeIds.includes(cube.id)) suitcase.cubeIds.push(cube.id);
  const seen = existingKeys(suitcase);
  let imported = 0;
  for (const item of cube.items || []) {
    const label = String(item.label || '').trim();
    if (!label || seen.has(itemKey(label))) continue;
    seen.add(itemKey(label));
    suitcase.items.push(newItem(label, { cubeId: cube.id }));
    imported += 1;
  }
  return imported;
}

/** Detach a cube: its imported/assigned items leave the list with it. */
export function detachCube(suitcase, cubeId) {
  suitcase.cubeIds = suitcase.cubeIds.filter((id) => id !== cubeId);
  suitcase.items = suitcase.items.filter((i) => i.cubeId !== cubeId);
  if (suitcase.addOns) delete suitcase.addOns[cubeId];
}

export function addOnEnabled(suitcase, cubeId, addOnId) {
  return !!(suitcase.addOns?.[cubeId] || []).includes(addOnId);
}

/**
 * Toggle a cube add-on for this trip. Enabling attaches the cube if needed and
 * imports the add-on's items (tagged with the cube + add-on); disabling removes
 * the rows that came from that add-on. Returns imported/removed row count.
 */
export function setAddOn(suitcase, cube, addOnId, enabled) {
  const addOn = cubeAddOns(cube).find((a) => a.id === addOnId);
  if (!addOn) return 0;
  if (!suitcase.addOns) suitcase.addOns = {};

  if (enabled) {
    attachCube(suitcase, cube);
    const list = suitcase.addOns[cube.id] || [];
    if (!list.includes(addOnId)) suitcase.addOns[cube.id] = [...list, addOnId];
    const seen = existingKeys(suitcase);
    let imported = 0;
    for (const item of addOn.items || []) {
      const label = String(item.label || '').trim();
      if (!label || seen.has(itemKey(label))) continue;
      seen.add(itemKey(label));
      suitcase.items.push(newItem(label, { cubeId: cube.id, addOnId }));
      imported += 1;
    }
    return imported;
  }

  suitcase.addOns[cube.id] = (suitcase.addOns[cube.id] || []).filter((id) => id !== addOnId);
  if (!suitcase.addOns[cube.id].length) delete suitcase.addOns[cube.id];
  const before = suitcase.items.length;
  suitcase.items = suitcase.items.filter((i) => !(i.cubeId === cube.id && i.addOnId === addOnId));
  return before - suitcase.items.length;
}

/**
 * A cube was deleted from the account entirely. The list is the source of
 * truth, so its items stay — they just become unsorted again.
 */
export function releaseDeletedCube(suitcase, cubeId) {
  let changed = false;
  if (suitcase.cubeIds.includes(cubeId)) {
    suitcase.cubeIds = suitcase.cubeIds.filter((id) => id !== cubeId);
    changed = true;
  }
  for (const item of suitcase.items) {
    if (item.cubeId === cubeId) {
      item.cubeId = null;
      item.addOnId = null;
      changed = true;
    }
  }
  if (suitcase.addOns?.[cubeId]) {
    delete suitcase.addOns[cubeId];
    changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/**
 * Group the list by cube for the "By cube" view: attached cubes in suitcase
 * order (kept even when empty, so Organize has drop targets), items assigned
 * to a no-longer-attached cube grouped under it too, and unsorted items last.
 */
export function groupedItems(suitcase, cubesById) {
  const groups = [];
  const byKey = new Map();
  const ensure = (key, title) => {
    if (!byKey.has(key)) {
      const g = { key, title, items: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    return byKey.get(key);
  };

  for (const cubeId of suitcase.cubeIds) {
    ensure(cubeId, cubesById?.get?.(cubeId)?.title || cubeId);
  }
  const unsorted = [];
  for (const item of suitcase.items) {
    if (!item.cubeId) {
      unsorted.push(item);
    } else {
      ensure(item.cubeId, cubesById?.get?.(item.cubeId)?.title || item.cubeId).items.push(item);
    }
  }
  if (unsorted.length) {
    const g = ensure(UNSORTED_KEY, 'Unsorted');
    g.items = unsorted;
  }
  return groups;
}

/** Count of items still unassigned — drives the Organize affordance. */
export function unsortedCount(suitcase) {
  return suitcase.items.filter((i) => !i.cubeId).length;
}
