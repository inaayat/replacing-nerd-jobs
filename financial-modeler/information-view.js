/**
 * Pure helpers for the Financial Modeler filings (reference) page.
 * Browser-safe ESM — no Node APIs. Imported by information.js and tests.
 */

export const GROUP_TONE = {
  core_income: 'income',
  core_pershare: 'income',
  income_detail: 'income',
  core_balance: 'balance',
  balance_sheet: 'balance',
  core_cashflow: 'cash',
  leases: 'lease',
  financing: 'finance',
  bank: 'bank',
  ratios_core: 'ratio',
  ratios_extended: 'ratio',
  segments: 'segment',
};

export function padCik(cik) {
  const raw = String(cik ?? '').replace(/\D/g, '');
  return raw ? raw.padStart(10, '0') : '';
}

export function accessionNoDashes(accession) {
  return String(accession || '').replace(/-/g, '');
}

function compactDate(iso) {
  const s = String(iso || '').slice(0, 10).replace(/-/g, '');
  return /^\d{8}$/.test(s) ? s : '';
}

/** Add whole days to an ISO date (YYYY-MM-DD), UTC. */
export function addDaysIso(iso, days) {
  const t = Date.parse(`${String(iso || '').slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + Number(days) * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function companyFactsUrl(cik, fallback) {
  if (fallback) return fallback;
  const pad = padCik(cik);
  return pad ? `https://data.sec.gov/api/xbrl/companyfacts/CIK${pad}.json` : '';
}

export function companyConceptUrl(cik, taxonomy, tag) {
  const pad = padCik(cik);
  if (!pad || !taxonomy || !tag) return '';
  return `https://data.sec.gov/api/xbrl/companyconcept/CIK${pad}/${encodeURIComponent(taxonomy)}/${encodeURIComponent(tag)}.json`;
}

/**
 * EDGAR company-filings search. `dateb` is “filed before”, so we bump the
 * filing date by one day when we have it — that surfaces this 10-K/10-Q near
 * the top without needing an accession number.
 */
export function edgarBrowseUrl({ cik, form, filed, browse } = {}) {
  const pad = padCik(cik);
  if (!pad && browse) return browse;
  if (!pad) return '';
  const type = form || '10-K';
  const dateb = filed ? compactDate(addDaysIso(filed, 1)) : '';
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${pad}&type=${encodeURIComponent(type)}&dateb=${dateb}&owner=include&count=10`;
}

export function filingArchiveUrl(cik, accession, primary) {
  if (cik == null || !accession || !primary) return '';
  const n = Number(String(cik).replace(/\D/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '';
  const file = String(primary).replace(/^\/+/, '');
  return `https://www.sec.gov/Archives/edgar/data/${n}/${accessionNoDashes(accession)}/${file}`;
}

/** Inline XBRL viewer — the tagged line in the HTML filing, not a PDF page. */
export function inlineXbrlUrl(cik, accession, primary) {
  const archive = filingArchiveUrl(cik, accession, primary);
  if (!archive) return '';
  const path = archive.replace('https://www.sec.gov', '');
  return `https://www.sec.gov/ix?doc=${path}`;
}

export function metricSearchHaystack(def, point = null, extra = '') {
  const taxonomy = point?.taxonomy;
  const tag = point?.tag || def?.tags;
  return [
    def?.label,
    def?.key,
    def?.student,
    def?.plain,
    def?.tags,
    def?.formula,
    point?.tag,
    point?.taxonomy,
    point?.form,
    taxonomy && tag ? `${taxonomy}:${tag}` : '',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function metricMatchesQuery(query, def, point, extra) {
  const needle = String(query || '')
    .trim()
    .toLowerCase();
  if (!needle) return true;
  return metricSearchHaystack(def, point, extra).includes(needle);
}

export function annualSeries(headlines, key) {
  const rows = headlines?.seriesAnnual?.[key];
  return Array.isArray(rows) ? rows : [];
}

export function quarterlySeries(headlines, key) {
  const rows = headlines?.seriesQuarterly?.[key];
  return Array.isArray(rows) ? rows : [];
}

export function hasExpandableSeries(headlines, key) {
  return annualSeries(headlines, key).length > 0 || quarterlySeries(headlines, key).length > 0;
}

/**
 * Human links for “where to find it”. Company Facts do not store a PDF page
 * number; the inline XBRL viewer is the closest jump-to-the-line we can offer.
 */
/** One human-readable jump: exact fact when indexed, otherwise the viewer. */
export function filingSourceLinks({ company, point, def, filing } = {}) {
  const cik = company?.cik;
  const form = point?.form || filing?.form || company?.form || '10-K';
  const accession = filing?.accession;
  const primary = filing?.primary;
  if (!accession || !primary) return [];
  const factId = def?.key && point?.end ? filing?.factAnchors?.[def.key]?.[point.end] : '';
  if (factId) {
    const archive = filingArchiveUrl(cik, accession, primary);
    if (!archive) return [];
    return [{
      href: `${archive}#${encodeURIComponent(factId)}`,
      label: `Open exact line in ${form}`,
      kind: 'document',
    }];
  }
  const html = inlineXbrlUrl(cik, accession, primary);
  if (!html) return [];
  return [{ href: html, label: `Open ${form} (inline XBRL)`, kind: 'document' }];
}

/**
 * Turn addends into a stacked equation. First row has no operator (or − if
 * negative); later rows are + or −. `tiesTotal` is whether the sum matches
 * `total` within 0.5% — used so incomplete liability pieces are not sold as
 * a roll-up.
 */
export function stackedAddends(parts, total = null) {
  const rows = [];
  for (const part of parts || []) {
    const val = part?.val;
    if (typeof val !== 'number' || !Number.isFinite(val)) continue;
    rows.push({
      op: rows.length === 0 ? (val < 0 ? '−' : '') : val < 0 ? '−' : '+',
      label: part.label || part.key || '',
      key: part.key || '',
      val,
      abs: Math.abs(val),
    });
  }
  const sum = rows.reduce((n, r) => n + r.val, 0);
  const hasTotal = typeof total === 'number' && Number.isFinite(total);
  const tiesTotal =
    hasTotal && rows.length > 0
      ? total === 0
        ? Math.abs(sum) < 1
        : Math.abs(sum - total) / Math.abs(total) <= 0.005
      : false;
  return { rows, sum, total: hasTotal ? total : null, tiesTotal };
}

export function filedTagsApiUrl(cik) {
  return `/api/fortune-500?route=filed&cik=${Number(cik)}`;
}

/** sessionStorage key for cached filed-tags API payloads. */
export function filedTagsCacheKey(cik, fy) {
  return `fm-filed-tags:${cik}:${fy ?? 'na'}`;
}

/** Filter filed-tag rows (All / Mapped / Unmapped + search). */
export function filterFiledTagRows(rows, { query = '', filter = 'all' } = {}) {
  const needle = String(query || '')
    .trim()
    .toLowerCase();
  return (rows || []).filter((row) => {
    if (filter === 'mapped' && !row.mappedKey) return false;
    if (filter === 'unmapped' && row.mappedKey) return false;
    if (!needle) return true;
    const hay = [row.tag, row.label, row.taxonomy, row.mappedKey, row.mappedLabel]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(needle);
  });
}

/** Human summary for the filed-tags panel header. */
export function filedTagsCountLabel(counts) {
  const filed = counts?.filed ?? 0;
  const mapped = counts?.mapped ?? 0;
  const unmapped = counts?.unmapped ?? filed - mapped;
  return `${filed} filed · ${mapped} mapped · ${unmapped} not in our catalog`;
}
