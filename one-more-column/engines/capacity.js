/**
 * Pure capacity engine: allocate plan item hours to assignee weeks.
 */
import { formatWeekKey, weekStart } from './availability.js';
import { deriveEffortHours } from './effort.js';

/**
 * @param {object[]} planItems
 * @param {'due'|'spread'} mode
 * @param {object} policy
 * @returns {Map<string, Map<string, number>>} resourceId → weekKey → load hours
 */
export function computeWeeklyLoad(planItems, mode = 'due', policy = {}, granularity = 'week') {
  const matrix = new Map();
  const dayMode = granularity === 'day';

  for (const item of planItems || []) {
    const assignees = item.assignee_ids?.length ? item.assignee_ids : [];
    if (!assignees.length) continue;

    const work = Number(item.work_hours || 0);
    const review = Number(item.review_hours || 0);
    const { total_hours: totalHours } = deriveEffortHours(work, review, policy);

    if (totalHours <= 0) continue;

    const dueKey = item.due_week
      ? dayMode
        ? formatWeekKey(item.due_week)
        : formatWeekKey(weekStart(item.due_week))
      : null;
    if (!dueKey) continue;

    const perPerson = totalHours / assignees.length;
    const targetKeys =
      mode === 'spread'
        ? dayMode
          ? spreadDays(dueKey, Number(policy.spread_lag_weeks ?? 0))
          : spreadWeeks(dueKey, Number(policy.spread_lag_weeks ?? 0))
        : [dueKey];

    const perPeriod = perPerson / targetKeys.length;
    for (const assigneeId of assignees) {
      if (!matrix.has(assigneeId)) matrix.set(assigneeId, new Map());
      const weekMap = matrix.get(assigneeId);
      for (const key of targetKeys) {
        weekMap.set(key, (weekMap.get(key) || 0) + perPeriod);
      }
    }
  }

  return matrix;
}

function spreadDays(dueDay, lagWeeks) {
  const days = [];
  const base = new Date(`${formatWeekKey(dueDay)}T00:00:00.000Z`);
  const span = Math.max(0, Number(lagWeeks) || 0) * 7;
  for (let i = span; i >= 0; i -= 1) {
    const d = new Date(base.getTime());
    d.setUTCDate(d.getUTCDate() - i);
    days.push(formatWeekKey(d));
  }
  return days.length ? days : [formatWeekKey(base)];
}

function spreadWeeks(dueWeek, lagWeeks) {
  const weeks = [];
  const base = weekStart(dueWeek);
  const startLag = Math.max(0, lagWeeks);
  for (let i = startLag; i >= 0; i -= 1) {
    const d = new Date(base.getTime());
    d.setUTCDate(d.getUTCDate() - i * 7);
    weeks.push(formatWeekKey(d));
  }
  return weeks.length ? weeks : [formatWeekKey(base)];
}

/**
 * Merge capacity and load into a person-week grid.
 */
export function buildCapacityGrid({
  resources,
  weeks,
  capacityMatrix,
  loadMatrix,
  policy = {},
}) {
  const threshold = Number(policy.overload_threshold ?? 1.0);
  const yellowRemaining = Number(policy.band_yellow_remaining ?? 8);
  const redRemaining = Number(policy.band_red_remaining ?? 0);
  const rows = [];

  for (const resource of resources) {
    if (resource.active === false) continue;
    const capacityWeeks = capacityMatrix.get(resource.id) || new Map();
    const loadWeeks = loadMatrix.get(resource.id) || new Map();
    const weekCells = weeks.map((weekKey) => {
      const capacity = round(capacityWeeks.get(weekKey) ?? 0);
      const load = round(loadWeeks.get(weekKey) ?? 0);
      const remaining = round(capacity - load);
      const utilization = capacity > 0 ? load / capacity : load > 0 ? Infinity : 0;
      const overloaded = capacity > 0 ? utilization > threshold : load > 0;
      const band = classifyBand(remaining, overloaded, yellowRemaining, redRemaining);
      return {
        week: weekKey,
        capacity,
        load,
        remaining,
        utilization: round(utilization),
        overloaded,
        band,
      };
    });

    rows.push({
      resource_id: resource.id,
      name: resource.name,
      team: resource.team,
      weeks: weekCells,
      totals: {
        capacity: round(weekCells.reduce((s, c) => s + c.capacity, 0)),
        load: round(weekCells.reduce((s, c) => s + c.load, 0)),
        remaining: round(weekCells.reduce((s, c) => s + c.remaining, 0)),
      },
    });
  }

  return { weeks, rows, mode: 'due', threshold, bands: { yellowRemaining, redRemaining } };
}

function classifyBand(remaining, overloaded, yellowRemaining, redRemaining) {
  if (overloaded || remaining <= redRemaining) return 'red';
  if (remaining <= yellowRemaining) return 'yellow';
  return 'green';
}

function round(n) {
  return Math.round(n * 100) / 100;
}
