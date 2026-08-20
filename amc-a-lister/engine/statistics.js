const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function buildTheaterStats(watches) {
  return groupedWatchStats(watches, {
    keyFor: (watch) => normalizeGroup(watch.location, 'Unknown theater'),
    labelFor: (watch) => cleanLabel(watch.location, 'Unknown theater'),
    exclude: (watch) => /N\/A/i.test(String(watch.location || '')),
  }).map((row) => ({ ...row, location: row.label }));
}

export function buildFormatStats(watches) {
  return groupedWatchStats(watches, {
    keyFor: (watch) => normalizeGroup(watch.format, 'Standard'),
    labelFor: (watch) => cleanLabel(watch.format, 'Standard'),
  }).map((row) => ({ ...row, format: row.label }));
}

export function buildDayStats(watches) {
  const rows = DAY_NAMES.map((day, dayIndex) => ({
    day,
    dayIndex,
    count: 0,
    ratingSum: 0,
    ratedCount: 0,
  }));

  for (const watch of watches) {
    const dayIndex = dayIndexFor(watch.watched_on);
    if (dayIndex == null) continue;
    const row = rows[dayIndex];
    row.count += 1;
    if (hasRating(watch)) {
      row.ratingSum += Number(watch.rating);
      row.ratedCount += 1;
    }
  }

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return rows
    .filter((row) => row.count > 0)
    .map((row) => ({
      day: row.day,
      dayIndex: row.dayIndex,
      count: row.count,
      share: total ? row.count / total : 0,
      avgRating: average(row.ratingSum, row.ratedCount),
    }))
    .sort((a, b) => b.count - a.count || a.dayIndex - b.dayIndex);
}

export function buildHabitStats(watches) {
  const uniqueTitles = new Set();
  let totalRuntimeMin = 0;
  let runtimeCount = 0;
  let soloCount = 0;
  let weekendCount = 0;

  for (const watch of watches) {
    uniqueTitles.add(movieKey(watch));
    if (Number(watch.runtime_min) > 0) {
      totalRuntimeMin += Number(watch.runtime_min);
      runtimeCount += 1;
    }
    if (watch.saw_alone) soloCount += 1;
    const day = dayIndexFor(watch.watched_on);
    if (day === 0 || day === 6) weekendCount += 1;
  }

  const total = watches.length;
  const repeatScreenings = Math.max(0, total - uniqueTitles.size);
  return {
    total,
    totalRuntimeMin,
    runtimeCount,
    soloCount,
    soloShare: total ? soloCount / total : 0,
    weekendCount,
    weekendShare: total ? weekendCount / total : 0,
    uniqueTitles: uniqueTitles.size,
    repeatScreenings,
    repeatShare: total ? repeatScreenings / total : 0,
  };
}

export function buildValueStats(summary = {}) {
  const months = Array.isArray(summary.byMonth) ? summary.byMonth : [];
  const positiveMonths = months.filter((month) => Number(month.savings) > 0);
  const activeMonths = months.filter((month) => Number(month.movies) > 0);
  const bestMonth = months.reduce(
    (best, month) => (!best || Number(month.savings) > Number(best.savings) ? month : best),
    null,
  );

  return {
    positiveMonths: positiveMonths.length,
    monthCount: months.length,
    activeMonths: activeMonths.length,
    positiveMonthShare: months.length ? positiveMonths.length / months.length : 0,
    avgVisitsPerActiveMonth: activeMonths.length
      ? activeMonths.reduce((sum, month) => sum + Number(month.movies || 0), 0) / activeMonths.length
      : 0,
    bestMonth,
  };
}

function groupedWatchStats(watches, { keyFor, labelFor, exclude = () => false }) {
  const map = new Map();
  for (const watch of watches) {
    if (exclude(watch)) continue;
    const key = keyFor(watch);
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: labelFor(watch),
        count: 0,
        charged: 0,
        pricedCount: 0,
        ratingSum: 0,
        ratedCount: 0,
      });
    }
    const row = map.get(key);
    row.count += 1;
    if (watch.ticket_cents != null && Number.isFinite(Number(watch.ticket_cents))) {
      row.charged += Number(watch.ticket_cents);
      row.pricedCount += 1;
    }
    if (hasRating(watch)) {
      row.ratingSum += Number(watch.rating);
      row.ratedCount += 1;
    }
  }

  const total = [...map.values()].reduce((sum, row) => sum + row.count, 0);
  return [...map.values()]
    .map((row) => ({
      key: row.key,
      label: row.label,
      count: row.count,
      share: total ? row.count / total : 0,
      charged: row.charged,
      pricedCount: row.pricedCount,
      avgTicket: row.pricedCount ? Math.round(row.charged / row.pricedCount) : null,
      ratedCount: row.ratedCount,
      avgRating: average(row.ratingSum, row.ratedCount),
    }))
    .sort((a, b) => b.count - a.count || b.charged - a.charged || a.label.localeCompare(b.label));
}

function cleanLabel(value, fallback) {
  return String(value || '').trim() || fallback;
}

function normalizeGroup(value, fallback) {
  return cleanLabel(value, fallback).toLowerCase().replace(/\s+/g, ' ');
}

function movieKey(watch) {
  if (watch.tmdb_id) return `tmdb:${watch.tmdb_id}`;
  return `title:${String(watch.title || '').trim().toLowerCase()}`;
}

function dayIndexFor(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date.getUTCDay();
}

function hasRating(watch) {
  return !watch.dnf && watch.rating != null && Number.isFinite(Number(watch.rating));
}

function average(sum, count) {
  return count ? Math.round((sum / count) * 10) / 10 : null;
}
