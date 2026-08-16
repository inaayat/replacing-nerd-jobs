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
import {
  EXTENDED_FILED_METRICS,
  EXTENDED_DERIVED,
  SERIES_ANNUAL_YEARS,
  SERIES_QUARTERLY_LIMIT,
  QUARTERLY_SERIES_KEYS,
} from './metric-packs.js';

const ANNUAL_FORMS = new Set(['10-K', '10-K/A', '20-F', '20-F/A']);
const QUARTER_FORMS = new Set(['10-Q', '10-Q/A']);
const MIN_ANNUAL_DAYS = 300;
const MIN_QUARTER_DAYS = 60;

export const ALL_FILED_METRICS = [...METRICS, ...EXTENDED_FILED_METRICS];
export const ALL_DERIVED = [...DERIVED, ...EXTENDED_DERIVED];
const ALL_FILED_BY_KEY = Object.fromEntries(ALL_FILED_METRICS.map((m) => [m.key, m]));
const ALL_DERIVED_BY_KEY = Object.fromEntries(ALL_DERIVED.map((m) => [m.key, m]));

/** Marker when total liabilities is computed as assets − equity. */
export const IMPLIED_LIABILITIES_TAG = 'Assets−Equity';

const LIABILITY_COMPONENT_KEYS = [
  'debt_current',
  'debt_noncurrent',
  'long_term_debt',
  'accounts_payable',
  'accrued_liabilities',
  'deferred_revenue_current',
  'deferred_revenue_noncurrent',
  'operating_lease_liability',
  'finance_lease_liability',
  'deposits',
];

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

const MONEY_UNITS = new Set(['USD', 'EUR', 'CHF', 'GBP', 'CAD', 'AUD', 'ILS']);

function preferredUnit(def, unit) {
  if (def.unit === 'USD') return MONEY_UNITS.has(unit);
  if (def.unit === 'USD/shares') return unit === 'USD/shares';
  if (def.unit === 'shares') return unit === 'shares';
  return true;
}

function collectPoints(facts, def, opts = {}) {
  const forms = opts.forms || ANNUAL_FORMS;
  const requireFp = opts.fp !== undefined ? opts.fp : 'FY';
  const minDays = opts.minDays ?? (def.kind === 'duration' ? MIN_ANNUAL_DAYS : null);
  const out = [];
  const taxonomies = facts?.facts || {};
  for (let i = 0; i < def.candidates.length; i++) {
    const cand = def.candidates[i];
    const node = taxonomies[cand.taxonomy]?.[cand.tag];
    if (!node?.units) continue;
    for (const [unit, pts] of Object.entries(node.units)) {
      if (!preferredUnit(def, unit)) continue;
      if (!Array.isArray(pts)) continue;
      for (const p of pts) {
        if (!forms.has(p.form)) continue;
        if (requireFp != null && p.fp !== requireFp) continue;
        const endYear = yearOf(p.end);
        if (endYear == null) continue;
        if (minDays != null && def.kind === 'duration') {
          const days = daySpan(p.start, p.end);
          if (days == null || days < minDays) continue;
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
          candidateIndex: i,
        });
      }
    }
  }
  return out;
}

function finiteVal(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function slimSeriesPoint(p, year) {
  return {
    year,
    val: p.val,
    end: p.end,
    start: p.start || null,
    tag: p.tag,
    taxonomy: p.taxonomy,
    form: p.form,
    filed: p.filed || null,
    fp: p.fp || null,
  };
}

function extractAnnualSeries(facts, defs, asOfYear) {
  if (asOfYear == null) return {};
  const out = {};
  for (const def of defs) {
    const points = collectPoints(facts, def);
    const rows = [];
    for (let y = asOfYear - SERIES_ANNUAL_YEARS + 1; y <= asOfYear; y += 1) {
      const p = pickForYear(points, y);
      if (p && finiteVal(p.val)) rows.push(slimSeriesPoint(p, y));
    }
    if (rows.length) out[def.key] = rows;
  }
  return out;
}

function extractQuarterlySeries(facts, asOfYear) {
  if (asOfYear == null) return {};
  const out = {};
  for (const key of QUARTERLY_SERIES_KEYS) {
    const def = ALL_FILED_BY_KEY[key];
    if (!def) continue;
    const points = collectPoints(facts, def, {
      forms: QUARTER_FORMS,
      fp: null,
      minDays: MIN_QUARTER_DAYS,
    }).filter((p) => p.fp && p.fp.startsWith('Q'));
    points.sort((a, b) => {
      if (a.end !== b.end) return a.end < b.end ? 1 : -1;
      return scorePoint(b, yearOf(b.end)) - scorePoint(a, yearOf(a.end));
    });
    const seen = new Set();
    const rows = [];
    for (const p of points) {
      const id = `${p.end}|${p.fp}`;
      if (seen.has(id) || !finiteVal(p.val)) continue;
      seen.add(id);
      rows.push(slimSeriesPoint(p, yearOf(p.end)));
      if (rows.length >= SERIES_QUARTERLY_LIMIT) break;
    }
    rows.reverse();
    if (rows.length) out[key] = rows;
  }
  return out;
}

function applyLeaseLiabilitySum(metrics) {
  const total = metrics.operating_lease_liability;
  if (total && finiteVal(total.val)) return;
  const cur = metrics.operating_lease_liability_current;
  const non = metrics.operating_lease_liability_noncurrent;
  const curV = cur && finiteVal(cur.val) ? cur.val : null;
  const nonV = non && finiteVal(non.val) ? non.val : null;
  if (curV == null && nonV == null) return;
  const src = curV != null && nonV != null ? cur : non || cur;
  metrics.operating_lease_liability = {
    ...src,
    val: (curV || 0) + (nonV || 0),
    tag:
      curV != null && nonV != null
        ? 'OperatingLeaseLiabilityCurrent+Noncurrent'
        : src.tag,
  };
}

function grossProfitPoint(revenue, cogs) {
  const r = revenue && finiteVal(revenue.val) ? revenue.val : null;
  const c = cogs && finiteVal(cogs.val) && cogs.val >= 0 ? cogs.val : null;
  if (r == null || c == null) return null;
  if (revenue.end && cogs.end && revenue.end !== cogs.end) return null;
  if (revenue.start && cogs.start && revenue.start !== cogs.start) return null;
  return {
    ...revenue,
    val: r - c,
    tag: DERIVED_GROSS_PROFIT_TAG,
    taxonomy: 'derived',
    derived: true,
    formula: 'revenue − cost of goods and services sold',
  };
}

function applyDerivedGrossProfit(metrics, seriesAnnual, priorMetrics) {
  if (!metrics) return;
  if (!(metrics.gross_profit && finiteVal(metrics.gross_profit.val))) {
    const derived = grossProfitPoint(metrics.revenue, metrics.cogs);
    if (derived) metrics.gross_profit = derived;
  }
  if (seriesAnnual) {
    const byYear = new Map(
      (seriesAnnual.gross_profit || []).filter((row) => finiteVal(row.val)).map((row) => [row.year, row])
    );
    const cogsByYear = new Map((seriesAnnual.cogs || []).map((row) => [row.year, row]));
    for (const revenue of seriesAnnual.revenue || []) {
      if (byYear.has(revenue.year)) continue;
      const derived = grossProfitPoint(revenue, cogsByYear.get(revenue.year));
      if (derived) byYear.set(revenue.year, { ...derived, year: revenue.year });
    }
    if (byYear.size) {
      seriesAnnual.gross_profit = [...byYear.values()].sort((a, b) => a.year - b.year);
    }
  }
  if (priorMetrics?.values && priorMetrics.values.gross_profit == null) {
    const revenue = priorMetrics.values.revenue;
    const cogs = priorMetrics.values.cogs;
    if (finiteVal(revenue) && finiteVal(cogs) && cogs >= 0) {
      priorMetrics.values.gross_profit = revenue - cogs;
    }
  }
}

function impliedLiabilityPoint(assets, equity) {
  const a = assets && finiteVal(assets.val) ? assets.val : null;
  const e = equity && finiteVal(equity.val) ? equity.val : null;
  if (a == null || e == null) return null;
  const src = assets.end ? assets : equity;
  return {
    val: a - e,
    unit: src.unit || 'USD',
    start: null,
    end: src.end || equity.end || null,
    fy: src.fy ?? null,
    fp: src.fp || 'FY',
    form: src.form || '10-K',
    filed: src.filed || equity.filed || null,
    frame: src.frame || null,
    tag: IMPLIED_LIABILITIES_TAG,
    taxonomy: 'derived',
    derived: true,
  };
}

/**
 * Many 10-Ks skip us-gaap:Liabilities and only tag the pieces. The complete
 * total is still assets − equity. Individual debt lines stay on their own keys.
 */
function applyImpliedLiabilities(metrics, seriesAnnual, priorMetrics) {
  if (!metrics) return;
  if (!(metrics.liabilities && finiteVal(metrics.liabilities.val))) {
    const implied = impliedLiabilityPoint(metrics.assets, metrics.equity);
    if (implied) metrics.liabilities = implied;
  }
  if (seriesAnnual) {
    const byYear = new Map();
    for (const row of seriesAnnual.liabilities || []) {
      if (finiteVal(row.val)) byYear.set(row.year, row);
    }
    const equityByYear = new Map((seriesAnnual.equity || []).map((row) => [row.year, row]));
    for (const assets of seriesAnnual.assets || []) {
      if (byYear.has(assets.year)) continue;
      const implied = impliedLiabilityPoint(assets, equityByYear.get(assets.year));
      if (implied) byYear.set(assets.year, { ...implied, year: assets.year });
    }
    if (byYear.size) {
      seriesAnnual.liabilities = [...byYear.values()].sort((a, b) => a.year - b.year);
    }
  }
  if (priorMetrics?.values && priorMetrics.values.liabilities == null) {
    const a = priorMetrics.values.assets;
    const e = priorMetrics.values.equity;
    if (typeof a === 'number' && Number.isFinite(a) && typeof e === 'number' && Number.isFinite(e)) {
      priorMetrics.values.liabilities = a - e;
    }
  }
}

/** Tagged liability pieces for the filings page. Not a complete roll-up. */
export function liabilityComponents(metrics) {
  const skipLongTerm = metrics?.debt_noncurrent && finiteVal(metrics.debt_noncurrent.val);
  const out = [];
  for (const key of LIABILITY_COMPONENT_KEYS) {
    if (key === 'long_term_debt' && skipLongTerm) continue;
    const point = metrics?.[key];
    if (!(point && finiteVal(point.val))) continue;
    const def = ALL_FILED_BY_KEY[key];
    out.push({ key, label: def?.label || key, val: point.val });
  }
  return out;
}

function scorePoint(p, targetYear) {
  let score = 0;
  if (p.form === '10-K' || p.form === '20-F') score += 4;
  if (p.form === '10-K/A' || p.form === '20-F/A') score += 3;
  if (p.unit === 'USD') score += 1;
  if (targetYear && p.frame === `CY${targetYear}`) score += 2;
  if (targetYear && p.frame === `CY${targetYear}Q4I`) score += 2;
  if (p.filed) score += 0.001 * Date.parse(p.filed);
  return score;
}

function pickForYear(points, targetYear) {
  const pool = points.filter((p) => yearOf(p.end) === targetYear);
  if (!pool.length) return null;
  // Candidate order is the catalog's "first hit wins" (Revenues before a
  // fee-revenue subtotal). Filed-date scoring is only a tiebreaker among
  // the same tag — mixing it in used to let a later-filed subtotal beat
  // total revenue and print 160%+ margins.
  pool.sort((a, b) => {
    const ai = a.candidateIndex ?? 99;
    const bi = b.candidateIndex ?? 99;
    if (ai !== bi) return ai - bi;
    return scorePoint(b, targetYear) - scorePoint(a, targetYear);
  });
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
  const priorValues = {};
  let priorRevenue = null;
  for (const def of ALL_FILED_METRICS) {
    const points = collectPoints(facts, def);
    metrics[def.key] = asOfYear == null ? null : pickForYear(points, asOfYear);
    const prior = asOfYear == null ? null : pickForYear(points, asOfYear - 1);
    if (def.key === 'revenue') priorRevenue = prior;
    if (prior && finiteVal(prior.val)) {
      priorValues[def.key] = prior.val;
    }
  }
  applyLeaseLiabilitySum(metrics);
  const priorMetrics =
    asOfYear != null && Object.keys(priorValues).length
      ? { year: asOfYear - 1, values: priorValues }
      : null;
  const seriesAnnual = extractAnnualSeries(facts, ALL_FILED_METRICS, asOfYear);
  if (seriesAnnual.operating_lease_liability == null && asOfYear != null) {
    const curRows = seriesAnnual.operating_lease_liability_current || [];
    const nonRows = seriesAnnual.operating_lease_liability_noncurrent || [];
    const byYear = new Map();
    for (const r of curRows) byYear.set(r.year, { ...r, val: r.val });
    for (const r of nonRows) {
      const prev = byYear.get(r.year);
      byYear.set(r.year, prev ? { ...r, val: prev.val + r.val, tag: 'OperatingLeaseLiabilityCurrent+Noncurrent' } : r);
    }
    if (byYear.size) seriesAnnual.operating_lease_liability = [...byYear.values()].sort((a, b) => a.year - b.year);
  }
  applyDerivedGrossProfit(metrics, seriesAnnual, priorMetrics);
  applyImpliedLiabilities(metrics, seriesAnnual, priorMetrics);
  normalizeMetrics(metrics, priorMetrics);
  const ratios = computeRatios(metrics, priorRevenue);
  return {
    cik: facts?.cik ?? null,
    entityName: facts?.entityName ?? null,
    asOfYear,
    metrics,
    priorRevenue,
    priorMetrics,
    ratios,
    flags: sanityFlags(metrics, ratios),
    seriesAnnual,
    seriesQuarterly: extractQuarterlySeries(facts, asOfYear),
  };
}

function val(metrics, key) {
  const p = metrics[key];
  return p && typeof p.val === 'number' && Number.isFinite(p.val) ? p.val : null;
}

/** Derived income-statement tag when gross profit is computed from revenue − COGS. */
export const DERIVED_GROSS_PROFIT_TAG = 'Revenue−COGS';

/** Derived income-statement tag when COGS is computed from revenue − gross profit. */
export const DERIVED_COGS_TAG = 'Revenue−GrossProfit';

/** Marker when interest-bearing debt is rolled up from current + noncurrent / legacy tags. */
export const DEBT_STOCK_TAG = 'DebtStock';

function hasDebtPiece(metrics) {
  return (
    val(metrics, 'debt_current') != null ||
    val(metrics, 'debt_noncurrent') != null ||
    val(metrics, 'long_term_debt') != null
  );
}

/**
 * Interest-bearing debt stock (P9): current + (noncurrent ?? legacy long-term).
 * When only the legacy long-term tag exists, that total is used as-is.
 */
export function debtStock(metrics) {
  if (!metrics || !hasDebtPiece(metrics)) return null;
  return (val(metrics, 'debt_current') ?? 0) + (val(metrics, 'debt_noncurrent') ?? val(metrics, 'long_term_debt') ?? 0);
}

/** @deprecated alias */
export const interestBearingDebt = debtStock;

/** Synthetic metric point for display (statement, information page). */
export function debtStockPoint(metrics) {
  const total = debtStock(metrics);
  if (total == null) return null;
  const cur = metrics.debt_current;
  const non = metrics.debt_noncurrent;
  const ltd = metrics.long_term_debt;
  const src = non || ltd || cur || null;
  let tag = DEBT_STOCK_TAG;
  if (cur && non) tag = `${cur.tag}+${non.tag}`;
  else if (cur && ltd && !non) tag = `${cur.tag}+${ltd.tag}`;
  else if (non) tag = non.tag;
  else if (ltd) tag = ltd.tag;
  else if (cur) tag = cur.tag;
  return {
    val: total,
    unit: src?.unit || 'USD',
    start: null,
    end: src?.end || cur?.end || non?.end || ltd?.end || null,
    fy: src?.fy ?? null,
    fp: src?.fp || 'FY',
    form: src?.form || '10-K',
    filed: src?.filed || null,
    frame: src?.frame || null,
    tag,
    taxonomy: tag === DEBT_STOCK_TAG ? 'derived' : src?.taxonomy || 'us-gaap',
    derived: true,
  };
}

function derivedPointFrom(source, valNum, tag) {
  return {
    val: valNum,
    unit: source?.unit || 'USD',
    start: source?.start ?? null,
    end: source?.end ?? null,
    fy: source?.fy ?? null,
    fp: source?.fp || 'FY',
    form: source?.form || '10-K',
    filed: source?.filed || null,
    frame: source?.frame || null,
    tag,
    taxonomy: 'derived',
    derived: true,
  };
}

/** Copy weighted-average diluted shares when period-end shares are absent. */
function applySharesFallback(metrics) {
  if (!metrics) return;
  if (metrics.shares_out && finiteVal(metrics.shares_out.val)) return;
  const wavg = metrics.shares_diluted_wavg;
  if (!(wavg && finiteVal(wavg.val))) return;
  metrics.shares_out = { ...wavg, derived: true };
}

/** Fill gross profit or COGS from the other line plus revenue when one side is tagged. */
function applyIncomeDerivations(metrics) {
  if (!metrics) return;
  const rev = val(metrics, 'revenue');
  let gp = val(metrics, 'gross_profit');
  let cogs = val(metrics, 'cogs');
  if (gp == null && rev != null && cogs != null) {
    metrics.gross_profit = derivedPointFrom(metrics.revenue || metrics.cogs, rev - cogs, DERIVED_GROSS_PROFIT_TAG);
    gp = rev - cogs;
  }
  if (cogs == null && rev != null && gp != null) {
    metrics.cogs = derivedPointFrom(metrics.revenue || metrics.gross_profit, rev - gp, DERIVED_COGS_TAG);
  }
}

function applyPriorMetricNormalizations(priorMetrics) {
  if (!priorMetrics?.values) return;
  const pseudo = {};
  for (const [key, v] of Object.entries(priorMetrics.values)) {
    if (typeof v === 'number' && Number.isFinite(v)) pseudo[key] = { val: v };
  }
  applyIncomeDerivations(pseudo);
  for (const [key, point] of Object.entries(pseudo)) {
    if (priorMetrics.values[key] == null && point && finiteVal(point.val)) {
      priorMetrics.values[key] = point.val;
    }
  }
}

/** Derived income lines and share fallbacks shared by fresh extracts and cached snapshots. */
export function normalizeMetrics(metrics, priorMetrics = null) {
  applyIncomeDerivations(metrics);
  applySharesFallback(metrics);
  applyPriorMetricNormalizations(priorMetrics);
}

export function computeRatios(metrics, priorRevenue) {
  const out = {};
  const rev = val(metrics, 'revenue');
  const gp = val(metrics, 'gross_profit');
  const oi = val(metrics, 'operating_income');
  const ni = val(metrics, 'net_income');
  const assets = val(metrics, 'assets');
  const equity = val(metrics, 'equity');
  const debt = debtStock(metrics);
  const cfo = val(metrics, 'cfo');
  const capex = val(metrics, 'capex');
  const rd = val(metrics, 'rd');
  const shares = val(metrics, 'shares_out');
  const rec = val(metrics, 'receivables');
  const prior = priorRevenue && typeof priorRevenue.val === 'number' ? priorRevenue.val : null;

  out.gross_margin = clampMargin(gp != null && rev ? gp / rev : null);
  out.operating_margin = clampMargin(oi != null && rev ? oi / rev : null);
  out.net_margin = clampMargin(ni != null && rev ? ni / rev : null);
  out.roa = ni != null && assets ? ni / assets : null;
  out.roe = ni != null && equity ? ni / equity : null;
  out.debt_equity = debt != null && equity ? debt / equity : null;
  out.debt_assets = debt != null && assets ? debt / assets : null;
  out.rd_intensity = rd != null && rev ? rd / rev : null;
  // CapEx is almost always a positive cash outflow in Company Facts.
  // If a filer stores it as a negative outflow, adding it is equivalent.
  out.fcf = cfo != null && capex != null ? (capex < 0 ? cfo + capex : cfo - capex) : null;
  out.fcf_margin = clampMargin(out.fcf != null && rev ? out.fcf / rev : null);
  out.cash_conversion = cfo != null && ni ? cfo / ni : null;
  out.capex_intensity = capex != null && rev ? Math.abs(capex) / rev : null;
  out.asset_turnover = rev != null && assets ? rev / assets : null;
  out.leverage = assets != null && equity ? assets / equity : null;
  out.book_value_ps = equity != null && shares ? equity / shares : null;
  out.receivables_days = rec != null && rev ? (365 * rec) / rev : null;
  out.revenue_yoy = rev != null && prior ? rev / prior - 1 : null;

  const tax = val(metrics, 'income_tax_expense');
  const pretax = val(metrics, 'pretax_income');
  out.effective_tax_rate =
    tax != null && pretax != null && pretax > 0 ? clamp(tax / pretax, -0.5, 0.8) : null;
  const debtStockVal = debtStock(metrics);
  const hasDebtTag = hasDebtPiece(metrics);
  const interestExp = val(metrics, 'interest_expense');
  out.implied_interest_rate =
    interestExp != null && hasDebtTag && debtStockVal > 0 ? clamp(interestExp / debtStockVal, 0, 0.4) : null;
  const div = val(metrics, 'dividends_paid');
  out.payout_ratio = div != null && ni != null && ni > 0 ? clamp(div / ni, 0, 5) : null;
  const nii = val(metrics, 'net_interest_income');
  const niiOther = val(metrics, 'noninterest_income');
  const nie = val(metrics, 'noninterest_expense');
  const bankRev = (nii || 0) + (niiOther || 0);
  out.efficiency_ratio =
    nie != null && (nii != null || niiOther != null) && bankRev > 0 ? clamp(nie / bankRev, 0, 5) : null;
  return out;
}

function clamp(n, lo, hi) {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}

export const MARGIN_KEYS = ['gross_margin', 'operating_margin', 'net_margin', 'fcf_margin'];

/** Margin as a fraction. Values outside ±100% are almost always a tag mismatch. */
export function plausibleMargin(v) {
  return v != null && Number.isFinite(v) && v <= 1 && v >= -1;
}

function clampMargin(v) {
  return plausibleMargin(v) ? v : null;
}

export const FLAG_COPY = {
  impossible_margin:
    'Over 100% (or below −100%) — the ingredients don’t match. Often a fee/subtotal revenue tag paired with total net income. Hidden instead of ranked as a leader.',
  thin_equity:
    'Check the equity base. ROE this high is often buybacks shrinking book value, not a 150% business.',
  fee_subtotal:
    'Revenue tag looks like a contract/fee subtotal, not total sales, so margin ratios are omitted.',
  bank_cash:
    'Not meaningful for banks — industrial FCF / cash conversion doesn’t apply. Use ROE and book.',
};

/**
 * Why a ratio was dashed or needs a footnote. Uses the raw tagged dollars,
 * so it still fires after computeRatios has nulled an impossible percent.
 */
export function sanityFlags(metrics, ratios) {
  const flags = {};
  const rev = val(metrics, 'revenue');
  const gp = val(metrics, 'gross_profit');
  const oi = val(metrics, 'operating_income');
  const ni = val(metrics, 'net_income');
  const cfo = val(metrics, 'cfo');
  const capex = val(metrics, 'capex');
  const fcf = cfo != null && capex != null ? (capex < 0 ? cfo + capex : cfo - capex) : null;
  const raw = {
    gross_margin: gp != null && rev ? gp / rev : null,
    operating_margin: oi != null && rev ? oi / rev : null,
    net_margin: ni != null && rev ? ni / rev : null,
    fcf_margin: fcf != null && rev ? fcf / rev : null,
  };
  for (const key of MARGIN_KEYS) {
    if (raw[key] != null && !plausibleMargin(raw[key])) flags[key] = 'impossible_margin';
  }
  const revTag = metrics?.revenue?.tag;
  if (
    revTag === 'RevenueFromContractWithCustomerExcludingAssessedTax' &&
    (flags.net_margin || flags.fcf_margin)
  ) {
    flags.revenue = 'fee_subtotal';
  }
  const roe = ratios?.roe;
  if (roe != null && Number.isFinite(roe) && Math.abs(roe) > 0.8) flags.roe = 'thin_equity';
  return flags;
}

export function periodEndOf(headlines) {
  return (
    headlines?.metrics?.revenue?.end ||
    headlines?.metrics?.net_income?.end ||
    headlines?.metrics?.assets?.end ||
    null
  );
}

export function formatPeriodEnd(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** 1 → 1st, 2 → 2nd, 3 → 3rd, 11–13 → th, else th. */
export function ordinal(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  const v = Math.abs(Math.round(num)) % 100;
  const d = v % 10;
  let suf = 'th';
  if (v < 11 || v > 13) {
    if (d === 1) suf = 'st';
    else if (d === 2) suf = 'nd';
    else if (d === 3) suf = 'rd';
  }
  return `${Math.round(num)}${suf}`;
}

/** Fill derived ratios (and implied liabilities) on a snapshot/API row so older snapshots pick up new formulas. */
export function ensureRatios(headlines) {
  if (!headlines?.metrics) return headlines;
  const metrics = headlines.metrics;
  const seriesAnnual = headlines.seriesAnnual ? { ...headlines.seriesAnnual } : {};
  applyDerivedGrossProfit(metrics, seriesAnnual, headlines.priorMetrics);
  applyImpliedLiabilities(metrics, seriesAnnual, headlines.priorMetrics);
  normalizeMetrics(metrics, headlines.priorMetrics);
  const ratios = computeRatios(metrics, headlines.priorRevenue);
  return {
    ...headlines,
    metrics,
    ratios,
    flags: sanityFlags(metrics, ratios),
    seriesAnnual,
    seriesQuarterly: headlines.seriesQuarterly || {},
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
  if (def.unit === 'pure') {
    const n = point.val;
    if (Math.abs(n) <= 1) return formatPercent(n);
    return `${n.toFixed(1)}%`;
  }
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

export function describePoint(point, def, label) {
  const name = label || def?.label || 'Value';
  if (!def || !point || typeof point.val !== 'number' || !Number.isFinite(point.val)) {
    return { key: def?.key || null, label: name, missing: true };
  }
  return {
    key: def.key,
    label: name,
    missing: false,
    val: point.val,
    shown: formatMetric(def, point),
    tag: point.tag || null,
    taxonomy: point.taxonomy || null,
    form: point.form || null,
    end: point.end || null,
    filed: point.filed || null,
  };
}

function metricDef(key) {
  return ALL_FILED_BY_KEY[key] || METRICS.find((m) => m.key === key) || null;
}

function derivedDef(key) {
  return ALL_DERIVED_BY_KEY[key] || DERIVED.find((d) => d.key === key) || null;
}

function partFor(headlines, key, label) {
  const def = metricDef(key);
  return describePoint(headlines?.metrics?.[key], def, label);
}

function fcfValue(cfo, capex) {
  if (cfo == null || capex == null) return null;
  return capex < 0 ? cfo + capex : cfo - capex;
}

function fcfOpShown(cfoShown, capexVal, capexShown) {
  if (capexVal == null) return `${cfoShown} − CapEx`;
  return capexVal < 0 ? `${cfoShown} + ${capexShown}` : `${cfoShown} − ${capexShown}`;
}

/**
 * Walk a ratio (or filed tag) back to the 10-K points that produced it.
 * Missing ingredients stay missing — never filled with zero.
 */
export function explainCalculation(headlines, key) {
  const filed = metricDef(key);
  if (filed) {
    const part = describePoint(headlines?.metrics?.[key], filed);
    return {
      key,
      kind: 'filed',
      formula: filed.tags,
      arithmetic: part.missing ? null : part.shown,
      result: part.missing ? null : part.shown,
      parts: [part],
    };
  }

  const def = derivedDef(key);
  if (!def) return null;

  const result = headlines?.ratios?.[key];
  const shown = formatDerived(def, result);
  const base = { key, kind: 'ratio', formula: def.formula, result: shown, arithmetic: null, parts: [] };

  if (key === 'fcf') {
    const cfo = partFor(headlines, 'cfo');
    const capex = partFor(headlines, 'capex');
    base.parts = [cfo, capex];
    if (!cfo.missing && !capex.missing && shown) {
      base.arithmetic = `${fcfOpShown(cfo.shown, capex.val, capex.shown)} = ${shown}`;
    }
    return base;
  }

  if (key === 'fcf_margin') {
    const cfo = partFor(headlines, 'cfo');
    const capex = partFor(headlines, 'capex');
    const rev = partFor(headlines, 'revenue');
    const fcf = fcfValue(cfo.missing ? null : cfo.val, capex.missing ? null : capex.val);
    const fcfShown = formatUsd(fcf);
    base.parts = [
      cfo,
      capex,
      { key: 'fcf', label: 'Free cash flow', missing: fcf == null, val: fcf, shown: fcfShown },
      rev,
    ];
    if (fcf != null && !rev.missing && shown) {
      base.arithmetic = `(${fcfOpShown(cfo.shown, capex.val, capex.shown)} = ${fcfShown}) ÷ ${rev.shown} = ${shown}`;
    }
    return base;
  }

  if (key === 'revenue_yoy') {
    const rev = partFor(headlines, 'revenue', 'This year’s revenue');
    const priorDef = metricDef('revenue');
    const prior = describePoint(headlines?.priorRevenue, priorDef, 'Last year’s revenue');
    base.parts = [rev, prior];
    if (!rev.missing && !prior.missing && shown) {
      base.arithmetic = `${rev.shown} ÷ ${prior.shown} − 1 = ${shown}`;
    }
    return base;
  }

  if (key === 'receivables_days') {
    const rec = partFor(headlines, 'receivables');
    const rev = partFor(headlines, 'revenue');
    base.parts = [rec, rev];
    if (!rec.missing && !rev.missing && shown) {
      base.arithmetic = `365 × ${rec.shown} ÷ ${rev.shown} = ${shown}`;
    }
    return base;
  }

  if (key === 'capex_intensity') {
    const capex = partFor(headlines, 'capex');
    const rev = partFor(headlines, 'revenue');
    base.parts = [capex, rev];
    if (!capex.missing && !rev.missing && shown) {
      base.arithmetic = `|${capex.shown}| ÷ ${rev.shown} = ${shown}`;
    }
    return base;
  }

  const pairs = {
    gross_margin: ['gross_profit', 'revenue'],
    operating_margin: ['operating_income', 'revenue'],
    net_margin: ['net_income', 'revenue'],
    roa: ['net_income', 'assets'],
    roe: ['net_income', 'equity'],
    debt_equity: ['long_term_debt', 'equity'],
    rd_intensity: ['rd', 'revenue'],
    cash_conversion: ['cfo', 'net_income'],
    asset_turnover: ['revenue', 'assets'],
    leverage: ['assets', 'equity'],
    debt_assets: ['long_term_debt', 'assets'],
    book_value_ps: ['equity', 'shares_out'],
  };
  const pair = pairs[key];
  if (!pair) return base;
  if (key === 'debt_equity' || key === 'debt_assets') {
    const debtTotal = debtStock(headlines?.metrics);
    const num = {
      key: 'interest_bearing_debt',
      label: 'Interest-bearing debt',
      missing: debtTotal == null,
      val: debtTotal,
      shown: formatUsd(debtTotal),
    };
    const den = partFor(headlines, pair[1]);
    base.parts = [num, den];
    if (!num.missing && !den.missing && shown) {
      base.arithmetic = `${num.shown} ÷ ${den.shown} = ${shown}`;
    }
    return base;
  }
  const num = partFor(headlines, pair[0]);
  const den = partFor(headlines, pair[1]);
  base.parts = [num, den];
  if (!num.missing && !den.missing && shown) {
    base.arithmetic = `${num.shown} ÷ ${den.shown} = ${shown}`;
  }
  return base;
}

export { METRICS, DERIVED };
