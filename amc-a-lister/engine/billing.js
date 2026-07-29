/** Calendar-month billing helpers (period starts on the 1st). */

export const DEFAULT_PRICE_TIERS = [
  { effective_on: '2018-06-01', cents: 2495 },
  { effective_on: '2025-05-01', cents: 2799 },
  { effective_on: '2026-07-15', cents: 2999 },
];

export function chargeMonth(dateInput) {
  const d = parseDate(dateInput);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function lastDayOfChargeMonth(chargeMonthStr) {
  const year = Number(chargeMonthStr.slice(0, 4));
  const month = Number(chargeMonthStr.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function normalizePriceTiers(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  return raw
    .map((tier) => ({
      effective_on: String(tier.effective_on || '').slice(0, 10),
      cents: Math.round(Number(tier.cents)),
    }))
    .filter((tier) => tier.effective_on && tier.cents > 0)
    .sort((a, b) => a.effective_on.localeCompare(b.effective_on));
}

export function tiersFromLegacy(membership) {
  const tiers = [{ effective_on: '2018-06-01', cents: membership.standard_cents || 2495 }];
  if (membership.price_bump_on) {
    tiers.push({
      effective_on: String(membership.price_bump_on).slice(0, 10),
      cents: membership.current_cents || 2799,
    });
  }
  return tiers.sort((a, b) => a.effective_on.localeCompare(b.effective_on));
}

export function membershipPriceTiers(membership) {
  const normalized = normalizePriceTiers(membership?.price_tiers);
  if (normalized?.length) return normalized;
  if (membership?.standard_cents != null) return tiersFromLegacy(membership);
  return DEFAULT_PRICE_TIERS;
}

export function monthlyRateForMonth(chargeMonthStr, membership) {
  const tiers = membershipPriceTiers(membership);
  const monthEnd = lastDayOfChargeMonth(chargeMonthStr);
  let chosen = tiers[0];
  for (const tier of tiers) {
    if (tier.effective_on <= monthEnd) chosen = tier;
    else break;
  }
  return chosen.cents;
}

export function monthlyBillForMonth(chargeMonthStr, membership, sortedChargeMonths) {
  const months = sortedChargeMonths.length
    ? sortedChargeMonths
    : [chargeMonthStr];
  const isFirst = months[0] === chargeMonthStr;
  if (isFirst) return membership.promo_cents;
  return monthlyRateForMonth(chargeMonthStr, membership);
}

export function distinctChargeMonths(watches) {
  const set = new Set(watches.map((w) => chargeMonth(w.watched_on)));
  return [...set].sort();
}

export function billingChargeMonths(watches, asOfInput = new Date()) {
  const watchMonths = distinctChargeMonths(watches);
  if (!watchMonths.length) return [];

  const asOfIso = asOfInput instanceof Date
    ? asOfInput.toISOString().slice(0, 10)
    : String(asOfInput).slice(0, 10);
  const endMonth = chargeMonth(asOfIso);
  const firstMonth = watchMonths[0];
  if (endMonth.localeCompare(firstMonth) < 0) return [...watchMonths];

  return enumerateChargeMonths(firstMonth, endMonth);
}

function enumerateChargeMonths(startMonth, endMonth) {
  const months = [];
  let year = Number(startMonth.slice(0, 4));
  let month = Number(startMonth.slice(5, 7));
  const endYear = Number(endMonth.slice(0, 4));
  const endMonthNum = Number(endMonth.slice(5, 7));

  while (year < endYear || (year === endYear && month <= endMonthNum)) {
    months.push(`${year}-${String(month).padStart(2, '0')}-01`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export function computeSummary(watches, membership, options = {}) {
  const months = billingChargeMonths(watches, options.asOf);
  const totalBilled = months.reduce(
    (sum, m) => sum + monthlyBillForMonth(m, membership, months),
    0,
  );
  const totalCharged = watches.reduce((sum, w) => sum + (w.ticket_cents || 0), 0);
  const totalSeen = watches.length;
  const totalSavings = totalCharged - totalBilled;
  const costPerMovie = totalSeen ? totalBilled / totalSeen : 0;
  const avgTicket = totalSeen ? totalCharged / totalSeen : 0;
  const withRuntime = watches.filter((w) => w.runtime_min > 0);
  const avgRuntimeMin = withRuntime.length
    ? Math.round(withRuntime.reduce((sum, w) => sum + w.runtime_min, 0) / withRuntime.length)
    : 0;

  const byMonthMap = new Map();
  for (const m of months) {
    byMonthMap.set(m, { month: m, movies: 0, charged: 0 });
  }
  for (const w of watches) {
    const m = chargeMonth(w.watched_on);
    if (!byMonthMap.has(m)) continue;
    const row = byMonthMap.get(m);
    row.movies += 1;
    row.charged += w.ticket_cents || 0;
  }

  const byMonth = [...byMonthMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, row]) => {
      const bill = monthlyBillForMonth(row.month, membership, months);
      return {
        month: row.month,
        movies: row.movies,
        charged: row.charged,
        bill,
        savings: row.charged - bill,
      };
    });

  const currentMonth = chargeMonth(new Date().toISOString().slice(0, 10));
  const currentWatches = watches.filter((w) => chargeMonth(w.watched_on) === currentMonth);
  const currentCharged = currentWatches.reduce((s, w) => s + (w.ticket_cents || 0), 0);
  const currentBill = monthlyBillForMonth(currentMonth, membership, months);
  const breakEvenTickets = Math.max(0, Math.ceil((currentBill - currentCharged) / 15));

  return {
    totalBilled,
    totalCharged,
    totalSavings,
    totalSeen,
    costPerMovie,
    avgTicket,
    avgRuntimeMin,
    byMonth,
    currentPeriod: {
      month: currentMonth,
      movies: currentWatches.length,
      charged: currentCharged,
      bill: currentBill,
      savings: currentCharged - currentBill,
      breakEvenTickets,
    },
  };
}

export function theaterStats(watches) {
  const map = new Map();
  for (const w of watches) {
    const loc = (w.location || 'Unknown').trim() || 'Unknown';
    if (!map.has(loc)) map.set(loc, { location: loc, count: 0, charged: 0 });
    const row = map.get(loc);
    row.count += 1;
    row.charged += w.ticket_cents || 0;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function formatStats(watches) {
  const map = new Map();
  for (const w of watches) {
    const fmt = (w.format || 'Standard').trim() || 'Standard';
    if (!map.has(fmt)) map.set(fmt, { format: fmt, count: 0, charged: 0 });
    const row = map.get(fmt);
    row.count += 1;
    row.charged += w.ticket_cents || 0;
  }
  return [...map.values()].sort((a, b) => b.charged - a.charged);
}

export function rewatchList(watches) {
  const byKey = new Map();
  for (const w of watches) {
    const key = w.tmdb_id ? `tmdb:${w.tmdb_id}` : `title:${w.title.toLowerCase()}`;
    if (!byKey.has(key)) byKey.set(key, { title: w.title, tmdb_id: w.tmdb_id, count: 0, dates: [] });
    const row = byKey.get(key);
    row.count += 1;
    row.dates.push(w.watched_on);
  }
  return [...byKey.values()]
    .filter((r) => r.count > 1)
    .sort((a, b) => b.count - a.count);
}

export function ratingDistribution(watches) {
  const rated = watches.filter((w) => !w.dnf && w.rating != null);
  const dnfCount = watches.filter((w) => w.dnf).length;
  const buckets = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const w of rated) {
    const bucket = Math.min(5, Math.max(1, Math.round(w.rating)));
    buckets[bucket] += 1;
  }
  return { buckets, rated: rated.length, dnf: dnfCount, total: watches.length };
}

function parseDate(input) {
  if (input instanceof Date) return input;
  const s = String(input).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
