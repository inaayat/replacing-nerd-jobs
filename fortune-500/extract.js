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
  for (let i = 0; i < def.candidates.length; i++) {
    const cand = def.candidates[i];
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
          candidateIndex: i,
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
  for (const def of METRICS) {
    const points = collectPoints(facts, def);
    metrics[def.key] = asOfYear == null ? null : pickForYear(points, asOfYear);
    // A 10-K restates the year before it, which is the second column of every
    // statement. Keep it as a slim value map: enough for a FY-1 column and
    // year-over-year math without doubling the snapshot.
    const prior = asOfYear == null ? null : pickForYear(points, asOfYear - 1);
    if (def.key === 'revenue') priorRevenue = prior;
    if (prior && typeof prior.val === 'number' && Number.isFinite(prior.val)) {
      priorValues[def.key] = prior.val;
    }
  }
  const priorMetrics =
    asOfYear != null && Object.keys(priorValues).length
      ? { year: asOfYear - 1, values: priorValues }
      : null;
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
  return out;
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

/** Fill derived ratios on a snapshot/API row so older snapshots pick up new formulas. */
export function ensureRatios(headlines) {
  if (!headlines?.metrics) return headlines;
  const ratios = computeRatios(headlines.metrics, headlines.priorRevenue);
  return {
    ...headlines,
    ratios,
    flags: sanityFlags(headlines.metrics, ratios),
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
  return METRICS.find((m) => m.key === key) || null;
}

function derivedDef(key) {
  return DERIVED.find((d) => d.key === key) || null;
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
  const num = partFor(headlines, pair[0]);
  const den = partFor(headlines, pair[1]);
  base.parts = [num, den];
  if (!num.missing && !den.missing && shown) {
    base.arithmetic = `${num.shown} ÷ ${den.shown} = ${shown}`;
  }
  return base;
}

export { METRICS, DERIVED };
