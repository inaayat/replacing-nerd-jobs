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
 * Slot the pointer is over in a 2D grid. Matches dnd-kit rectSortingStrategy:
 * a box that contains the point wins, otherwise the closest center. Uses every
 * slot including the dragged item's original cell so first/last/across-row
 * drops work, and does not exclude the moving tile (that made live reorders
 * oscillate). `rects` must be frozen at drag start — live boxes after
 * insertBefore shift under the finger.
 */
export function wantDragInsertIndex(rects, x, y) {
  const boxes = Array.isArray(rects) ? rects : [];
  const n = boxes.length;
  if (n === 0) return 0;
  const px = Number(x);
  const py = Number(y);
  let inside = -1;
  let insideDist = Infinity;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    const r = boxes[i] || {};
    const left = Number(r.left) || 0;
    const top = Number(r.top) || 0;
    const width = Number(r.width) || 0;
    const height = Number(r.height) || 0;
    const cx = left + width / 2;
    const cy = top + height / 2;
    const dx = px - cx;
    const dy = py - cy;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
    if (px >= left && px <= left + width && py >= top && py <= top + height && dist <= insideDist) {
      inside = i;
      insideDist = dist;
    }
  }
  return inside >= 0 ? inside : best;
}

/** Move the item at `from` to `to` (both 0..n-1). */
export function wantReorderItems(list, from, to) {
  const items = Array.isArray(list) ? list.slice() : [];
  const n = items.length;
  if (!n) return items;
  const start = Math.max(0, Math.min(n - 1, Number(from)));
  const end = Math.max(0, Math.min(n - 1, Number(to)));
  if (!Number.isInteger(start) || !Number.isInteger(end) || start === end) return items;
  const next = items.slice();
  const [item] = next.splice(start, 1);
  next.splice(end, 0, item);
  return next;
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
