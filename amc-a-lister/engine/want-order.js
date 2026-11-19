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
