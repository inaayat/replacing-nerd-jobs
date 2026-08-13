/**
 * Pull headline FY numbers out of an SEC Company Facts payload.
 * Browser-safe ESM (no node: imports) — used by the API and by tests.
 *
 * A 10-K restates several years, all with the same `fy` (the filing year).
 * We key off the period `end` date, not `fy`. A tag whose latest annual
 * point is many years older than revenue (Amazon GrossProfit = 2009) is
 * treated as missing for the current headline set — not as a current zero.
 */
import { METRICS, DERIVED } from './catalog.js';

const ANNUAL_FORMS = new Set(['10-K', '10-K/A']);
const MIN_ANNUAL_DAYS = 300;

function yearOf(iso) {
  if (!iso || iso.length < 4) return null;
  const y = Number(iso.slice(0, 4));
  return Number.isInteger(y) ? y : null;
}

function daySpan(start, end) {
  if (!start || !end) return null;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (b - a) / 86400000;
}

function preferredUnit(def, unit) {
  if (def.unit === 'USD') return unit === 'USD';
  if (def.unit === 'USD/shares') return unit === 'USD/shares';
  if (def.unit === 'shares') return unit === 'shares';
  return true;
}

function collectPoints(facts, def) {
  const out = [];
  const taxonomies = facts?.facts || {};
  for (const cand of def.candidates) {
    const node = taxonomies[cand.taxonomy]?.[cand.tag];
    if (!node?.units) continue;
    for (const [unit, pts] of Object.entries(node.units)) {
      if (!preferredUnit(def, unit)) continue;
      if (!Array.isArray(pts)) continue;
      for (const p of pts) {
        if (!ANNUAL_FORMS.has(p.form) || p.fp !== 'FY') continue;
        const endYear = yearOf(p.end);
        if (endYear == null) continue;
        if (def.kind === 'duration') {
          const days = daySpan(p.start, p.end);
          if (days == null || days < MIN_ANNUAL_DAYS) continue;
        }
        out.push({
          val: p.val,
          unit,
          start: p.start || null,
          end: p.end,
          fy: p.fy ?? null,
          fp: p.fp,
          form: p.form,
          filed: p.filed || null,
          frame: p.frame || null,
          tag: cand.tag,
          taxonomy: cand.taxonomy,
        });
      }
    }
  }
  return out;
}

function scorePoint(p, targetYear) {
  let score = 0;
  if (p.form === '10-K') score += 4;
  if (p.form === '10-K/A') score += 3;
  if (targetYear && p.frame === `CY${targetYear}`) score += 2;
  if (targetYear && p.frame === `CY${targetYear}Q4I`) score += 2;
  if (p.filed) score += 0.001 * Date.parse(p.filed);
  return score;
}

function pickForYear(points, targetYear) {
  const pool = points.filter((p) => yearOf(p.end) === targetYear);
  if (!pool.length) return null;
  pool.sort((a, b) => scorePoint(b, targetYear) - scorePoint(a, targetYear));
  return pool[0];
}

function inferAsOfYear(facts) {
  const revenue = METRICS.find((m) => m.key === 'revenue');
  const ni = METRICS.find((m) => m.key === 'net_income');
  const ends = [
    ...collectPoints(facts, revenue).map((p) => p.end),
    ...collectPoints(facts, ni).map((p) => p.end),
  ];
  let best = null;
  for (const end of ends) {
    if (!best || end > best) best = end;
  }
  return best ? yearOf(best) : null;
}

export function extractHeadlines(facts) {
  const asOfYear = inferAsOfYear(facts);
  const metrics = {};
  for (const def of METRICS) {
    const points = collectPoints(facts, def);
    metrics[def.key] = asOfYear == null ? null : pickForYear(points, asOfYear);
  }
  const revenuePoints = collectPoints(facts, METRICS.find((m) => m.key === 'revenue'));
  const priorRevenue = asOfYear == null ? null : pickForYear(revenuePoints, asOfYear - 1);
  const ratios = computeRatios(metrics, priorRevenue);
  return {
    cik: facts?.cik ?? null,
    entityName: facts?.entityName ?? null,
    asOfYear,
    metrics,
    priorRevenue,
    ratios,
  };
}

function val(metrics, key) {
  const p = metrics[key];
  return p && typeof p.val === 'number' && Number.isFinite(p.val) ? p.val : null;
}

export function computeRatios(metrics, priorRevenue) {
  const out = {};
  const rev = val(metrics, 'revenue');
  const gp = val(metrics, 'gross_profit');
  const oi = val(metrics, 'operating_income');
  const ni = val(metrics, 'net_income');
  const assets = val(metrics, 'assets');
  const equity = val(metrics, 'equity');
  const debt = val(metrics, 'long_term_debt');
  const cfo = val(metrics, 'cfo');
  const capex = val(metrics, 'capex');
  const rd = val(metrics, 'rd');
  const shares = val(metrics, 'shares_out');
  const rec = val(metrics, 'receivables');
  const prior = priorRevenue && typeof priorRevenue.val === 'number' ? priorRevenue.val : null;

  out.gross_margin = gp != null && rev ? gp / rev : null;
  out.operating_margin = oi != null && rev ? oi / rev : null;
  out.net_margin = ni != null && rev ? ni / rev : null;
  out.roa = ni != null && assets ? ni / assets : null;
  out.roe = ni != null && equity ? ni / equity : null;
  out.debt_equity = debt != null && equity ? debt / equity : null;
  out.debt_assets = debt != null && assets ? debt / assets : null;
  out.rd_intensity = rd != null && rev ? rd / rev : null;
  // CapEx is almost always a positive cash outflow in Company Facts.
  // If a filer stores it as a negative outflow, adding it is equivalent.
  out.fcf = cfo != null && capex != null ? (capex < 0 ? cfo + capex : cfo - capex) : null;
  out.fcf_margin = out.fcf != null && rev ? out.fcf / rev : null;
  out.cash_conversion = cfo != null && ni ? cfo / ni : null;
  out.capex_intensity = capex != null && rev ? Math.abs(capex) / rev : null;
  out.asset_turnover = rev != null && assets ? rev / assets : null;
  out.leverage = assets != null && equity ? assets / equity : null;
  out.book_value_ps = equity != null && shares ? equity / shares : null;
  out.receivables_days = rec != null && rev ? (365 * rec) / rev : null;
  out.revenue_yoy = rev != null && prior ? rev / prior - 1 : null;
  return out;
}

/** Fill derived ratios on a snapshot/API row so older snapshots pick up new formulas. */
export function ensureRatios(headlines) {
  if (!headlines?.metrics) return headlines;
  return {
    ...headlines,
    ratios: computeRatios(headlines.metrics, headlines.priorRevenue),
  };
}

export function formatUsd(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatShares(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(abs / 1e6).toFixed(1)}M`;
  return abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function formatEps(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function formatPercent(n, signed = false) {
  if (n == null || !Number.isFinite(n)) return null;
  const pct = (Math.abs(n) * 100).toFixed(1) + '%';
  if (!signed) return `${n < 0 ? '−' : ''}${pct}`;
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${pct}`;
}

export function formatRatio(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 10) return `${sign}${abs.toFixed(1)}×`;
  return `${sign}${abs.toFixed(2)}×`;
}

export function formatDays(n) {
  if (n == null || !Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  return `${sign}${abs.toFixed(0)} days`;
}

export function formatMetric(def, point) {
  if (!point || typeof point.val !== 'number') return null;
  if (def.unit === 'USD/shares') return formatEps(point.val);
  if (def.unit === 'shares') return formatShares(point.val);
  return formatUsd(point.val);
}

export function formatDerived(def, value) {
  if (value == null || !Number.isFinite(value)) return null;
  if (def.format === 'percent') return formatPercent(value, Boolean(def.signed));
  if (def.format === 'ratio') return formatRatio(value);
  if (def.format === 'usd') return formatUsd(value);
  if (def.format === 'per_share') return formatEps(value);
  if (def.format === 'days') return formatDays(value);
  return String(value);
}

export { METRICS, DERIVED };
