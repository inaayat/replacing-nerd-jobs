/**
 * Comparison insights for Fortune 500 × EDGAR.
 * Pure functions — used by the browser and by tests.
 *
 * Headline shape matches extract.js: metrics[key].val (USD) and
 * ratios[key] as fractions (0.108 = 10.8%), never already-multiplied percents.
 */
import { formatUsd, formatPercent } from './extract.js';

export function metricNumber(headlines, key) {
  const p = headlines?.metrics?.[key];
  return p && typeof p.val === 'number' && Number.isFinite(p.val) ? p.val : null;
}

export function ratioNumber(headlines, key) {
  const v = headlines?.ratios?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function nameOf(row) {
  return row?.company?.company || row?.company?.name || 'Unknown';
}

function fmtNx(n) {
  if (!Number.isFinite(n)) return '';
  if (n >= 10) return `${n.toFixed(0)}×`;
  if (n >= 2) return `${n.toFixed(1)}×`;
  return `${n.toFixed(2)}×`;
}

function usd(n) {
  return formatUsd(n) || '—';
}

function pct(n, signed = false) {
  return formatPercent(n, signed) || '—';
}

/**
 * Percentile of `value` among `pool` (higher = better unless invert).
 * Returns 0–100, or null if fewer than 8 peers have the metric.
 */
export function percentile(value, pool, invert = false) {
  if (value == null || !Number.isFinite(value) || !Array.isArray(pool)) return null;
  const nums = pool.filter((n) => typeof n === 'number' && Number.isFinite(n));
  if (nums.length < 8) return null;
  const below = nums.filter((n) => n < value).length;
  const equal = nums.filter((n) => n === value).length;
  const raw = ((below + equal * 0.5) / nums.length) * 100;
  const pctile = invert ? 100 - raw : raw;
  return Math.round(pctile);
}

export function poolFor(snapshotCompanies, source, key) {
  const out = [];
  if (!snapshotCompanies || typeof snapshotCompanies !== 'object') return out;
  for (const row of Object.values(snapshotCompanies)) {
    const v = source === 'ratio' ? ratioNumber(row, key) : metricNumber(row, key);
    if (v != null) out.push(v);
  }
  return out;
}

/**
 * Short sentences explaining what the comparison shows.
 * `rows` = [{ company, headlines }, ...] with at least 2 companies that have headlines.
 * `snapshotCompanies` is optional (cik → headline row) for percentile color.
 */
export function buildInsights(rows, snapshotCompanies) {
  const usable = (rows || []).filter((r) => r?.headlines && r.headlines.asOfYear);
  if (usable.length < 2) return [];

  const insights = [];
  const rev = usable
    .map((r) => ({ r, v: metricNumber(r.headlines, 'revenue') }))
    .filter((x) => x.v != null && x.v > 0)
    .sort((a, b) => b.v - a.v);

  if (rev.length >= 2) {
    const top = rev[0];
    const bot = rev[rev.length - 1];
    const ratio = top.v / bot.v;
    if (ratio >= 1.15) {
      insights.push(
        `${nameOf(top.r)} is the largest here at ${usd(top.v)} of revenue — ${fmtNx(ratio)} ${nameOf(bot.r)} (${usd(bot.v)}).`
      );
    } else {
      insights.push(
        `These companies are a similar size: ${nameOf(top.r)} ${usd(top.v)} vs ${nameOf(bot.r)} ${usd(bot.v)} of revenue.`
      );
    }
  }

  const nm = usable
    .map((r) => ({ r, v: ratioNumber(r.headlines, 'net_margin') }))
    .filter((x) => x.v != null)
    .sort((a, b) => b.v - a.v);
  if (nm.length >= 2) {
    const top = nm[0];
    const bot = nm[nm.length - 1];
    const gap = top.v - bot.v;
    if (Math.abs(gap) >= 0.01) {
      insights.push(
        `${nameOf(top.r)} keeps ${pct(top.v)} of each sales dollar (net margin); ${nameOf(bot.r)} keeps ${pct(bot.v)} — a ${pct(Math.abs(gap))} gap.`
      );
    }
  }

  const yoy = usable
    .map((r) => ({ r, v: ratioNumber(r.headlines, 'revenue_yoy') }))
    .filter((x) => x.v != null)
    .sort((a, b) => b.v - a.v);
  if (yoy.length >= 2) {
    const top = yoy[0];
    const growers = yoy.filter((x) => x.v > 0);
    const shrinkers = yoy.filter((x) => x.v < 0);
    if (shrinkers.length && growers.length) {
      const worst = shrinkers[shrinkers.length - 1];
      insights.push(
        `${nameOf(top.r)} grew ${pct(top.v, true)} while ${nameOf(worst.r)} shrank ${pct(worst.v, true)}.`
      );
    } else if (top.v >= 0.08) {
      insights.push(`${nameOf(top.r)} grew revenue fastest here, ${pct(top.v, true)} year over year.`);
    } else if (growers.length === yoy.length) {
      insights.push(`Every company here grew revenue; ${nameOf(top.r)} led at ${pct(top.v, true)} YoY.`);
    }
  }

  const roe = usable
    .map((r) => ({ r, v: ratioNumber(r.headlines, 'roe') }))
    .filter((x) => x.v != null)
    .sort((a, b) => b.v - a.v);
  if (roe.length >= 2 && roe[0].v - roe[roe.length - 1].v >= 0.05) {
    insights.push(
      `${nameOf(roe[0].r)} earns ${pct(roe[0].v)} on equity (ROE) vs ${pct(roe[roe.length - 1].v)} at ${nameOf(roe[roe.length - 1].r)}.`
    );
  }

  if (snapshotCompanies && rev.length) {
    const pool = poolFor(snapshotCompanies, 'metric', 'revenue');
    const pctile = percentile(rev[0].v, pool);
    if (pctile != null && pctile >= 90) {
      insights.push(
        `${nameOf(rev[0].r)}’s revenue sits in the ${pctile}th percentile of public Fortune 500 filers in this snapshot.`
      );
    }
  }

  const years = [...new Set(usable.map((r) => r.headlines.asOfYear))].sort();
  if (years.length > 1) {
    insights.push(
      `Fiscal years differ (${years.join(', ')}). Compare levels with that in mind — a 2024 10-K is not the same vintage as a 2025 one.`
    );
  }

  return insights.slice(0, 5);
}

export function similarByRevenue(company, catalog, snapshotCompanies, limit = 4) {
  const cik = String(company?.cik || '');
  const mine = metricNumber(snapshotCompanies?.[cik], 'revenue');
  if (mine == null || mine <= 0) return [];
  const scored = [];
  for (const row of catalog || []) {
    if (row.status !== 'matched' || String(row.cik) === cik) continue;
    const theirs = metricNumber(snapshotCompanies?.[String(row.cik)], 'revenue');
    if (theirs == null || theirs <= 0) continue;
    scored.push({
      company: row,
      revenue: theirs,
      dist: Math.abs(Math.log(theirs) - Math.log(mine)),
    });
  }
  scored.sort((a, b) => a.dist - b.dist);
  return scored.slice(0, limit);
}
