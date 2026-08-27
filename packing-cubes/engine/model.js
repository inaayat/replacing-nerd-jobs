// Pure packing-cubes logic shared by the browser app and node tests.
// Keep this dependency-free ESM: no `node:` imports, no npm packages, no DOM.
//
// The data model (v2) is list-first:
//   - A suitcase owns a flat packing list: items[{ id, label, cubeId, addOnId, packed }].
//     The list is the source of truth — items can be typed straight in with no cube.
//   - Cubes are an organization layer on top. Attaching a cube imports its item
//     labels into the list (tagged with the cubeId); "Organize" re-assigns any
//     item's cubeId (and optional addOnId) after the fact.
//   - Every cube is one the user built — there is no shared catalog. New lists
//     start empty unless the user marked some of their cubes / add-ons
//     `includeByDefault`. Any cube is always removable from a list.
//   - A cube may carry optional add-ons: named item bundles (travel meds, hair
//     tools, …) toggled per trip, and shown in Organize as "Toiletries - Beauty
//     Basics" so they can be filed into like cubes.

export const SUITCASE_VERSION = 2;
export const UNSORTED_KEY = '__unsorted__';
/** Group-key separator for "parent cube + add-on" rows. Cube ids are slugs. */
export const ADDON_KEY_SEP = '::';

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

export function cubeAddOns(cube) {
  return Array.isArray(cube?.addOns) ? cube.addOns : [];
}

export function isDefaultCube(cube) {
  return !!cube?.includeByDefault;
}

export function isDefaultAddOn(addOn) {
  return !!addOn?.includeByDefault;
}

/** Display name for an add-on when it appears as a cube you can pick. */
export function addOnLabel(cube, addOn) {
  const cubeTitle = cube?.title || cube?.id || '';
  const addOnTitle = addOn?.title || addOn?.id || '';
  if (!cubeTitle) return addOnTitle;
  if (!addOnTitle) return cubeTitle;
  return `${cubeTitle} - ${addOnTitle}`;
}

export function addonGroupKey(cubeId, addOnId) {
  return `${cubeId}${ADDON_KEY_SEP}${addOnId}`;
}

export function parseAddonGroupKey(key) {
  const sep = String(key || '').indexOf(ADDON_KEY_SEP);
  if (sep < 0) return { cubeId: key || null, addOnId: null };
  return {
    cubeId: key.slice(0, sep),
    addOnId: key.slice(sep + ADDON_KEY_SEP.length) || null,
  };
}

/** Select value for an Organize assignment. Empty string = unsorted. */
export function assignmentKey(cubeId, addOnId) {
  if (!cubeId) return '';
  return addOnId ? `a:${cubeId}:${addOnId}` : `c:${cubeId}`;
}

export function parseAssignment(value) {
  const raw = String(value || '');
  if (!raw) return { cubeId: null, addOnId: null };
  if (raw.startsWith('a:')) {
    const rest = raw.slice(2);
    const sep = rest.indexOf(':');
    if (sep < 0) return { cubeId: rest || null, addOnId: null };
    return { cubeId: rest.slice(0, sep) || null, addOnId: rest.slice(sep + 1) || null };
  }
  if (raw.startsWith('c:')) return { cubeId: raw.slice(2) || null, addOnId: null };
  return { cubeId: raw, addOnId: null };
}

/**
 * Cubes and add-ons the user can file an item into. Attached cubes first
 * (so "on this list" is the fast pick), then the rest of their cubes, each
 * add-on listed as "Parent - Add-on".
 */
export function organizeTargets(cubes, suitcase) {
  const attached = new Set(suitcase?.cubeIds || []);
  const sorted = sortCatalog(cubes);
  const onList = [];
  const others = [];
  for (const cube of sorted) {
    const dest = attached.has(cube.id) ? onList : others;
    dest.push({
      value: assignmentKey(cube.id, null),
      label: cube.title || cube.id,
      cubeId: cube.id,
      addOnId: null,
    });
    for (const addOn of cubeAddOns(cube)) {
      dest.push({
        value: assignmentKey(cube.id, addOn.id),
        label: addOnLabel(cube, addOn),
        cubeId: cube.id,
        addOnId: addOn.id,
      });
    }
  }
  return { onList, others };
}

/** Items on this packing list that currently live in a cube (any add-on). */
export function filedInCube(suitcase, cubeId) {
  return (suitcase?.items || []).filter((i) => i.cubeId === cubeId);
}

/**
 * What My Cubes should show inside a card. If the cube is on this packing
 * list (or already has rows filed into it), the list is the source of truth —
 * that's how Organize fills an empty cube. Otherwise fall back to the cube's
 * saved template.
 */
export function expandContents(suitcase, cube) {
  if (!cube?.id) return { source: 'cube', items: [], addOns: [] };
  const filed = filedInCube(suitcase, cube.id);
  const onList = (suitcase?.cubeIds || []).includes(cube.id) || filed.length > 0;
  if (onList) {
    const addOns = [];
    const seen = new Set();
    for (const addOn of cubeAddOns(cube)) {
      seen.add(addOn.id);
      addOns.push({
        id: addOn.id,
        title: addOn.title,
        items: filed.filter((i) => i.addOnId === addOn.id).map((i) => ({ label: i.label })),
      });
    }
    for (const item of filed) {
      if (!item.addOnId || seen.has(item.addOnId)) continue;
      seen.add(item.addOnId);
      addOns.push({
        id: item.addOnId,
        title: item.addOnId,
        items: filed.filter((i) => i.addOnId === item.addOnId).map((i) => ({ label: i.label })),
      });
    }
    return {
      source: 'list',
      items: filed.filter((i) => !i.addOnId).map((i) => ({ label: i.label })),
      addOns,
    };
  }
  return {
    source: 'cube',
    items: (cube.items || []).map((i) => ({ label: i.label })),
    addOns: cubeAddOns(cube).map((a) => ({
      id: a.id,
      title: a.title,
      items: (a.items || []).map((i) => ({ label: i.label })),
    })),
  };
}

/** Copy a filed label onto the cube (or add-on) so the group keeps it. */
export function absorbItemIntoCube(cube, label, addOnId = null) {
  if (!cube) return false;
  const trimmed = String(label || '').trim();
  if (!trimmed) return false;
  const key = itemKey(trimmed);
  if (addOnId) {
    const addOn = cubeAddOns(cube).find((a) => a.id === addOnId);
    if (!addOn) return false;
    if (!Array.isArray(addOn.items)) addOn.items = [];
    if (addOn.items.some((i) => itemKey(i.label) === key)) return false;
    addOn.items.push({ label: trimmed });
    return true;
  }
  if (!Array.isArray(cube.items)) cube.items = [];
  if (cube.items.some((i) => itemKey(i.label) === key)) return false;
  cube.items.push({ label: trimmed });
  return true;
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

/** Alphabetical by title — every cube here belongs to the viewer. */
export function sortCatalog(cubes) {
  return [...(cubes || [])].sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
}

// ---------------------------------------------------------------------------
// Suitcase shape + migration
// ---------------------------------------------------------------------------

export function newItem(label, { cubeId = null, addOnId = null, packed = false } = {}) {
  return { id: newId(), label: String(label || '').trim(), cubeId, addOnId, packed: !!packed };
}

/**
 * Fresh suitcase. Empty unless `cubes` contains entries marked
 * includeByDefault (cube and/or add-on). Those are the user's own "always
 * take these" picks — not a shared catalog.
 */
export function newSuitcase(name, cubes = []) {
  const suitcase = {
    v: SUITCASE_VERSION,
    id: newId(),
    name,
    items: [],
    cubeIds: [],
    addOns: {},
  };
  seedDefaults(suitcase, cubes);
  return suitcase;
}

/** Attach default cubes and enable default add-ons on a new list. */
export function seedDefaults(suitcase, cubes) {
  const list = Array.isArray(cubes) ? cubes : [];
  for (const cube of list) {
    if (isDefaultCube(cube)) attachCube(suitcase, cube);
  }
  for (const cube of list) {
    for (const addOn of cubeAddOns(cube)) {
      if (isDefaultAddOn(addOn)) setAddOn(suitcase, cube, addOn.id, true);
    }
  }
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

/** Organize: assign (or unassign, cubeId = null) an item to a cube or add-on. */
export function assignItem(suitcase, itemId, cubeId, addOnId = null) {
  const item = suitcase.items.find((i) => i.id === itemId);
  if (!item) return false;
  const next = cubeId || null;
  const nextAddOn = next && addOnId ? addOnId : null;
  item.cubeId = next;
  item.addOnId = nextAddOn;
  if (next && !suitcase.cubeIds.includes(next)) suitcase.cubeIds.push(next);
  if (next && nextAddOn) {
    if (!suitcase.addOns) suitcase.addOns = {};
    const list = suitcase.addOns[next] || [];
    if (!list.includes(nextAddOn)) suitcase.addOns[next] = [...list, nextAddOn];
  }
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
 * order (kept even when empty, so Organize has drop targets), then each
 * add-on as its own group titled "Parent - Add-on". Items assigned to a
 * no-longer-attached cube grouped under it too, unsorted last.
 *
 * Pass `{ includeEmptyAddOns: true }` in Organize so unused add-ons still
 * appear as filing targets.
 */
export function groupedItems(suitcase, cubesById, { includeEmptyAddOns = false } = {}) {
  const groups = [];
  const byKey = new Map();
  const ensure = (key, title, meta = {}) => {
    if (!byKey.has(key)) {
      const g = { key, title, items: [], cubeId: meta.cubeId || null, addOnId: meta.addOnId || null };
      byKey.set(key, g);
      groups.push(g);
    }
    return byKey.get(key);
  };

  const addCubeGroups = (cubeId) => {
    const cube = cubesById?.get?.(cubeId);
    ensure(cubeId, cube?.title || cubeId, { cubeId });
    for (const addOn of cubeAddOns(cube)) {
      const hasItems = suitcase.items.some((i) => i.cubeId === cubeId && i.addOnId === addOn.id);
      if (includeEmptyAddOns || hasItems) {
        ensure(addonGroupKey(cubeId, addOn.id), addOnLabel(cube || { id: cubeId }, addOn), {
          cubeId,
          addOnId: addOn.id,
        });
      }
    }
  };

  for (const cubeId of suitcase.cubeIds) addCubeGroups(cubeId);

  const unsorted = [];
  for (const item of suitcase.items) {
    if (!item.cubeId) {
      unsorted.push(item);
    } else if (item.addOnId) {
      const cube = cubesById?.get?.(item.cubeId);
      const addOn = cubeAddOns(cube).find((a) => a.id === item.addOnId);
      ensure(
        addonGroupKey(item.cubeId, item.addOnId),
        addOn ? addOnLabel(cube || { id: item.cubeId }, addOn) : addOnLabel({ title: cube?.title || item.cubeId }, { title: item.addOnId }),
        { cubeId: item.cubeId, addOnId: item.addOnId },
      ).items.push(item);
    } else {
      ensure(item.cubeId, cubesById?.get?.(item.cubeId)?.title || item.cubeId, { cubeId: item.cubeId }).items.push(item);
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
