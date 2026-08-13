/**
 * Comparison insights for Fortune 500 × EDGAR.
 * Pure functions — used by the browser and by tests.
 *
 * Headline shape matches extract.js: metrics[key].val (USD) and
 * ratios[key] as fractions (0.108 = 10.8%) except `fcf` which is USD.
 * Never already-multiplied percents.
 */
import { METRICS, DERIVED, isPublic } from './catalog.js';
import { formatUsd, formatPercent } from './extract.js';

export function metricNumber(headlines, key) {
  const p = headlines?.metrics?.[key];
  return p && typeof p.val === 'number' && Number.isFinite(p.val) ? p.val : null;
}

export function ratioNumber(headlines, key) {
  const v = headlines?.ratios?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function valueFor(headlines, key, source) {
  return source === 'ratio' ? ratioNumber(headlines, key) : metricNumber(headlines, key);
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

function plausibleMargin(v) {
  return v != null && Number.isFinite(v) && v <= 1 && v >= -0.8;
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

export function coverageOf(headlines) {
  const tagged = [];
  const missing = [];
  for (const def of METRICS) {
    if (metricNumber(headlines, def.key) != null) tagged.push(def.key);
    else missing.push(def.key);
  }
  const derivedOk = [];
  const derivedSkip = [];
  for (const def of DERIVED) {
    if (ratioNumber(headlines, def.key) != null) derivedOk.push(def.key);
    else derivedSkip.push(def.key);
  }
  return {
    tagged,
    missing,
    derivedOk,
    derivedSkip,
    total: METRICS.length,
  };
}

export function coverageOverlap(rows) {
  const usable = (rows || []).filter((r) => r?.headlines);
  if (usable.length < 2) return { shared: [], split: [], none: METRICS.map((m) => m.key) };
  const sets = usable.map((r) => new Set(coverageOf(r.headlines).tagged));
  const shared = [];
  const split = [];
  const none = [];
  for (const def of METRICS) {
    const n = sets.filter((s) => s.has(def.key)).length;
    if (n === sets.length) shared.push(def.key);
    else if (n === 0) none.push(def.key);
    else split.push(def.key);
  }
  return { shared, split, none };
}

export function leadersFor(catalog, snapshotCompanies, key, source, n = 3, preferHigh = true) {
  const scored = [];
  for (const row of catalog || []) {
    if (!isPublic(row)) continue;
    const h = snapshotCompanies?.[String(row.cik)];
    let v = source === 'ratio' ? ratioNumber(h, key) : metricNumber(h, key);
    if (v == null) continue;
    if (key === 'net_margin' && !plausibleMargin(v)) continue;
    scored.push({ company: row, value: v });
  }
  scored.sort((a, b) => (preferHigh ? b.value - a.value : a.value - b.value));
  return scored.slice(0, n);
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
    .filter((x) => plausibleMargin(x.v))
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

  const cashPairs = usable
    .map((r) => ({
      r,
      ni: metricNumber(r.headlines, 'net_income'),
      cfo: metricNumber(r.headlines, 'cfo'),
    }))
    .filter((x) => x.ni != null && x.cfo != null);
  if (cashPairs.length >= 2) {
    const richest = [...cashPairs].sort((a, b) => b.cfo - b.ni - (a.cfo - a.ni))[0];
    const poorest = [...cashPairs].sort((a, b) => a.cfo - a.ni - (b.cfo - b.ni))[0];
    if (richest && poorest && richest.r !== poorest.r) {
      const richGap = richest.cfo - richest.ni;
      const poorGap = poorest.cfo - poorest.ni;
      if (Math.abs(richGap) >= 1e9 || Math.abs(poorGap) >= 1e9) {
        insights.push(
          `${nameOf(richest.r)}’s operations brought in ${usd(richest.cfo)} of cash vs ${usd(richest.ni)} of profit; ${nameOf(poorest.r)} had ${usd(poorest.cfo)} cash vs ${usd(poorest.ni)} profit. Cash and profit are different stories.`
        );
      }
    }
  }

  const rd = usable
    .map((r) => ({ r, v: ratioNumber(r.headlines, 'rd_intensity') }))
    .filter((x) => x.v != null && x.v > 0)
    .sort((a, b) => b.v - a.v);
  const rdMissing = usable.filter((r) => ratioNumber(r.headlines, 'rd_intensity') == null);
  if (rd.length >= 2) {
    insights.push(
      `${nameOf(rd[0].r)} spent ${pct(rd[0].v)} of sales on R&D; ${nameOf(rd[rd.length - 1].r)} spent ${pct(rd[rd.length - 1].v)}.`
    );
  } else if (rd.length === 1 && rdMissing.length) {
    insights.push(
      `${nameOf(rd[0].r)} tagged R&D (${pct(rd[0].v)} of sales). ${nameOf(rdMissing[0])} didn’t — that usually means a different business, not $0 of research.`
    );
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

  const overlap = coverageOverlap(usable);
  if (overlap.split.length) {
    const labels = overlap.split
      .slice(0, 3)
      .map((k) => METRICS.find((m) => m.key === k)?.label || k);
    insights.push(
      `Not every company tagged the same items. Split across this set: ${labels.join(', ')}${overlap.split.length > 3 ? '…' : ''}. A blank is “not in this 10-K,” not zero.`
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

  return insights.slice(0, 7);
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

/**
 * Ready-made compare sets that start from one company.
 * Returns [{ id, title, why, ranks }].
 */
export function suggestComparisons(company, catalog, snapshotCompanies, limit = 3) {
  const out = [];
  if (!company || !isPublic(company)) return out;
  const cik = String(company.cik);
  const mine = snapshotCompanies?.[cik];
  const similar = similarByRevenue(company, catalog, snapshotCompanies, 3);
  if (similar.length >= 2) {
    out.push({
      id: 'similar',
      title: 'Closest in sales',
      why: 'Public Fortune 500 companies with the most similar revenue. Size is the fairest first comparison.',
      ranks: [company.rank, ...similar.map((p) => p.company.rank)],
    });
  }

  const myMargin = ratioNumber(mine, 'net_margin');
  const myRev = metricNumber(mine, 'revenue');
  if (plausibleMargin(myMargin) && myRev > 0) {
    let best = null;
    for (const row of catalog || []) {
      if (row.rank === company.rank || !isPublic(row)) continue;
      const h = snapshotCompanies?.[String(row.cik)];
      const m = ratioNumber(h, 'net_margin');
      const r = metricNumber(h, 'revenue');
      if (!plausibleMargin(m) || r == null || r <= 0) continue;
      if (r < myRev / 5 || r > myRev * 5) continue;
      const gap = Math.abs(m - myMargin);
      if (!best || gap > best.gap) best = { row, gap, m };
    }
    if (best && best.gap >= 0.03) {
      out.push({
        id: 'margin-foil',
        title: `Vs ${best.row.company} on profit per dollar`,
        why: 'Similar-ish sales, very different net margin. That’s usually a business-model story, not a rounding error.',
        ranks: [company.rank, best.row.rank],
      });
    }
  }

  const myRd = metricNumber(mine, 'rd');
  if (myRd != null && myRd > 0) {
    const rdPeers = [];
    for (const row of catalog || []) {
      if (row.rank === company.rank || !isPublic(row)) continue;
      const h = snapshotCompanies?.[String(row.cik)];
      const rd = metricNumber(h, 'rd');
      const rev = metricNumber(h, 'revenue');
      if (rd == null || rd <= 0 || rev == null || rev <= 0) continue;
      rdPeers.push({ row, intensity: rd / rev });
    }
    rdPeers.sort((a, b) => b.intensity - a.intensity);
    const picks = rdPeers.slice(0, 3).map((p) => p.row.rank);
    if (picks.length >= 2) {
      out.push({
        id: 'rd',
        title: 'Other research spenders',
        why: 'R&D only shows up when a company tags it. These filers do — grocers and most insurers don’t.',
        ranks: [company.rank, ...picks].slice(0, 5),
      });
    }
  }

  return out.slice(0, limit);
}
