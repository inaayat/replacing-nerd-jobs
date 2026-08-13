/** Roll up week-keyed capacity cells into calendar months. */

export function monthKey(isoDate) {
  return String(isoDate).slice(0, 7);
}

export function formatMonthLabel(monthKeyStr) {
  const [year, month] = monthKeyStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * @param {{ weeks: string[], rows: object[] }} grid — weekly capacity grid
 * @returns same shape with month buckets
 */
export function rollupGridToMonths(grid) {
  const monthOrder = [];
  const monthSet = new Set();

  for (const weekKey of grid.weeks || []) {
    const mk = monthKey(weekKey);
    if (!monthSet.has(mk)) {
      monthSet.add(mk);
      monthOrder.push(mk);
    }
  }

  const rows = (grid.rows || []).map((row) => {
    const buckets = new Map();
    for (const cell of row.weeks || []) {
      const mk = monthKey(cell.week);
      if (!buckets.has(mk)) {
        buckets.set(mk, { capacity: 0, load: 0, remaining: 0, overloaded: false, band: 'green' });
      }
      const bucket = buckets.get(mk);
      bucket.capacity += cell.capacity || 0;
      bucket.load += cell.load || 0;
      bucket.remaining += cell.remaining || 0;
      if (cell.overloaded || cell.band === 'red') bucket.overloaded = true;
      if (cell.band === 'yellow' && bucket.band !== 'red') bucket.band = 'yellow';
      if (cell.band === 'red') bucket.band = 'red';
    }

    const weekCells = monthOrder.map((mk) => {
      const bucket = buckets.get(mk) || { capacity: 0, load: 0, remaining: 0, overloaded: false, band: 'green' };
      const capacity = round(bucket.capacity);
      const load = round(bucket.load);
      const remaining = round(capacity - load);
      const utilization = capacity > 0 ? load / capacity : load > 0 ? Infinity : 0;
      return {
        week: mk,
        capacity,
        load,
        remaining,
        utilization: round(utilization),
        overloaded: bucket.overloaded || remaining < 0,
        band: bucket.band,
      };
    });

    return {
      ...row,
      weeks: weekCells,
      totals: {
        capacity: round(weekCells.reduce((s, c) => s + c.capacity, 0)),
        load: round(weekCells.reduce((s, c) => s + c.load, 0)),
        remaining: round(weekCells.reduce((s, c) => s + c.remaining, 0)),
      },
    };
  });

  return {
    ...grid,
    weeks: monthOrder,
    rows,
    granularity: 'month',
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}
