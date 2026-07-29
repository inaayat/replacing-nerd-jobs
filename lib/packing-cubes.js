import { db, ensureSchema } from './db.js';

const REQUIRED_ITEM_COUNT = 2;
const MAX_ITEMS = 200;
const MAX_TITLE = 120;
const MAX_BLURB = 300;
const MAX_TAGS = 10;
const MAX_TAG_LEN = 30;
const MAX_ITEM_LABEL = 200;

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
  if (!Array.isArray(cube.items) || cube.items.length < REQUIRED_ITEM_COUNT) {
    return `Add at least ${REQUIRED_ITEM_COUNT} items.`;
  }
  if (cube.items.length > MAX_ITEMS) return `Cubes are capped at ${MAX_ITEMS} items.`;
  for (const item of cube.items) {
    if (!item || typeof item.label !== 'string' || !item.label.trim()) {
      return 'Every item needs a label.';
    }
    if (item.label.length > MAX_ITEM_LABEL) {
      return `Item labels must be under ${MAX_ITEM_LABEL} characters.`;
    }
  }
  return null;
}

export function normalizeCubeInput(cube, { fallbackId } = {}) {
  const id = cube.id && String(cube.id).trim()
    ? slugify(cube.id)
    : slugify(fallbackId || cube.title);
  return {
    id,
    title: String(cube.title || '').trim(),
    blurb: String(cube.blurb || '').trim(),
    tags: Array.isArray(cube.tags)
      ? cube.tags.map((t) => String(t).trim()).filter(Boolean)
      : [],
    items: (cube.items || []).map((item) => ({ label: String(item.label).trim() })),
  };
}

export function cubeFromRow(row, { viewerId } = {}) {
  return {
    id: row.id,
    title: row.title,
    blurb: row.blurb || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    items: Array.isArray(row.items) ? row.items : [],
    is_public: !!row.is_public,
    github_pr_url: row.github_pr_url || null,
    published_at: row.published_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    owner_id: row.user_id,
    mine: viewerId ? row.user_id === viewerId : false,
    source: 'db',
  };
}

export async function listVisibleCubes(userId) {
  await ensureSchema();
  const rows = await db()`
    SELECT id, user_id, title, blurb, tags, items, is_public,
           github_pr_url, published_at, created_at, updated_at
    FROM pc_cubes
    WHERE user_id = ${userId} OR is_public = true
    ORDER BY
      CASE WHEN user_id = ${userId} THEN 0 ELSE 1 END,
      updated_at DESC
  `;
  return rows.map((row) => cubeFromRow(row, { viewerId: userId }));
}

export async function getCube(id, userId) {
  await ensureSchema();
  const rows = await db()`
    SELECT id, user_id, title, blurb, tags, items, is_public,
           github_pr_url, published_at, created_at, updated_at
    FROM pc_cubes
    WHERE id = ${id} AND (user_id = ${userId} OR is_public = true)
    LIMIT 1
  `;
  return rows[0] ? cubeFromRow(rows[0], { viewerId: userId }) : null;
}

export async function getOwnedCube(id, userId) {
  await ensureSchema();
  const rows = await db()`
    SELECT id, user_id, title, blurb, tags, items, is_public,
           github_pr_url, published_at, created_at, updated_at
    FROM pc_cubes
    WHERE id = ${id} AND user_id = ${userId}
    LIMIT 1
  `;
  return rows[0] ? cubeFromRow(rows[0], { viewerId: userId }) : null;
}

export async function insertCube(userId, cube) {
  await ensureSchema();
  const rows = await db()`
    INSERT INTO pc_cubes (id, user_id, title, blurb, tags, items)
    VALUES (
      ${cube.id}, ${userId}, ${cube.title}, ${cube.blurb},
      ${JSON.stringify(cube.tags)}, ${JSON.stringify(cube.items)}
    )
    RETURNING id, user_id, title, blurb, tags, items, is_public,
              github_pr_url, published_at, created_at, updated_at
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
        updated_at = now()
    WHERE id = ${cube.id} AND user_id = ${userId}
    RETURNING id, user_id, title, blurb, tags, items, is_public,
              github_pr_url, published_at, created_at, updated_at
  `;
  return rows[0] ? cubeFromRow(rows[0], { viewerId: userId }) : null;
}

export async function markCubePublic(userId, id, { prUrl } = {}) {
  await ensureSchema();
  const rows = await db()`
    UPDATE pc_cubes
    SET is_public = true,
        github_pr_url = ${prUrl || null},
        published_at = COALESCE(published_at, now()),
        updated_at = now()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id, user_id, title, blurb, tags, items, is_public,
              github_pr_url, published_at, created_at, updated_at
  `;
  return rows[0] ? cubeFromRow(rows[0], { viewerId: userId }) : null;
}

export async function deleteOwnedCube(userId, id) {
  await ensureSchema();
  const rows = await db()`
    DELETE FROM pc_cubes
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING id, is_public
  `;
  return rows[0] || null;
}

export async function getSuitcaseState(userId) {
  await ensureSchema();
  const rows = await db()`
    SELECT active_suitcase_id, suitcases, updated_at
    FROM pc_suitcase_state
    WHERE user_id = ${userId}
    LIMIT 1
  `;
  if (!rows[0]) return { activeSuitcaseId: null, suitcases: [] };
  return {
    activeSuitcaseId: rows[0].active_suitcase_id || null,
    suitcases: Array.isArray(rows[0].suitcases) ? rows[0].suitcases : [],
    updated_at: rows[0].updated_at,
  };
}

export async function putSuitcaseState(userId, state) {
  await ensureSchema();
  const suitcases = Array.isArray(state.suitcases) ? state.suitcases : [];
  const activeSuitcaseId = state.activeSuitcaseId || (suitcases[0] && suitcases[0].id) || null;
  await db()`
    INSERT INTO pc_suitcase_state (user_id, active_suitcase_id, suitcases, updated_at)
    VALUES (${userId}, ${activeSuitcaseId}, ${JSON.stringify(suitcases)}, now())
    ON CONFLICT (user_id) DO UPDATE
      SET active_suitcase_id = EXCLUDED.active_suitcase_id,
          suitcases = EXCLUDED.suitcases,
          updated_at = now()
  `;
  return { activeSuitcaseId, suitcases };
}
