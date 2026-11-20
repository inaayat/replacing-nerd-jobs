/**
 * Want-list priority: ranked titles first (user drag order), unranked last.
 * Used by Watch at Home movies and the TV want list. In-theater Watch order
 * does not read these helpers.
 */

export function isWantRanked(item) {
  if (item == null || item.priority == null || item.priority === '') return false;
  return Number.isFinite(Number(item.priority));
}

export function sortByWantPriority(items, legacySorted) {
  const list = Array.isArray(items) ? items.slice() : [];
  const legacy = Array.isArray(legacySorted) ? legacySorted : list;
  const index = new Map(legacy.map((item, i) => [String(item.id), i]));
  const cmpLegacy = (a, b) => (index.get(String(a.id)) ?? 0) - (index.get(String(b.id)) ?? 0);
  const ranked = list.filter(isWantRanked).sort((a, b) => {
    const delta = Number(a.priority) - Number(b.priority);
    return delta || cmpLegacy(a, b);
  });
  const unranked = list.filter((item) => !isWantRanked(item)).sort(cmpLegacy);
  return [...ranked, ...unranked];
}

/**
 * After a drag, `visualItems` is the new on-screen order of this list.
 * Dragging ranks the moved item. Other unranked titles stay at the bottom
 * unless they sit above the drop. Dragging a ranked title below every other
 * ranked title clears its priority (choose not to rank).
 */
export function applyWantDragOrder(visualItems, draggedId) {
  const visual = Array.isArray(visualItems) ? visualItems : [];
  const dragIndex = visual.findIndex((item) => String(item.id) === String(draggedId));
  if (dragIndex < 0) return visual.map((item) => ({ ...item }));

  const dragged = visual[dragIndex];
  const wasRanked = isWantRanked(dragged);

  let lastOtherRanked = -1;
  visual.forEach((item, i) => {
    if (String(item.id) === String(draggedId)) return;
    if (isWantRanked(item)) lastOtherRanked = i;
  });

  let rankThrough;
  if (wasRanked && dragIndex > lastOtherRanked) {
    rankThrough = lastOtherRanked;
  } else {
    rankThrough = Math.max(dragIndex, lastOtherRanked);
  }

  return visual.map((item, i) => ({
    ...item,
    priority: i <= rankThrough ? i : null,
  }));
}

export function mergeWantPriorities(allItems, orderedItems) {
  const next = new Map(
    (orderedItems || []).map((item) => [String(item.id), isWantRanked(item) ? Number(item.priority) : null]),
  );
  return (allItems || []).map((item) => (
    next.has(String(item.id)) ? { ...item, priority: next.get(String(item.id)) } : item
  ));
}

export function wantRanksPayload(items) {
  return (items || []).map((item) => ({
    id: item.id,
    priority: isWantRanked(item) ? Number(item.priority) : null,
  }));
}

/**
 * New index for the moving tile from pointer/touch coordinates vs each
 * tile's box. Uses centers (not pointerenter) so captured touch still
 * reorders when the finger is over the dragged preview.
 *
 * `rects` is current DOM order. Returns the index the moving item should
 * occupy (0..n-1) in that list after the move.
 */
export function wantDragInsertIndex(rects, movingIndex, x, y) {
  const boxes = Array.isArray(rects) ? rects : [];
  const n = boxes.length;
  if (n === 0) return 0;
  const from = Number(movingIndex);
  if (!Number.isInteger(from) || from < 0 || from >= n) return 0;

  const others = [];
  for (let i = 0; i < n; i++) {
    if (i === from) continue;
    others.push(boxes[i]);
  }

  let slot = others.length;
  for (let i = 0; i < others.length; i++) {
    const r = others[i] || {};
    const left = Number(r.left) || 0;
    const top = Number(r.top) || 0;
    const width = Number(r.width) || 0;
    const height = Number(r.height) || 0;
    const cx = left + width / 2;
    const cy = top + height / 2;
    const sameRow = y >= top && y <= top + height;
    if (y < cy || (sameRow && x < cx)) {
      slot = i;
      break;
    }
  }
  return slot;
}

export function normalizeWantRanks(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const ranks = [];
  for (const row of raw) {
    const id = String(row?.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (row.priority == null || row.priority === '') {
      ranks.push({ id, priority: null });
      continue;
    }
    const priority = Number(row.priority);
    if (!Number.isInteger(priority) || priority < 0) continue;
    ranks.push({ id, priority });
  }
  return ranks;
}
