/**
 * Hyperscaler-only extractor. Browser-safe ESM (no node: imports).
 *
 * Parallel to fortune-500/extract.js on purpose: that snapshot is 473 filers
 * of income-statement teaching tags. This one keeps ~10 FY of cash, CapEx,
 * debt, leases, and debt proceeds for seven names.
 */
import { METRICS, SERIES_YEARS, isWatchFiling, filingArchiveUrl, companyByCik, formLabel } from './catalog.js';

export { isWatchFiling, formLabel };

const ANNUAL_FORMS = new Set(['10-K', '10-K/A']);
const MIN_ANNUAL_DAYS = 300;

export function yearOf(iso) {
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
  return true;
}

export function collectPoints(facts, def) {
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

export function pickForYear(points, targetYear) {
  const pool = points.filter((p) => yearOf(p.end) === targetYear);
  if (!pool.length) return null;
  pool.sort((a, b) => {
    const ai = a.candidateIndex ?? 99;
    const bi = b.candidateIndex ?? 99;
    if (ai !== bi) return ai - bi;
    return scorePoint(b, targetYear) - scorePoint(a, targetYear);
  });
  return pool[0];
}

export function inferAsOfYear(facts) {
  const revenue = METRICS.find((m) => m.key === 'revenue');
  const cfo = METRICS.find((m) => m.key === 'cfo');
  const ends = [
    ...collectPoints(facts, revenue).map((p) => p.end),
    ...collectPoints(facts, cfo).map((p) => p.end),
  ];
  let best = null;
  for (const end of ends) {
    if (!best || end > best) best = end;
  }
  return best ? yearOf(best) : null;
}

function slimPoint(p) {
  if (!p || typeof p.val !== 'number' || !Number.isFinite(p.val)) return null;
  return {
    val: p.val,
    tag: p.tag || null,
    form: p.form || null,
    end: p.end || null,
    filed: p.filed || null,
  };
}

export function numberOr(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** CapEx in Company Facts is usually a positive outflow. */
export function absCapex(val) {
  const n = numberOr(val);
  if (n == null) return null;
  return Math.abs(n);
}

export function fcfFrom(cfo, capex) {
  const cash = numberOr(cfo);
  const cap = numberOr(capex);
  if (cash == null || cap == null) return null;
  return cap < 0 ? cash + cap : cash - cap;
}

export function capexToCfo(cfo, capex) {
  const cash = numberOr(cfo);
  const cap = absCapex(capex);
  if (cash == null || cap == null || cash === 0) return null;
  return cap / cash;
}

function valOf(point) {
  return numberOr(point?.val);
}

export function deriveYear(metrics) {
  const cfo = valOf(metrics.cfo);
  const capex = valOf(metrics.capex);
  const revenue = valOf(metrics.revenue);
  const oi = valOf(metrics.operating_income);
  const assets = valOf(metrics.assets);
  const equity = valOf(metrics.equity);
  const ni = valOf(metrics.net_income);
  const fcf = fcfFrom(cfo, capex);
  const cap = absCapex(capex);
  return {
    fcf,
    capex_to_cfo: capexToCfo(cfo, capex),
    capex_intensity: cap != null && revenue ? cap / revenue : null,
    operating_margin: oi != null && revenue ? oi / revenue : null,
    net_margin: ni != null && revenue ? ni / revenue : null,
    asset_turnover: revenue != null && assets ? revenue / assets : null,
    roe: ni != null && equity ? ni / equity : null,
  };
}

/**
 * Lease liability is on the books after ASC 842. Remaining lease payments
 * are the undiscounted cousin — do not add them to the liability.
 */
export function icebergFrom(metrics) {
  const debt = valOf(metrics.long_term_debt);
  const opLease = valOf(metrics.operating_lease_liability);
  const finLease = valOf(metrics.finance_lease_liability);
  const leaseParts = [opLease, finLease].filter((n) => n != null);
  const leaseLiability = leaseParts.length ? leaseParts.reduce((a, b) => a + b, 0) : null;
  return {
    long_term_debt: debt,
    lease_liability: leaseLiability,
    remaining_lease_payments: valOf(metrics.remaining_lease_payments),
    purchase_obligation: valOf(metrics.purchase_obligation),
  };
}

export function fundingFrom(metrics) {
  const cfo = valOf(metrics.cfo);
  const capex = absCapex(valOf(metrics.capex));
  return {
    cfo,
    capex,
    fcf: fcfFrom(cfo, valOf(metrics.capex)),
    debt_proceeds: valOf(metrics.debt_proceeds),
    iceberg: icebergFrom(metrics),
  };
}

export function extractCompany(facts) {
  const asOfYear = inferAsOfYear(facts);
  const byKey = {};
  for (const def of METRICS) {
    byKey[def.key] = collectPoints(facts, def);
  }
  const years = [];
  if (asOfYear != null) {
    const start = asOfYear - (SERIES_YEARS - 1);
    for (let y = start; y <= asOfYear; y++) years.push(y);
  }
  const series = {};
  const latest = {};
  for (const def of METRICS) {
    series[def.key] = [];
    for (const y of years) {
      const p = slimPoint(pickForYear(byKey[def.key], y));
      if (p) series[def.key].push({ year: y, ...p });
    }
    latest[def.key] = asOfYear == null ? null : slimPoint(pickForYear(byKey[def.key], asOfYear));
  }
  const derivedSeries = years.map((year) => {
    const metrics = {};
    for (const def of METRICS) {
      const row = series[def.key].find((p) => p.year === year);
      metrics[def.key] = row || null;
    }
    return { year, ...deriveYear(metrics) };
  });
  return {
    cik: facts?.cik ?? null,
    entityName: facts?.entityName ?? null,
    asOfYear,
    latest,
    series,
    derivedSeries,
    derived: deriveYear(latest),
    funding: fundingFrom(latest),
    iceberg: icebergFrom(latest),
  };
}

export function eventsFromSubmissions(submissions, meta = {}) {
  const recent = submissions?.filings?.recent;
  if (!recent?.form || !Array.isArray(recent.form)) return [];
  const cik = Number(meta.cik ?? submissions.cik);
  const known = companyByCik(cik);
  const out = [];
  for (let i = 0; i < recent.form.length; i++) {
    const form = recent.form[i];
    const description = recent.primaryDocDescription?.[i] || null;
    const items = recent.items?.[i] || null;
    if (!isWatchFiling(form, description, items)) continue;
    const accession = recent.accessionNumber?.[i] || null;
    const filed = recent.filingDate?.[i] || null;
    const primaryDocument = recent.primaryDocument?.[i] || null;
    out.push({
      cik,
      ticker: meta.ticker || known?.ticker || null,
      name: meta.name || known?.name || submissions?.name || null,
      form,
      filed,
      accession,
      items,
      description: usefulDescription(form, description),
      url: filingArchiveUrl(cik, accession, primaryDocument),
    });
  }
  out.sort((a, b) => String(b.filed || '').localeCompare(String(a.filed || '')));
  return out;
}

function usefulDescription(form, description) {
  const d = String(description || '').trim();
  if (!d) return null;
  if (d.toUpperCase() === String(form || '').toUpperCase()) return null;
  return d;
}

/** Collapse same-issuer, same-day 424B + FWP pairs into one takedown. */
export function groupOfferingEvents(events) {
  const map = new Map();
  for (const e of events || []) {
    const key = `${e.cik}|${e.filed}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        cik: e.cik,
        ticker: e.ticker,
        name: e.name,
        filed: e.filed,
        forms: [e.form],
        accession: e.accession,
        items: e.items || null,
        description: e.description || null,
        url: e.url,
        count: 1,
      });
      continue;
    }
    existing.count += 1;
    if (e.form && !existing.forms.includes(e.form)) existing.forms.push(e.form);
    if (!existing.description && e.description) existing.description = e.description;
    if (!existing.url && e.url) existing.url = e.url;
  }
  return [...map.values()].sort((a, b) => String(b.filed || '').localeCompare(String(a.filed || '')));
}

export function offeringHeadline(event) {
  const labels = [...new Set((event.forms || [event.form]).filter(Boolean).map(formLabel))];
  if (event.count > 1 && labels.length) {
    return `${labels.join(' + ')} (${event.count} filings)`;
  }
  if (event.description) return event.description;
  return labels[0] || event.form || 'Filing';
}

export function slimEftsHit(hit, phrase) {
  const src = hit?._source || {};
  const adsh = src.adsh || (hit?._id || '').split(':')[0] || null;
  const cik = Number((src.ciks && src.ciks[0]) || 0) || null;
  const primary = (hit?._id || '').split(':')[1] || null;
  return {
    phrase: phrase?.label || phrase?.id || null,
    cik,
    ticker: companyByCik(cik)?.ticker || null,
    name: companyByCik(cik)?.name || (src.display_names && src.display_names[0]) || null,
    form: src.form || src.file_type || null,
    filed: src.file_date || null,
    accession: adsh,
    url: filingArchiveUrl(cik, adsh, primary),
  };
}

export function latestFootnoteHits(hits) {
  const map = new Map();
  for (const h of hits || []) {
    const key = `${h.cik}|${h.phrase}`;
    const prev = map.get(key);
    if (!prev || String(h.filed || '') > String(prev.filed || '')) map.set(key, h);
  }
  return [...map.values()].sort((a, b) => String(b.filed || '').localeCompare(String(a.filed || '')));
}

export function sumLatest(companies, key, { roles } = {}) {
  let total = 0;
  let n = 0;
  for (const row of companies) {
    if (roles && !roles.includes(row.role)) continue;
    const v = numberOr(row.extracted?.latest?.[key]?.val);
    if (v == null) continue;
    total += key === 'capex' ? Math.abs(v) : v;
    n += 1;
  }
  return n ? total : null;
}

export function gdpShare(capexSum, gdp) {
  const cap = numberOr(capexSum);
  const g = numberOr(gdp);
  if (cap == null || !g) return null;
  return cap / g;
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

export function formatPercent(n, { signed = false, digits = 0 } = {}) {
  if (n == null || !Number.isFinite(n)) return null;
  const pct = (Math.abs(n) * 100).toFixed(digits) + '%';
  if (!signed) return `${n < 0 ? '−' : ''}${pct}`;
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${pct}`;
}

export function formatCentsPerDollar(share) {
  if (share == null || !Number.isFinite(share)) return null;
  const cents = share * 100;
  if (cents >= 1) return `${cents.toFixed(1)}¢`;
  return `${cents.toFixed(2)}¢`;
}

export function formatPeriodEnd(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export { METRICS };
