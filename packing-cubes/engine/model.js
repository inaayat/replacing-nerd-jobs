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
export const MAX_DAYS = 31;
export const MAX_OUTFITS = 40;
export const MAX_OUTFIT_ITEMS = 40;
export const MAX_OUTFIT_NAME = 80;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value) {
  const m = String(value || '').match(ISO_DATE);
  if (!m) return false;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, month - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === month - 1 && dt.getDate() === d;
}

export function addCalendarDays(iso, n) {
  if (!isIsoDate(iso)) return null;
  const [y, month, d] = iso.split('-').map(Number);
  const dt = new Date(y, month - 1, d + Number(n || 0));
  return formatIsoLocal(dt);
}

export function formatIsoLocal(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function datesInRange(start, end) {
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) return [];
  const out = [];
  let cur = start;
  while (cur <= end && out.length < MAX_DAYS) {
    out.push(cur);
    cur = addCalendarDays(cur, 1);
  }
  return out;
}

export function normalizeDateList(raw) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(raw) ? raw : []) {
    if (!isIsoDate(value) || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  out.sort();
  return out;
}

export function weekdayDateLabel(iso) {
  if (!isIsoDate(iso)) return '';
  const [y, month, d] = iso.split('-').map(Number);
  const dt = new Date(y, month - 1, d);
  const weekday = dt.toLocaleDateString('en-GB', { weekday: 'short' });
  const mon = dt.toLocaleDateString('en-GB', { month: 'short' });
  return `${weekday} ${dt.getDate()} ${mon}`;
}

export function dayOrdinal(suitcase, date) {
  if (!isIsoDate(suitcase?.startDate) || !isIsoDate(date) || date < suitcase.startDate) return null;
  let n = 1;
  let cur = suitcase.startDate;
  while (cur < date && n < 400) {
    cur = addCalendarDays(cur, 1);
    n += 1;
  }
  return cur === date ? n : null;
}

export function dayLabel(suitcase, date) {
  const pretty = weekdayDateLabel(date);
  const n = dayOrdinal(suitcase, date);
  return n ? `${pretty} · Day ${n}` : pretty;
}

export function normalizePrefs(raw) {
  return { betaViews: !!(raw && raw.betaViews) };
}

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

export function outfitGroupKey(outfitId) {
  return `outfit:${outfitId}`;
}

function addOnHasTemplateItems(addOn) {
  return (addOn?.items || []).some((i) => i && String(i.label || '').trim());
}

function slugishAddOnId(title, taken) {
  const base = String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'add-on';
  let id = base;
  let n = 2;
  while (taken.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

/** Name an add-on with no items — a bucket to file into later. */
export function addEmptyAddOn(cube, title) {
  const name = String(title || '').trim();
  if (!cube || !name) return null;
  if (!Array.isArray(cube.addOns)) cube.addOns = [];
  const existing = cube.addOns.find((a) => itemKey(a.title) === itemKey(name));
  if (existing) return existing;
  const addOn = {
    id: slugishAddOnId(name, new Set(cube.addOns.map((a) => a.id).filter(Boolean))),
    title: name,
    items: [],
    includeByDefault: false,
  };
  cube.addOns.push(addOn);
  return addOn;
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

function mergeLabels(template, extras) {
  const out = [];
  const seen = new Set();
  for (const row of [...(template || []), ...(extras || [])]) {
    const label = String(row?.label || '').trim();
    if (!label) continue;
    const key = itemKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label });
  }
  return out;
}

/**
 * What My Cubes should show inside a card. The cube (and add-on) definition
 * always stays: trip-local remove / unassign must not hide those labels.
 * Extra labels filed on this trip still appear so an empty cube you fill
 * from Organize is visible. Off-list, this is just the saved template.
 */
export function expandContents(suitcase, cube) {
  if (!cube?.id) return { source: 'cube', items: [], addOns: [] };
  const filed = filedInCube(suitcase, cube.id);
  const onList = (suitcase?.cubeIds || []).includes(cube.id) || filed.length > 0;
  const extras = onList
    ? filed.filter((i) => !i.addOnId).map((i) => ({ label: i.label }))
    : [];
  const addOns = [];
  const seen = new Set();
  for (const addOn of cubeAddOns(cube)) {
    seen.add(addOn.id);
    const extra = onList
      ? filed.filter((i) => i.addOnId === addOn.id).map((i) => ({ label: i.label }))
      : [];
    addOns.push({
      id: addOn.id,
      title: addOn.title,
      items: mergeLabels(addOn.items, extra),
    });
  }
  if (onList) {
    for (const item of filed) {
      if (!item.addOnId || seen.has(item.addOnId)) continue;
      seen.add(item.addOnId);
      addOns.push({
        id: item.addOnId,
        title: item.addOnId,
        items: filed.filter((i) => i.addOnId === item.addOnId).map((i) => ({ label: i.label })),
      });
    }
  }
  return {
    source: onList ? 'list' : 'cube',
    items: mergeLabels(cube.items, extras),
    addOns,
  };
}

function definitionLabels(list) {
  return Array.isArray(list) ? list : [];
}

function definitionHasLabel(list, key) {
  return definitionLabels(list).some((i) => itemKey(typeof i === 'string' ? i : i?.label) === key);
}

function appendDefinitionLabel(list, trimmed) {
  const next = definitionLabels(list);
  next.push({ label: trimmed });
  return next;
}

/** Coerce string-or-object definition rows to `{ label }` for PATCH bodies. */
export function normalizeDefinitionItems(list) {
  return definitionLabels(list).map((raw) => {
    const label = String(typeof raw === 'string' ? raw : raw?.label || '').trim();
    return label ? { label } : null;
  }).filter(Boolean);
}

/**
 * Official cube from GET /api/pc-cubes?id=. A rewrite that drops `id`
 * returns the list payload `{ cubes }` with no `cube` — recover by id.
 */
export function officialCubeFromApi(data, id) {
  const want = String(id || '').trim();
  if (data?.cube && typeof data.cube === 'object') {
    if (!want || data.cube.id === want) return data.cube;
  }
  const cubes = Array.isArray(data?.cubes) ? data.cubes : [];
  if (want) {
    const hit = cubes.find((c) => c && c.id === want);
    if (hit) return hit;
  }
  return null;
}

/** Copy a filed label onto the cube (or add-on). Appends only — never strips. */
export function absorbItemIntoCube(cube, label, addOnId = null) {
  if (!cube) return false;
  const trimmed = String(label || '').trim();
  if (!trimmed) return false;
  const key = itemKey(trimmed);
  if (addOnId) {
    const addOn = cubeAddOns(cube).find((a) => a.id === addOnId);
    if (addOn) {
      addOn.items = normalizeDefinitionItems(addOn.items);
      if (definitionHasLabel(addOn.items, key)) return false;
      addOn.items = appendDefinitionLabel(addOn.items, trimmed);
      return true;
    }
    // Add-on missing on the official record — still persist onto the cube.
  }
  cube.items = normalizeDefinitionItems(cube.items);
  if (definitionHasLabel(cube.items, key)) return false;
  cube.items = appendDefinitionLabel(cube.items, trimmed);
  return true;
}

/**
 * Append every trip-filed label for this cube onto the official record.
 * Does not remove labels that are no longer on the trip.
 */
export function syncOfficialCubeFromTrip(cube, suitcase, cubeId = cube?.id) {
  if (!cube || !suitcase || !cubeId) return false;
  let changed = false;
  for (const item of suitcase.items || []) {
    if (!item || item.cubeId !== cubeId) continue;
    if (absorbItemIntoCube(cube, item.label, item.addOnId || null)) changed = true;
  }
  return changed;
}

/**
 * Put a label on this trip under a cube/add-on and append it to the cube
 * definition. includeByDefault / basics tags do not skip the append.
 * Returns { item, absorbed } or null if the label is empty.
 */
export function fileIntoCube(suitcase, cube, label, addOnId = null) {
  if (!suitcase || !cube?.id) return null;
  const trimmed = String(label || '').trim();
  if (!trimmed) return null;
  const item = ensureListItem(suitcase, trimmed);
  if (!item) return null;
  assignItem(suitcase, item.id, cube.id, addOnId);
  return { item, absorbed: absorbItemIntoCube(cube, item.label, addOnId) };
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

export function newItem(label, { cubeId = null, addOnId = null, packed = false, dates = [] } = {}) {
  return {
    id: newId(),
    label: String(label || '').trim(),
    cubeId,
    addOnId,
    packed: !!packed,
    dates: normalizeDateList(dates),
  };
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
    startDate: null,
    endDate: null,
    days: [],
    outfits: [],
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

  return normalizeSuitcase({
    v: SUITCASE_VERSION,
    id: raw.id || newId(),
    name: raw.name || 'My trip',
    items,
    cubeIds: [...(raw.cubeIds || [])],
    addOns: {},
  });
}

function normalizeDays(raw) {
  const seen = new Set();
  const days = [];
  for (const row of Array.isArray(raw) ? raw : []) {
    const date = typeof row === 'string' ? row : row?.date;
    if (!isIsoDate(date) || seen.has(date)) continue;
    seen.add(date);
    days.push({ date });
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

function normalizeOutfits(raw, itemIds, dayDates) {
  const outfits = [];
  const knownItems = new Set(itemIds);
  for (const row of Array.isArray(raw) ? raw : []) {
    if (!row || typeof row !== 'object') continue;
    const name = String(row.name || '').trim().slice(0, MAX_OUTFIT_NAME);
    if (!name) continue;
    const event = String(row.event || '').trim().slice(0, MAX_OUTFIT_NAME);
    const date = isIsoDate(row.date) && dayDates.has(row.date) ? row.date : null;
    const ids = [];
    const seen = new Set();
    for (const id of Array.isArray(row.itemIds) ? row.itemIds : []) {
      if (!id || seen.has(id) || !knownItems.has(id)) continue;
      if (ids.length >= MAX_OUTFIT_ITEMS) break;
      seen.add(id);
      ids.push(id);
    }
    outfits.push({
      id: row.id && String(row.id).trim() ? String(row.id) : newId(),
      name,
      event,
      date,
      itemIds: ids,
    });
    if (outfits.length >= MAX_OUTFITS) break;
  }
  return outfits;
}

/** Fill defaults on an already-v2 suitcase (tolerates hand-rolled JSON). */
export function normalizeSuitcase(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const days = normalizeDays(s.days);
  const dayDates = new Set(days.map((d) => d.date));
  const startDate = isIsoDate(s.startDate) ? s.startDate : null;
  const endDate = isIsoDate(s.endDate) && (!startDate || s.endDate >= startDate) ? s.endDate : null;
  const items = uniqueItemsById(
    (Array.isArray(s.items) ? s.items : [])
      .filter((i) => i && typeof i.label === 'string')
      .map((i) => ({
        id: i.id || newId(),
        label: i.label,
        cubeId: i.cubeId || null,
        addOnId: i.addOnId || null,
        packed: !!i.packed,
        // Discard numbered-day draft (`dayIds`). Keep only ISO dates on this trip.
        dates: normalizeDateList(i.dates).filter((d) => dayDates.has(d)),
      })),
  );
  return {
    v: SUITCASE_VERSION,
    id: s.id || newId(),
    name: s.name || 'My trip',
    items,
    cubeIds: Array.isArray(s.cubeIds) ? s.cubeIds.filter(Boolean) : [],
    addOns: s.addOns && typeof s.addOns === 'object' ? s.addOns : {},
    startDate,
    endDate,
    days,
    outfits: normalizeOutfits(s.outfits, items.map((i) => i.id), dayDates),
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

/** First list row with this label, or a new row. Never a second inventory line. */
export function ensureListItem(suitcase, label, { cubeId = null } = {}) {
  const trimmed = String(label || '').trim();
  if (!trimmed) return null;
  const existing = (suitcase.items || []).find((i) => itemKey(i.label) === itemKey(trimmed));
  if (existing) return existing;
  return addItem(suitcase, trimmed, { cubeId });
}

/** Keep the first occurrence of each item id — outfits share rows, they do not clone them. */
export function uniqueItemsById(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function removeItem(suitcase, itemId) {
  const before = suitcase.items.length;
  suitcase.items = suitcase.items.filter((i) => i.id !== itemId);
  if (suitcase.items.length === before) return false;
  pruneOutfitItems(suitcase);
  return true;
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
  pruneOutfitItems(suitcase);
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
 * Group the list by cube for the "By cube" view: trip outfits as cube-like
 * groups first (not real cubes — never pc_cubes), then attached cubes in
 * suitcase order (kept even when empty, so Organize has drop targets), then
 * each add-on as its own group titled "Parent - Add-on". Items assigned to a
 * no-longer-attached cube grouped under it too, unsorted last.
 *
 * An item in an outfit also sits in its cube/add-on group when filed
 * (By cube). Pass `{ exclusive: true }` for List: each item id appears in
 * one group — first outfit that owns it, otherwise its cube/add-on,
 * otherwise Unsorted.
 *
 * Unsorted items that only belong to an outfit stay under that outfit —
 * they do not also appear in Unsorted.
 *
 * Blank add-ons (no template items) always show, like empty cubes.
 * Pass `{ includeEmptyAddOns: true }` in Organize so unused seeded add-ons
 * still appear as filing targets.
 */
export function groupedItems(suitcase, cubesById, { includeEmptyAddOns = false, exclusive = false } = {}) {
  const groups = [];
  const byKey = new Map();
  const ensure = (key, title, meta = {}) => {
    if (!byKey.has(key)) {
      const g = {
        key,
        title,
        items: [],
        cubeId: meta.cubeId || null,
        addOnId: meta.addOnId || null,
        outfitId: meta.outfitId || null,
      };
      byKey.set(key, g);
      groups.push(g);
    }
    return byKey.get(key);
  };

  const items = uniqueItemsById(suitcase.items);
  const byId = new Map(items.map((i) => [i.id, i]));
  const outfitItemIds = new Set();

  for (const outfit of suitcase.outfits || []) {
    if (!outfit || !outfit.id) continue;
    const group = ensure(outfitGroupKey(outfit.id), outfit.name || 'Outfit', { outfitId: outfit.id });
    for (const id of outfit.itemIds || []) {
      const item = byId.get(id);
      if (!item || group.items.some((row) => row.id === item.id)) continue;
      if (exclusive && outfitItemIds.has(item.id)) continue;
      group.items.push(item);
      outfitItemIds.add(item.id);
    }
  }

  const addCubeGroups = (cubeId) => {
    const cube = cubesById?.get?.(cubeId);
    ensure(cubeId, cube?.title || cubeId, { cubeId });
    for (const addOn of cubeAddOns(cube)) {
      const hasItems = items.some((i) => i.cubeId === cubeId && i.addOnId === addOn.id);
      if (includeEmptyAddOns || hasItems || !addOnHasTemplateItems(addOn)) {
        ensure(addonGroupKey(cubeId, addOn.id), addOnLabel(cube || { id: cubeId }, addOn), {
          cubeId,
          addOnId: addOn.id,
        });
      }
    }
  };

  for (const cubeId of suitcase.cubeIds) addCubeGroups(cubeId);

  const unsorted = [];
  for (const item of items) {
    if (!item.cubeId) {
      if (!outfitItemIds.has(item.id)) unsorted.push(item);
    } else if (exclusive && outfitItemIds.has(item.id)) {
      continue;
    } else if (item.addOnId) {
      const cube = cubesById?.get?.(item.cubeId);
      const addOn = cubeAddOns(cube).find((a) => a.id === item.addOnId);
      const group = ensure(
        addonGroupKey(item.cubeId, item.addOnId),
        addOn ? addOnLabel(cube || { id: item.cubeId }, addOn) : addOnLabel({ title: cube?.title || item.cubeId }, { title: item.addOnId }),
        { cubeId: item.cubeId, addOnId: item.addOnId },
      );
      if (!group.items.some((row) => row.id === item.id)) group.items.push(item);
    } else {
      const group = ensure(item.cubeId, cubesById?.get?.(item.cubeId)?.title || item.cubeId, { cubeId: item.cubeId });
      if (!group.items.some((row) => row.id === item.id)) group.items.push(item);
    }
  }
  if (unsorted.length) {
    const g = ensure(UNSORTED_KEY, 'Unsorted');
    g.items = unsorted;
  }
  if (!exclusive) return groups;
  const outfits = groups.filter((g) => g.outfitId);
  const rest = groups.filter((g) => !g.outfitId);
  outfits.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  return [...outfits, ...rest];
}

/** First outfit on this trip that owns the item, if any. */
export function firstOutfitForItem(suitcase, itemId) {
  if (!itemId) return null;
  for (const outfit of suitcase.outfits || []) {
    if ((outfit.itemIds || []).includes(itemId)) return outfit;
  }
  return null;
}

/**
 * Condensed List membership: cube (or add-on) first, else the first outfit,
 * else unsorted. Used for sort order and the row chip — not section headers.
 */
export function listItemMembership(item, suitcase, cubesById) {
  if (item?.cubeId) {
    const cube = cubesById?.get?.(item.cubeId);
    let label;
    if (item.addOnId) {
      const addOn = cubeAddOns(cube).find((a) => a.id === item.addOnId);
      label = addOn
        ? addOnLabel(cube || { id: item.cubeId, title: item.cubeId }, addOn)
        : addOnLabel({ title: cube?.title || item.cubeId }, { title: item.addOnId });
    } else {
      label = cube?.title || item.cubeId;
    }
    return { kind: 'cube', label, sort: `0\t${String(label).toLowerCase()}\t${itemKey(item.label)}` };
  }
  const outfit = firstOutfitForItem(suitcase, item?.id);
  if (outfit) {
    const label = outfit.name || 'Outfit';
    return { kind: 'outfit', label, sort: `1\t${String(label).toLowerCase()}\t${itemKey(item.label)}` };
  }
  return { kind: 'unsorted', label: '', sort: `2\t${itemKey(item?.label)}` };
}

/**
 * List view rows: one row per item id, cube items first (A–Z cube, then
 * label), then outfit-only items, Unsorted last.
 */
export function sortedListItems(suitcase, cubesById) {
  return uniqueItemsById(suitcase?.items).slice().sort((a, b) => {
    const ma = listItemMembership(a, suitcase, cubesById);
    const mb = listItemMembership(b, suitcase, cubesById);
    return ma.sort.localeCompare(mb.sort);
  });
}

/** Count of items still unassigned — drives the Organize affordance. */
export function unsortedCount(suitcase) {
  return suitcase.items.filter((i) => !i.cubeId).length;
}

// ---------------------------------------------------------------------------
// Calendar days (beta) + trip outfits (main-line)
// Days are YYYY-MM-DD identities. The discarded numbered-day draft
// ({ id, n } / item.dayIds / outfit.dayId) is dropped in normalizeSuitcase.
// ---------------------------------------------------------------------------

function ensureDayCollections(suitcase) {
  if (!Array.isArray(suitcase.days)) suitcase.days = [];
  if (!Array.isArray(suitcase.outfits)) suitcase.outfits = [];
  if (!Array.isArray(suitcase.items)) suitcase.items = [];
}

function pruneOutfitItems(suitcase) {
  const known = new Set((suitcase.items || []).map((i) => i.id));
  for (const outfit of suitcase.outfits || []) {
    outfit.itemIds = (outfit.itemIds || []).filter((id) => known.has(id));
  }
}

function hasDay(suitcase, date) {
  return (suitcase.days || []).some((d) => d.date === date);
}

export function addDay(suitcase, date) {
  ensureDayCollections(suitcase);
  if (!isIsoDate(date)) return false;
  if (hasDay(suitcase, date)) return false;
  if (suitcase.days.length >= MAX_DAYS) return false;
  suitcase.days.push({ date });
  suitcase.days.sort((a, b) => a.date.localeCompare(b.date));
  return true;
}

export function removeDay(suitcase, date) {
  ensureDayCollections(suitcase);
  const before = suitcase.days.length;
  suitcase.days = suitcase.days.filter((d) => d.date !== date);
  if (suitcase.days.length === before) return false;
  for (const item of suitcase.items) {
    if (Array.isArray(item.dates)) item.dates = item.dates.filter((d) => d !== date);
  }
  for (const outfit of suitcase.outfits) {
    if (outfit.date === date) outfit.date = null;
  }
  return true;
}

export function setTripDates(suitcase, { startDate = null, endDate = null } = {}) {
  ensureDayCollections(suitcase);
  suitcase.startDate = isIsoDate(startDate) ? startDate : null;
  suitcase.endDate = isIsoDate(endDate) && (!suitcase.startDate || endDate >= suitcase.startDate)
    ? endDate
    : null;
  let added = 0;
  if (suitcase.startDate && suitcase.endDate) {
    for (const date of datesInRange(suitcase.startDate, suitcase.endDate)) {
      if (addDay(suitcase, date)) added += 1;
    }
  }
  return added;
}

export function assignItemDate(suitcase, itemId, date, on) {
  ensureDayCollections(suitcase);
  const item = suitcase.items.find((i) => i.id === itemId);
  if (!item || !isIsoDate(date) || !hasDay(suitcase, date)) return false;
  if (!Array.isArray(item.dates)) item.dates = [];
  const has = item.dates.includes(date);
  if (on && !has) {
    item.dates.push(date);
    item.dates.sort();
    return true;
  }
  if (!on && has) {
    item.dates = item.dates.filter((d) => d !== date);
    return true;
  }
  return false;
}

export function itemsForDate(suitcase, date) {
  return (suitcase.items || []).filter((i) => (i.dates || []).includes(date));
}

export function unassignedDateItems(suitcase) {
  return (suitcase.items || []).filter((i) => !(i.dates || []).length);
}

export function outfitsForDate(suitcase, date) {
  return (suitcase.outfits || []).filter((o) => o.date === date);
}

export function addOutfit(suitcase, { name, event = '', date = null, itemIds = [] } = {}) {
  ensureDayCollections(suitcase);
  const title = String(name || '').trim().slice(0, MAX_OUTFIT_NAME);
  if (!title) return null;
  if (suitcase.outfits.length >= MAX_OUTFITS) return null;
  const outfit = {
    id: newId(),
    name: title,
    event: String(event || '').trim().slice(0, MAX_OUTFIT_NAME),
    date: isIsoDate(date) && hasDay(suitcase, date) ? date : null,
    itemIds: [],
  };
  suitcase.outfits.push(outfit);
  setOutfitItems(suitcase, outfit.id, itemIds);
  return outfit;
}

export function updateOutfit(suitcase, outfitId, patch = {}) {
  const outfit = (suitcase.outfits || []).find((o) => o.id === outfitId);
  if (!outfit) return false;
  if (patch.name != null) {
    const title = String(patch.name).trim().slice(0, MAX_OUTFIT_NAME);
    if (!title) return false;
    outfit.name = title;
  }
  if (patch.event != null) outfit.event = String(patch.event).trim().slice(0, MAX_OUTFIT_NAME);
  if (Object.prototype.hasOwnProperty.call(patch, 'date')) {
    setOutfitDate(suitcase, outfitId, patch.date);
  }
  if (patch.itemIds) setOutfitItems(suitcase, outfitId, patch.itemIds);
  return true;
}

export function removeOutfit(suitcase, outfitId) {
  const before = (suitcase.outfits || []).length;
  suitcase.outfits = (suitcase.outfits || []).filter((o) => o.id !== outfitId);
  return suitcase.outfits.length !== before;
}

export function setOutfitItems(suitcase, outfitId, itemIds) {
  const outfit = (suitcase.outfits || []).find((o) => o.id === outfitId);
  if (!outfit) return false;
  const known = new Set((suitcase.items || []).map((i) => i.id));
  const next = [];
  const seen = new Set();
  for (const id of Array.isArray(itemIds) ? itemIds : []) {
    if (!id || seen.has(id) || !known.has(id)) continue;
    if (next.length >= MAX_OUTFIT_ITEMS) break;
    seen.add(id);
    next.push(id);
  }
  outfit.itemIds = next;
  return true;
}

export function setOutfitDate(suitcase, outfitId, date) {
  const outfit = (suitcase.outfits || []).find((o) => o.id === outfitId);
  if (!outfit) return false;
  // Date is optional. Empty / invalid / unknown day → null. Never invent a date.
  outfit.date = isIsoDate(date) && hasDay(suitcase, date) ? date : null;
  return true;
}

/**
 * Add a label to the trip list (reuse an existing row by name) and attach it
 * to this outfit. Does not invent a date.
 */
export function addItemToOutfit(suitcase, outfitId, label) {
  const item = ensureListItem(suitcase, label);
  if (!item) return null;
  const outfit = (suitcase.outfits || []).find((o) => o.id === outfitId);
  if (!outfit) return item;
  if (!outfit.itemIds.includes(item.id) && outfit.itemIds.length < MAX_OUTFIT_ITEMS) {
    outfit.itemIds.push(item.id);
  }
  return item;
}

export function searchPastOutfits(suitcases, currentId, query) {
  const q = String(query || '').trim().toLowerCase();
  const hits = [];
  for (const suitcase of Array.isArray(suitcases) ? suitcases : []) {
    if (!suitcase || suitcase.id === currentId) continue;
    for (const outfit of suitcase.outfits || []) {
      const labels = (outfit.itemIds || []).map((id) => {
        const item = (suitcase.items || []).find((i) => i.id === id);
        return item?.label || '';
      }).filter(Boolean);
      const haystack = [outfit.name, outfit.event, suitcase.name, ...labels].join(' ').toLowerCase();
      if (q && !haystack.includes(q)) continue;
      hits.push({
        suitcaseId: suitcase.id,
        suitcaseName: suitcase.name || '',
        outfitId: outfit.id,
        name: outfit.name,
        event: outfit.event || '',
        labels,
      });
    }
  }
  return hits;
}

export function copyOutfit(fromSuitcase, outfit, toSuitcase, { addMissing = false } = {}) {
  if (!fromSuitcase || !outfit || !toSuitcase) return null;
  const labels = (outfit.itemIds || []).map((id) => {
    const item = (fromSuitcase.items || []).find((i) => i.id === id);
    return item?.label || '';
  }).filter(Boolean);
  const itemIds = [];
  for (const label of labels) {
    const existing = (toSuitcase.items || []).find((i) => itemKey(i.label) === itemKey(label));
    if (existing) {
      itemIds.push(existing.id);
    } else if (addMissing) {
      const added = addItem(toSuitcase, label);
      if (added) itemIds.push(added.id);
    }
  }
  return addOutfit(toSuitcase, {
    name: outfit.name,
    event: outfit.event || '',
    itemIds,
  });
}
