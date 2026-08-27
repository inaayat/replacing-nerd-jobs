import { db, ensureSchema } from './db.js';
import { normalizePrefs } from '../packing-cubes/engine/model.js';

const MAX_ITEMS = 200;
const MAX_TITLE = 120;
const MAX_BLURB = 300;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 30;
const MAX_ITEM_LABEL = 200;
const MAX_ADD_ONS = 20;
const MAX_ADD_ON_TITLE = 80;

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function validateCube(cube) {
  if (!cube || typeof cube !== 'object') return 'Missing cube object.';
  if (!cube.title || !String(cube.title).trim()) return 'Title is required.';
  if (String(cube.title).length > MAX_TITLE) return `Title must be under ${MAX_TITLE} characters.`;
  if (cube.blurb && String(cube.blurb).length > MAX_BLURB) {
    return `Blurb must be under ${MAX_BLURB} characters.`;
  }
  if (cube.tags) {
    if (!Array.isArray(cube.tags)) return 'Tags must be a list.';
    if (cube.tags.length > MAX_TAGS) return `Cubes are capped at ${MAX_TAGS} tags.`;
    for (const tag of cube.tags) {
      if (typeof tag !== 'string' || tag.length > MAX_TAG_LEN) {
        return `Each tag must be under ${MAX_TAG_LEN} characters.`;
      }
    }
  }
  // Empty cubes are valid: you name a group first, then file list items into it.
  if (cube.items != null && !Array.isArray(cube.items)) return 'Items must be a list.';
  const items = Array.isArray(cube.items) ? cube.items : [];
  if (items.length > MAX_ITEMS) return `Cubes are capped at ${MAX_ITEMS} items.`;
  const itemsError = validateItemList(items);
  if (itemsError) return itemsError;

  if (cube.addOns != null) {
    if (!Array.isArray(cube.addOns)) return 'Add-ons must be a list.';
    if (cube.addOns.length > MAX_ADD_ONS) return `Cubes are capped at ${MAX_ADD_ONS} add-ons.`;
    for (const addOn of cube.addOns) {
      if (!addOn || typeof addOn !== 'object') return 'Each add-on must be an object.';
      if (!addOn.title || !String(addOn.title).trim()) return 'Every add-on needs a title.';
      if (String(addOn.title).length > MAX_ADD_ON_TITLE) {
        return `Add-on titles must be under ${MAX_ADD_ON_TITLE} characters.`;
      }
      // Empty add-ons are valid: name the bucket first, file items later.
      if (addOn.items != null && !Array.isArray(addOn.items)) {
        return `Add-on "${addOn.title}" items must be a list.`;
      }
      const addOnItems = Array.isArray(addOn.items) ? addOn.items : [];
      if (addOnItems.length > MAX_ITEMS) {
        return `Add-ons are capped at ${MAX_ITEMS} items.`;
      }
      const addOnItemsError = validateItemList(addOnItems);
      if (addOnItemsError) return addOnItemsError;
    }
  }
  return null;
}

function itemLabelOf(item) {
  if (typeof item === 'string') return item.trim();
  return item && typeof item.label === 'string' ? item.label.trim() : '';
}

function validateItemList(items) {
  for (const item of items) {
    const label = itemLabelOf(item);
    if (!label) return 'Every item needs a label.';
    if (label.length > MAX_ITEM_LABEL) {
      return `Item labels must be under ${MAX_ITEM_LABEL} characters.`;
    }
  }
  return null;
}

export function normalizeCubeInput(cube, { fallbackId } = {}) {
  const id = cube.id && String(cube.id).trim()
    ? slugify(cube.id)
    : slugify(fallbackId || cube.title);
  const seenAddOnIds = new Set();
  return {
    id,
    title: String(cube.title || '').trim(),
    blurb: String(cube.blurb || '').trim(),
    tags: Array.isArray(cube.tags)
      ? cube.tags.map((t) => String(t).trim()).filter(Boolean)
      : [],
    items: (cube.items || []).map((item) => ({ label: itemLabelOf(item) })).filter((i) => i.label),
    includeByDefault: !!cube.includeByDefault,
    addOns: (Array.isArray(cube.addOns) ? cube.addOns : []).map((addOn) => {
      const title = String(addOn.title || '').trim();
      let addOnId = addOn.id && String(addOn.id).trim() ? slugify(addOn.id) : slugify(title);
      while (seenAddOnIds.has(addOnId)) addOnId = `${addOnId}-2`;
      seenAddOnIds.add(addOnId);
      return {
        id: addOnId,
        title,
        items: (addOn.items || []).map((item) => ({ label: itemLabelOf(item) })).filter((i) => i.label),
        includeByDefault: !!addOn.includeByDefault,
      };
    }),
  };
}

export function cubeFromRow(row, { viewerId } = {}) {
  return {
    id: row.id,
    title: row.title,
    blurb: row.blurb || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    items: Array.isArray(row.items) ? row.items : [],
    addOns: Array.isArray(row.add_ons) ? row.add_ons : [],
    includeByDefault: !!row.include_by_default,
    created_at: row.created_at,
    updated_at: row.updated_at,
    mine: viewerId ? row.user_id === viewerId : false,
    source: 'db',
  };
}

/** Cubes are private to their owner: there is no shared catalog. */
export async function listOwnCubes(userId) {
  await ensureSchema();
  const rows = await db()`
    SELECT id, user_id, title, blurb, tags, items, add_ons, include_by_default, created_at, updated_at
    FROM pc_cubes
    WHERE user_id = ${userId}
    ORDER BY title ASC
  `;
  return rows.map((row) => cubeFromRow(row, { viewerId: userId }));
}

export async function getCube(id, userId) {
  await ensureSchema();
  const rows = await db()`
    SELECT id, user_id, title, blurb, tags, items, add_ons, include_by_default, created_at, updated_at
    FROM pc_cubes
    WHERE id = ${id} AND user_id = ${userId}
    LIMIT 1
  `;
  return rows[0] ? cubeFromRow(rows[0], { viewerId: userId }) : null;
}

/**
 * Cube ids are slugs derived from the title and never shown to the user, but
 * `pc_cubes.id` is a global primary key — so two people naming a cube
 * "Toiletries" would collide. Pick the first free `slug`, `slug-2`, `slug-3`…
 * given the ids already taken (by anyone).
 */
export function nextFreeId(baseId, takenIds) {
  const taken = takenIds instanceof Set ? takenIds : new Set(takenIds || []);
  if (!baseId) return '';
  if (!taken.has(baseId)) return baseId;
  for (let n = 2; n < 500; n += 1) {
    const candidate = `${baseId}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${baseId}-${Date.now().toString(36)}`;
}

/** Ids already used by any user for `base` or `base-N`, for nextFreeId(). */
export async function takenCubeIds(baseId) {
  await ensureSchema();
  const rows = await db()`
    SELECT id FROM pc_cubes
    WHERE id = ${baseId} OR id LIKE ${`${baseId}-%`}
  `;
  return new Set(rows.map((row) => row.id));
}

export async function insertCube(userId, cube) {
  await ensureSchema();
  const rows = await db()`
    INSERT INTO pc_cubes (id, user_id, title, blurb, tags, items, add_ons, include_by_default)
    VALUES (
      ${cube.id}, ${userId}, ${cube.title}, ${cube.blurb},
      ${JSON.stringify(cube.tags)}, ${JSON.stringify(cube.items)},
      ${JSON.stringify(cube.addOns || [])}, ${!!cube.includeByDefault}
    )
    RETURNING id, user_id, title, blurb, tags, items, add_ons, include_by_default, created_at, updated_at
  `;
  return cubeFromRow(rows[0], { viewerId: userId });
}

export async function updateOwnedCube(userId, cube) {
  await ensureSchema();
  const rows = await db()`
    UPDATE pc_cubes
    SET title = ${cube.title},
        blurb = ${cube.blurb},
        tags = ${JSON.stringify(cube.tags)},
        items = ${JSON.stringify(cube.items)},
        add_ons = ${JSON.stringify(cube.addOns || [])},
        include_by_default = ${!!cube.includeByDefault},
        updated_at = now()
    WHERE id = ${cube.id} AND user_id = ${userId}
    RETURNING id, user_id, title, blurb, tags, items, add_ons, include_by_default, created_at, updated_at
  `;
  return rows[0] ? cubeFromRow(rows[0], { viewerId: userId }) : null;
}

export async function deleteOwnedCube(userId, id) {
  await ensureSchema();
  const rows = await db()`
    DELETE FROM pc_cubes
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id
  `;
  return rows[0] || null;
}

export async function getSuitcaseState(userId) {
  await ensureSchema();
  const rows = await db()`
    SELECT active_suitcase_id, suitcases, prefs, updated_at
    FROM pc_suitcase_state
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  if (!rows[0]) return { activeSuitcaseId: null, suitcases: [], prefs: normalizePrefs(null) };
  const prefs = rows[0].prefs && typeof rows[0].prefs === 'object' ? rows[0].prefs : {};
  return {
    activeSuitcaseId: rows[0].active_suitcase_id || null,
    suitcases: Array.isArray(rows[0].suitcases) ? rows[0].suitcases : [],
    prefs: normalizePrefs(prefs),
    updated_at: rows[0].updated_at,
  };
}

export async function putSuitcaseState(userId, state) {
  await ensureSchema();
  const suitcases = Array.isArray(state.suitcases) ? state.suitcases : [];
  const activeSuitcaseId = state.activeSuitcaseId || (suitcases[0] && suitcases[0].id) || null;
  const prefs = normalizePrefs(state.prefs);
  await db()`
    INSERT INTO pc_suitcase_state (user_id, active_suitcase_id, suitcases, prefs, updated_at)
    VALUES (${userId}, ${activeSuitcaseId}, ${JSON.stringify(suitcases)}, ${JSON.stringify(prefs)}, now())
    ON CONFLICT (user_id) DO UPDATE
      SET active_suitcase_id = EXCLUDED.active_suitcase_id,
          suitcases = EXCLUDED.suitcases,
          prefs = EXCLUDED.prefs,
          updated_at = now()
  `;
  return { activeSuitcaseId, suitcases, prefs };
}
